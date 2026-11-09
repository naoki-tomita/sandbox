//! Looper のリアルタイム DSP コア。
//!
//! このクレートは `tauri` / `cpal` に依存しない純粋な Rust ロジックで、オーディオ
//! ハードウェア無しに `cargo test` で全挙動を検証できる。実アプリでは `audio.rs` の
//! 出力コールバックがブロック単位で [`Engine::process`] を呼ぶ。
//!
//! ## 設計
//! - トラックは長さ `capacity`（= 最大ループ長フレーム数）のモノラル f32 バッファ。
//!   バッファ確保は非リアルタイム側で行い、[`Engine::add_track`] に move で渡す
//!   （出力コールバック内で allocation しないため）。
//! - `loop_len` は「最初に録音したトラック」の録音長で確定する（0 = 未確定）。
//! - オーバーダブ録音は往復レイテンシー `comp` フレーム分ぶんだけ **早い** 位置へ
//!   書き込み、モニタリング→発音→入力の遅延で後ろへずれるのを打ち消す。

/// 1 トラック分の状態。`buf` は容量 = 最大ループ長で確保済み。
pub struct Track {
    pub id: u64,
    pub buf: Box<[f32]>,
    pub muted: bool,
}

/// 進行中の録音状態。
struct Rec {
    /// 録音対象トラックの index（`process` の外で tracks が変わらない前提でキャッシュ）。
    idx: usize,
    /// このトラックがループ長を定義する最初の録音か。
    first: bool,
    /// レイテンシー補正量（フレーム）。オーバーダブでのみ使用。
    comp: usize,
    /// 書き込んだフレーム数。first は容量到達で、オーバーダブは 1 周で自動停止。
    written: usize,
}

/// ルーパーのオーディオエンジン。出力コールバックがブロック単位で駆動する。
pub struct Engine {
    tracks: Vec<Track>,
    /// 0 = ループ長未確定。確定後は `1..=capacity`。
    loop_len: usize,
    /// 再生位置。`0..loop_len` を wrap する。
    playhead: usize,
    /// トランスポート再生中か。
    playing: bool,
    rec: Option<Rec>,
    /// 録音が終了したことを UI へ通知するラッチ（読み取りでクリア）。
    record_finished: bool,
    /// 直近ブロックの入力ピークレベル（メータ用）。
    input_peak: f32,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    pub fn new() -> Self {
        Engine {
            tracks: Vec::with_capacity(256),
            loop_len: 0,
            playhead: 0,
            playing: false,
            rec: None,
            record_finished: false,
            input_peak: 0.0,
        }
    }

    // ---- 問い合わせ ----

    pub fn loop_len(&self) -> usize {
        self.loop_len
    }
    pub fn playhead(&self) -> usize {
        self.playhead
    }
    pub fn is_playing(&self) -> bool {
        self.playing
    }
    pub fn is_recording(&self) -> bool {
        self.rec.is_some()
    }
    /// 現在録音中トラックの id（無ければ None）。
    pub fn armed_id(&self) -> Option<u64> {
        self.rec.as_ref().map(|r| self.tracks[r.idx].id)
    }
    pub fn input_peak(&self) -> f32 {
        self.input_peak
    }
    /// 「録音が終了した」ラッチを読み取ってクリアする。
    pub fn take_record_finished(&mut self) -> bool {
        std::mem::take(&mut self.record_finished)
    }
    pub fn track_ids(&self) -> Vec<u64> {
        self.tracks.iter().map(|t| t.id).collect()
    }

    // ---- 制御（コマンド経由で呼ばれる。process の外側で実行される想定） ----

    /// 事前確保済みバッファでトラックを追加する。
    pub fn add_track(&mut self, id: u64, buf: Box<[f32]>) {
        self.tracks.push(Track {
            id,
            buf,
            muted: false,
        });
    }

    /// トラックを削除し、バッファを呼び出し側へ返す（非 RT 側で drop してもらう）。
    /// 全トラックが無くなったらループ長をリセットする。
    pub fn delete_track(&mut self, id: u64) -> Option<Box<[f32]>> {
        let idx = self.tracks.iter().position(|t| t.id == id)?;
        // 録音中のトラックを消すなら録音を中断。
        if let Some(rec) = &self.rec {
            if rec.idx == idx {
                self.rec = None;
                self.record_finished = true;
            }
        }
        let removed = self.tracks.swap_remove(idx);
        // swap_remove で index がずれるので、録音中の idx を貼り直す。
        if let Some(rec) = &mut self.rec {
            if rec.idx == self.tracks.len() {
                // 末尾要素が idx へ移動していた場合。
                rec.idx = idx;
            }
        }
        if self.tracks.is_empty() {
            self.loop_len = 0;
            self.playhead = 0;
            self.playing = false;
        }
        Some(removed.buf)
    }

    pub fn set_mute(&mut self, id: u64, muted: bool) {
        if let Some(t) = self.tracks.iter_mut().find(|t| t.id == id) {
            t.muted = muted;
        }
    }

    pub fn set_playing(&mut self, playing: bool) {
        self.playing = playing;
    }

