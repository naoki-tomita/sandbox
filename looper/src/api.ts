// Rust コマンドへの型付きラッパ。UI は必ずこの層を経由する。

import { invoke } from '@tauri-apps/api/core';
import type { EngineStatus, TrackMeta } from './types';

export const listTracks = () => invoke<TrackMeta[]>('list_tracks');
export const addTrack = () => invoke<number>('add_track');
export const deleteTrack = (id: number) => invoke<void>('delete_track', { id });
export const setMute = (id: number, muted: boolean) =>
  invoke<void>('set_mute', { id, muted });
/** 指定トラックへ上書き録音を開始する。 */
export const armRecord = (id: number) => invoke<void>('arm_record', { id });
export const stopRecord = () => invoke<void>('stop_record');
export const play = () => invoke<void>('play');
export const stop = () => invoke<void>('stop');
export const getStatus = () => invoke<EngineStatus>('get_status');
