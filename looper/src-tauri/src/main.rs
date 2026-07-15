// リリースビルドで Windows のコンソール窓を出さない（Mac/Linux では無害）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod manager;

use std::sync::Mutex;

use manager::{EngineStatus, Manager, TrackMeta};
use tauri::State;

type ManagerState = Mutex<Manager>;

#[tauri::command]
fn list_tracks(state: State<ManagerState>) -> Vec<TrackMeta> {
    state.lock().unwrap().list_tracks()
}

#[tauri::command]
fn add_track(state: State<ManagerState>) -> u64 {
    state.lock().unwrap().add_track()
}

#[tauri::command]
fn delete_track(state: State<ManagerState>, id: u64) {
    state.lock().unwrap().delete_track(id);
}

#[tauri::command]
fn set_mute(state: State<ManagerState>, id: u64, muted: bool) {
    state.lock().unwrap().set_mute(id, muted);
}

#[tauri::command]
fn arm_record(state: State<ManagerState>, id: u64) {
    state.lock().unwrap().arm_record(id);
}

#[tauri::command]
fn stop_record(state: State<ManagerState>) {
    state.lock().unwrap().stop_record();
}

#[tauri::command]
fn play(state: State<ManagerState>) {
    state.lock().unwrap().set_playing(true);
}

#[tauri::command]
fn stop(state: State<ManagerState>) {
    state.lock().unwrap().set_playing(false);
}

#[tauri::command]
fn get_status(state: State<ManagerState>) -> EngineStatus {
    state.lock().unwrap().status()
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(Manager::new()))
        .invoke_handler(tauri::generate_handler![
            list_tracks,
            add_track,
            delete_track,
            set_mute,
            arm_record,
            stop_record,
            play,
            stop,
            get_status,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri アプリの起動に失敗しました");
}