    /// 指定トラックへ上書き録音を開始する。古い録音は消去される。
    /// `comp` は往復レイテンシー補正（フレーム、オーバーダブでのみ有効）。
    pub fn start_record(&mut self, id: u64, comp: usize) {
        let Some(idx) = self.tracks.iter().position(|t| t.id == id) else {
            return;
        };
        // 上書き: 対象トラックのバッファをゼロ消去。
        for s in self.tracks[idx].buf.iter_mut() {
            *s = 0.0;
        }
        let first = self.loop_len == 0;
        if first {
            // 最初の録音は先頭から順次追記。位置合わせのため playhead を 0 に。
            self.playhead = 0;
        } else {
            // オーバーダブはループを聴きながら録るので再生を開始。
            self.playing = true;
        }
        self.rec = Some(Rec {
            idx,
            first,
            comp,
            written: 0,
        });
    }

    /// 録音を停止する。最初の録音ならその長さでループ長を確定し再生を開始する。
    pub fn stop_record(&mut self) {
        if let Some(rec) = self.rec.take() {
            if rec.first {
                self.finalize_first_loop(rec.written);
            }
            self.record_finished = true;
        }
    }

    fn finalize_first_loop(&mut self, written: usize) {
        if written > 0 {
            self.loop_len = written;
            self.playhead = 0;
            self.playing = true;
        }
    }

    // ---- リアルタイム処理 ----

