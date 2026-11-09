//! cpal による実時間オーディオ I/O と [`engine::Engine`] の駆動。
//!
//! ## スレッド構成
//! cpal の `Stream` は多くのプラットフォームで `!Send` なため、専用スレッド内で
//! 生成・保持する（他スレッドへ渡さない）。UI 側（Tauri コマンド）とは Send な
//! チャネル / atomics だけでやり取りする:
//! - UI → 音声: [`Command`] を `crossbeam-channel` で送信し、出力コールバックが
//!   ブロック先頭で drain して適用する。
//! - マイク入力 → 出力: 入力コールバックが lock-free リングバッファへ push し、
//!   出力コールバックが pop する（唯一のエンジン所有者は出力コールバック）。
//! - 音声 → UI: [`Status`] の atomics に書き、UI がポーリングで読む。

use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicUsize, Ordering};
use std::sync::Arc;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam_channel::{Receiver, Sender};
use engine::Engine;
use ringbuf::HeapRb;

/// ループの最大長（秒）。トラックバッファはこの長さ分を事前確保する。
pub const MAX_LOOP_SECONDS: usize = 60;

/// UI → 音声スレッドへのコマンド。出力コールバックがブロック先頭で適用する。
pub enum Command {
    /// 事前確保済みバッファ付きでトラック追加。
    AddTrack { id: u64, buf: Box<[f32]> },
    DeleteTrack { id: u64 },
    SetMute { id: u64, muted: bool },
    /// 指定トラックへ上書き録音開始。
    StartRecord { id: u64 },
    StopRecord,
    SetPlaying(bool),
}

/// 音声スレッド → UI の状態（lock-free）。
pub struct Status {
    pub playhead: AtomicUsize,
    pub loop_len: AtomicUsize,
    pub playing: AtomicBool,
    pub recording: AtomicBool,
    /// 録音が終了したことのラッチ。UI が読み取り時にクリアする。
    pub record_finished: AtomicBool,
    /// 録音中トラックの id。-1 = 無し。
    pub armed_id: AtomicI64,
    /// 入力ピークレベルを f32 の bit 表現で保持。
    pub input_level_bits: AtomicU32,
}

impl Status {
    fn new() -> Self {
        Status {
            playhead: AtomicUsize::new(0),
            loop_len: AtomicUsize::new(0),
            playing: AtomicBool::new(false),
            recording: AtomicBool::new(false),
            record_finished: AtomicBool::new(false),
            armed_id: AtomicI64::new(-1),
            input_level_bits: AtomicU32::new(0),
        }
    }
    pub fn input_level(&self) -> f32 {
        f32::from_bits(self.input_level_bits.load(Ordering::Relaxed))
    }
}

/// UI 側が保持する音声スレッドへのハンドル（すべて `Send`）。
pub struct AudioHandle {
    cmd_tx: Sender<Command>,
    pub status: Arc<Status>,
    /// 削除されたトラックのバッファを非 RT 側で回収するためのチャネル。
    free_rx: Receiver<Box<[f32]>>,
    pub sample_rate: u32,
    /// 1 トラックあたりのバッファ長（フレーム）。
    pub max_frames: usize,
}

impl AudioHandle {
    pub fn send(&self, cmd: Command) {
        let _ = self.cmd_tx.send(cmd);
        // 回収チャネルをここで drain して古いバッファを drop する。
        while self.free_rx.try_recv().is_ok() {}
    }

    /// 事前ゼロ初期化済みのトラックバッファを 1 本ぶん確保する。
    pub fn alloc_track_buffer(&self) -> Box<[f32]> {
        vec![0.0f32; self.max_frames].into_boxed_slice()
    }
}

/// 音声スレッドを起動しストリームを開く。デバイスが無い等で失敗したら `Err`。
pub fn spawn() -> Result<AudioHandle, String> {
    let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded::<Command>();
    let (free_tx, free_rx) = crossbeam_channel::unbounded::<Box<[f32]>>();
    let status = Arc::new(Status::new());
    let status_thread = status.clone();

    // デバイスを開くまで sample_rate は不明なので、スレッドから受け取る。
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<u32, String>>();

    std::thread::Builder::new()
        .name("looper-audio".into())
        .spawn(move || {
            match build_streams(cmd_rx, free_tx, status_thread) {
                Ok((sample_rate, _in_stream, _out_stream)) => {
                    let _ = ready_tx.send(Ok(sample_rate));
                    // ストリームを生かし続けるためスレッドを park し続ける。
                    // （`_in_stream` / `_out_stream` はここで所有され drop されない）
                    loop {
                        std::thread::park();
                    }
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                }
            }
        })
        .map_err(|e| format!("音声スレッドの起動に失敗: {e}"))?;

    let sample_rate = ready_rx
        .recv()
        .map_err(|_| "音声スレッドが応答しません".to_string())??;
    let max_frames = sample_rate as usize * MAX_LOOP_SECONDS;

    Ok(AudioHandle {
        cmd_tx,
        status,
        free_rx,
        sample_rate,
        max_frames,
    })
}

