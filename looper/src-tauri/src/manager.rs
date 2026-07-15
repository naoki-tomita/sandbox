//! 非リアルタイム側の状態管理。UI にとってのトラック一覧の「真実の情報源」であり、
//! 変更を [`audio::Command`] として音声スレッドへ転送する。

use std::sync::atomic::Ordering;

use serde::Serialize;

use crate::audio::{self, AudioHandle, Command};

/// UI へ渡すトラックのメタ情報。
#[derive(Clone, Serialize)]
pub struct TrackMeta {
    pub id: u64,
    pub name: String,
    pub muted: bool,
}

/// UI がポーリングで読む再生状態のスナップショット。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub playhead: usize,
    pub loop_len: usize,
    pub playing: bool,
    pub recording: bool,
    /// 直近で録音が終了したか（自動停止の検知用、読むとクリア）。
    pub record_finished: bool,
    pub armed_id: Option<u64>,
    pub input_level: f32,
    pub sample_rate: u32,
    pub max_frames: usize,
    /// 音声デバイスが利用可能か。
    pub audio_ok: bool,
}

pub struct Manager {
    tracks: Vec<TrackMeta>,
    next_id: u64,
    /// 音声デバイスが開けなかった場合は None（コマンドは no-op）。
    audio: Option<AudioHandle>,
}

impl Manager {
    pub fn new() -> Self {
        let audio = match audio::spawn() {
            Ok(h) => Some(h),
            Err(e) => {
                eprintln!("音声の初期化に失敗しました: {e}");
                None
            }
        };
        Manager {
            tracks: Vec::new(),
            next_id: 1,
            audio,
        }
    }

    pub fn list_tracks(&self) -> Vec<TrackMeta> {
        self.tracks.clone()
    }

    pub fn add_track(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let name = format!("Track {}", self.tracks.len() + 1);
        self.tracks.push(TrackMeta {
            id,
            name,
            muted: false,
        });
        if let Some(a) = &self.audio {
            let buf = a.alloc_track_buffer();
            a.send(Command::AddTrack { id, buf });
        }
        id
    }

    pub fn delete_track(&mut self, id: u64) {
        self.tracks.retain(|t| t.id != id);
        if let Some(a) = &self.audio {
            a.send(Command::DeleteTrack { id });
        }
    }

    pub fn set_mute(&mut self, id: u64, muted: bool) {
        if let Some(t) = self.tracks.iter_mut().find(|t| t.id == id) {
            t.muted = muted;
        }
        if let Some(a) = &self.audio {
            a.send(Command::SetMute { id, muted });
        }
    }

    pub fn arm_record(&self, id: u64) {
        if let Some(a) = &self.audio {
            a.send(Command::StartRecord { id });
        }
    }

    pub fn stop_record(&self) {
        if let Some(a) = &self.audio {
            a.send(Command::StopRecord);
        }
    }

    pub fn set_playing(&self, playing: bool) {
        if let Some(a) = &self.audio {
            a.send(Command::SetPlaying(playing));
        }
    }

    pub fn status(&self) -> EngineStatus {
        match &self.audio {
            Some(a) => {
                let s = &a.status;
                let armed = s.armed_id.load(Ordering::Relaxed);
                EngineStatus {
                    playhead: s.playhead.load(Ordering::Relaxed),
                    loop_len: s.loop_len.load(Ordering::Relaxed),
                    playing: s.playing.load(Ordering::Relaxed),
                    recording: s.recording.load(Ordering::Relaxed),
                    // 読み取りでラッチをクリア。
                    record_finished: s.record_finished.swap(false, Ordering::Relaxed),
                    armed_id: if armed < 0 { None } else { Some(armed as u64) },
                    input_level: s.input_level(),
                    sample_rate: a.sample_rate,
                    max_frames: a.max_frames,
                    audio_ok: true,
                }
            }
            None => EngineStatus {
                playhead: 0,
                loop_len: 0,
                playing: false,
                recording: false,
                record_finished: false,
                armed_id: None,
                input_level: 0.0,
                sample_rate: 0,
                max_frames: 0,
                audio_ok: false,
            },
        }
    }
}

impl Default for Manager {
    fn default() -> Self {
        Self::new()
    }
}