    /// 1 ブロック処理する。`mic` と `out` は同じフレーム数（モノラル）。
    /// `mic` はマイク入力、`out` へミックス結果を書き込む。
    pub fn process(&mut self, mic: &[f32], out: &mut [f32]) {
        let n = mic.len().min(out.len());
        let mut peak = 0.0f32;

        for i in 0..n {
            let m = mic[i];
            let a = m.abs();
            if a > peak {
                peak = a;
            }

            // --- 録音 ---
            if let Some(rec) = self.rec.as_mut() {
                if rec.first {
                    let cap = self.tracks[rec.idx].buf.len();
                    if rec.written < cap {
                        self.tracks[rec.idx].buf[rec.written] = m;
                        rec.written += 1;
                    }
                    // 最大長（容量）に到達したら自動停止しループ長を確定。
                    if rec.written >= cap {
                        let written = rec.written;
                        self.rec = None;
                        self.finalize_first_loop(written);
                        self.record_finished = true;
                    }
                } else {
                    // オーバーダブ: 往復遅延ぶん早い位置へ書く。
                    let comp = rec.comp % self.loop_len;
                    let pos = (self.playhead + self.loop_len - comp) % self.loop_len;
                    self.tracks[rec.idx].buf[pos] = m;
                    rec.written += 1;
                    // ループ 1 周ぶん録ったら自動停止（= 最大時間到達）。
                    if rec.written >= self.loop_len {
                        self.rec = None;
                        self.record_finished = true;
                    }
                }
            }

            // --- 再生ミックス ---
            let mut s = 0.0f32;
            if self.playing && self.loop_len > 0 {
                for t in &self.tracks {
                    if !t.muted {
                        s += t.buf[self.playhead];
                    }
                }
                self.playhead = (self.playhead + 1) % self.loop_len;
            }
            out[i] = s.clamp(-1.0, 1.0);
        }

        self.input_peak = peak;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn buf(n: usize) -> Box<[f32]> {
        vec![0.0f32; n].into_boxed_slice()
    }

    /// 出力を捨てて mic ブロックを流す。
    fn feed(eng: &mut Engine, mic: &[f32]) {
        let mut out = vec![0.0; mic.len()];
        eng.process(mic, &mut out);
    }

    #[test]
    fn first_track_defines_loop_length() {
        let mut eng = Engine::new();
        eng.add_track(1, buf(100));
        eng.start_record(1, 0);
        assert!(eng.is_recording());
        feed(&mut eng, &[0.1, 0.2, 0.3, 0.4]);
        eng.stop_record();
        assert_eq!(eng.loop_len(), 4);
        assert!(eng.is_playing());
        assert!(!eng.is_recording());
    }

    #[test]
    fn first_track_auto_stops_at_capacity() {
        let mut eng = Engine::new();
        eng.add_track(1, buf(4)); // 容量 4 = 最大長
        eng.start_record(1, 0);
        feed(&mut eng, &[0.1, 0.2, 0.3, 0.4, 0.5, 0.6]); // 容量超過
        assert!(!eng.is_recording(), "容量到達で自動停止する");
        assert_eq!(eng.loop_len(), 4);
        assert!(eng.take_record_finished());
    }

    #[test]
    fn playback_mixes_unmuted_and_skips_muted() {
        let mut eng = Engine::new();
        // トラック1: 定数 0.5 のループを録音。
        eng.add_track(1, buf(8));
        eng.start_record(1, 0);
        feed(&mut eng, &[0.5, 0.5, 0.5, 0.5]);
        eng.stop_record();
        // トラック2: 定数 0.3 を上書き録音（オーバーダブ、comp=0）。
        eng.add_track(2, buf(8));
        eng.set_playing(true);
        eng.start_record(2, 0);
        feed(&mut eng, &[0.3, 0.3, 0.3, 0.3]); // ちょうど 1 周
        assert!(!eng.is_recording(), "1 周で自動停止");

        // 両方鳴らすと 0.8。
        let mut out = vec![0.0; 4];
        eng.set_playing(true);
        eng.process(&[0.0; 4], &mut out);
        for &v in &out {
            assert!((v - 0.8).abs() < 1e-6, "got {v}");
        }
        // トラック2 をミュートすると 0.5。
        eng.set_mute(2, true);
        eng.process(&[0.0; 4], &mut out);
        for &v in &out {
            assert!((v - 0.5).abs() < 1e-6, "got {v}");
        }
    }

    #[test]
    fn overwrite_erases_old_recording() {
        let mut eng = Engine::new();
        eng.add_track(1, buf(8));
        eng.start_record(1, 0);
        feed(&mut eng, &[0.9, 0.9, 0.9, 0.9]);
        eng.stop_record();
        assert_eq!(eng.loop_len(), 4);

        // 同じトラックを上書き録音。今度は 2 フレームだけ入れて途中停止。
        eng.start_record(1, 0);
        feed(&mut eng, &[0.1, 0.1]);
        eng.stop_record();

        // 上書きで残り（index 2,3）は 0 に消えているはず。ミュート無しで再生。
        // オーバーダブ後は playhead が途中にあるので先頭へ戻して内容を確認する。
        let mut out = vec![0.0; 4];
        eng.set_playing(true);
        eng.playhead_reset_for_test();
        eng.process(&[0.0; 4], &mut out);
        assert!((out[0] - 0.1).abs() < 1e-6);
        assert!((out[1] - 0.1).abs() < 1e-6);
        assert!(out[2].abs() < 1e-6, "古い録音が消えている");
        assert!(out[3].abs() < 1e-6, "古い録音が消えている");
    }

    #[test]
    fn latency_compensation_shifts_earlier() {
        let mut eng = Engine::new();
        eng.add_track(1, buf(8));
        eng.start_record(1, 0);
        feed(&mut eng, &[0.0, 0.0, 0.0, 0.0]); // 長さ 4 のループ
        eng.stop_record();
        assert_eq!(eng.playhead(), 0);

        eng.add_track(2, buf(8));
        eng.set_playing(true);
        // comp=1: playhead=0 のとき届いた mic は pos=(0+4-1)%4=3 に書かれる。
        eng.start_record(2, 1);
        let mut out = vec![0.0; 4];
        // 1 フレームだけ 1.0 を入力（playhead=0 で処理）。
        eng.process(&[1.0], &mut out);
        // 残りを 0 で 1 周ぶん埋めて録音完了。
        eng.process(&[0.0, 0.0, 0.0], &mut out);
        assert!(!eng.is_recording());

        // トラック2 単体の内容を再生で確認（トラック1 は無音）。
        eng.set_mute(1, true);
        eng.playhead_reset_for_test();
        let mut buf_out = vec![0.0; 4];
        eng.process(&[0.0; 4], &mut buf_out);
        // index 3 に 1.0 が入っているはず。
        assert!(buf_out[3].abs() > 0.99, "comp で 1 フレーム早い位置へ: {buf_out:?}");
        assert!(buf_out[0].abs() < 1e-6);
    }

    #[test]
    fn delete_all_tracks_resets_loop() {
        let mut eng = Engine::new();
        eng.add_track(1, buf(8));
        eng.start_record(1, 0);
        feed(&mut eng, &[0.5, 0.5, 0.5, 0.5]);
        eng.stop_record();
        assert_eq!(eng.loop_len(), 4);

        eng.delete_track(1);
        assert_eq!(eng.loop_len(), 0, "全削除でループ長リセット");
        assert!(!eng.is_playing());
    }

    #[test]
    fn delete_one_of_many_keeps_loop_length() {
        let mut eng = Engine::new();
        eng.add_track(1, buf(8));
        eng.start_record(1, 0);
        feed(&mut eng, &[0.5, 0.5, 0.5, 0.5]);
        eng.stop_record();
        eng.add_track(2, buf(8));
        eng.delete_track(1); // 長さを定義した 1 本目を削除
        assert_eq!(eng.loop_len(), 4, "残りトラックがあればループ長維持");
    }

    #[test]
    fn overdub_auto_stops_after_one_lap() {
        let mut eng = Engine::new();
        eng.add_track(1, buf(16));
        eng.start_record(1, 0);
        feed(&mut eng, &[0.5; 5]); // loop_len = 5
        eng.stop_record();
        eng.add_track(2, buf(16));
        eng.set_playing(true);
        eng.start_record(2, 0);
        feed(&mut eng, &[0.1; 3]); // まだ 1 周してない
        assert!(eng.is_recording());
        feed(&mut eng, &[0.1; 2]); // 合計 5 = 1 周
        assert!(!eng.is_recording(), "1 周で自動停止");
        assert!(eng.take_record_finished());
    }

    // テスト用ヘルパ。
    impl Engine {
        fn playhead_reset_for_test(&mut self) {
            self.playhead = 0;
        }
    }
}