/// 入出力ストリームを構築して再生開始する。戻り値のストリームは呼び出し側が保持する。
fn build_streams(
    cmd_rx: Receiver<Command>,
    free_tx: Sender<Box<[f32]>>,
    status: Arc<Status>,
) -> Result<(u32, cpal::Stream, cpal::Stream), String> {
    let host = cpal::default_host();
    let input_device = host
        .default_input_device()
        .ok_or("入力デバイス（マイク）が見つかりません")?;
    let output_device = host
        .default_output_device()
        .ok_or("出力デバイスが見つかりません")?;

    let in_supported = input_device
        .default_input_config()
        .map_err(|e| format!("入力設定の取得に失敗: {e}"))?;
    let out_supported = output_device
        .default_output_config()
        .map_err(|e| format!("出力設定の取得に失敗: {e}"))?;

    // v1 は f32 前提。既定フォーマットが f32 でなければ明示的にエラーにする。
    if in_supported.sample_format() != cpal::SampleFormat::F32
        || out_supported.sample_format() != cpal::SampleFormat::F32
    {
        return Err("既定の音声フォーマットが f32 ではありません（v1 は f32 のみ対応）".into());
    }

    let sample_rate = out_supported.sample_rate().0;
    if in_supported.sample_rate().0 != sample_rate {
        // サンプルレートが食い違うとループのタイミングがずれる。リサンプリングは未対応。
        eprintln!(
            "警告: 入力({} Hz) と出力({} Hz) のサンプルレートが異なります。タイミングがずれる可能性があります。",
            in_supported.sample_rate().0,
            sample_rate
        );
    }

    let in_channels = in_supported.channels() as usize;
    let out_channels = out_supported.channels() as usize;
    let in_config: cpal::StreamConfig = in_supported.config();
    let out_config: cpal::StreamConfig = out_supported.config();

    // マイク（モノラル化）→ 出力コールバックへのリングバッファ。
    let ring_capacity = (sample_rate as usize / 4).max(8192); // 約 0.25 秒ぶん
    let rb = HeapRb::<f32>::new(ring_capacity);
    let (mut producer, mut consumer) = rb.split();

    // --- 入力コールバック: チャンネル 0 を取り出してリングへ push するだけ。---
    let mut mono_in: Vec<f32> = Vec::with_capacity(8192);
    let input_stream = input_device
        .build_input_stream(
            &in_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                mono_in.clear();
                for frame in data.chunks(in_channels) {
                    mono_in.push(frame[0]);
                }
                // 溢れた分は捨てる（消費が追いつかない場合）。
                let _ = producer.push_slice(&mono_in);
            },
            |err| eprintln!("入力ストリームエラー: {err}"),
            None,
        )
        .map_err(|e| format!("入力ストリーム構築に失敗: {e}"))?;

    // --- 出力コールバック: エンジンの唯一の所有者。---
    let mut engine = Engine::new();
    let mut mic_scratch: Vec<f32> = vec![0.0; 8192];
    let mut mono_out: Vec<f32> = vec![0.0; 8192];

    let output_stream = output_device
        .build_output_stream(
            &out_config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                let frames = data.len() / out_channels;
                if mic_scratch.len() < frames {
                    mic_scratch.resize(frames, 0.0);
                    mono_out.resize(frames, 0.0);
                }
                // 出力/入力バッファ 1 周ぶんを往復遅延の概算とする（実測は困難なため推定）。
                let comp = frames.saturating_mul(2).max(1);

                // 1) コマンド適用。
                while let Ok(cmd) = cmd_rx.try_recv() {
                    match cmd {
                        Command::AddTrack { id, buf } => engine.add_track(id, buf),
                        Command::DeleteTrack { id } => {
                            if let Some(buf) = engine.delete_track(id) {
                                let _ = free_tx.send(buf);
                            }
                        }
                        Command::SetMute { id, muted } => engine.set_mute(id, muted),
                        Command::StartRecord { id } => engine.start_record(id, comp),
                        Command::StopRecord => engine.stop_record(),
                        Command::SetPlaying(p) => engine.set_playing(p),
                    }
                }

                // 2) マイク入力をリングから取得（不足分は無音）。
                let got = consumer.pop_slice(&mut mic_scratch[..frames]);
                for s in mic_scratch[got..frames].iter_mut() {
                    *s = 0.0;
                }

                // 3) 処理してモノラル出力を得る。
                engine.process(&mic_scratch[..frames], &mut mono_out[..frames]);

                // 4) 全出力チャンネルへ複製。
                for (f, frame) in data.chunks_mut(out_channels).enumerate() {
                    let v = mono_out[f];
                    for ch in frame.iter_mut() {
                        *ch = v;
                    }
                }

                // 5) 状態を publish。
                status.playhead.store(engine.playhead(), Ordering::Relaxed);
                status.loop_len.store(engine.loop_len(), Ordering::Relaxed);
                status.playing.store(engine.is_playing(), Ordering::Relaxed);
                status.recording.store(engine.is_recording(), Ordering::Relaxed);
                status
                    .armed_id
                    .store(engine.armed_id().map(|v| v as i64).unwrap_or(-1), Ordering::Relaxed);
                status
                    .input_level_bits
                    .store(engine.input_peak().to_bits(), Ordering::Relaxed);
                if engine.take_record_finished() {
                    status.record_finished.store(true, Ordering::Relaxed);
                }
            },
            |err| eprintln!("出力ストリームエラー: {err}"),
            None,
        )
        .map_err(|e| format!("出力ストリーム構築に失敗: {e}"))?;

    input_stream
        .play()
        .map_err(|e| format!("入力ストリーム開始に失敗: {e}"))?;
    output_stream
        .play()
        .map_err(|e| format!("出力ストリーム開始に失敗: {e}"))?;

    Ok((sample_rate, input_stream, output_stream))
}
