import { locale } from '../i18n';
import type { Locale } from '../i18n';

/** Terminal-only control hints. Game content itself comes from `t` (../i18n). */
interface TuiStrings {
  selectingControls: string;
  scoredControls: string;
  clearedControls: string;
  draftControls: string;
  gameOverControls: string;
  jokersLabel: string;
  needTty: string;
}

const STRINGS: Record<Locale, TuiStrings> = {
  en: {
    selectingControls: '1-8 select · enter play · d discard · r/s sort rank/suit · q quit',
    scoredControls: 'enter continue · q quit',
    clearedControls: 'enter next · q quit',
    draftControls: '1-3 take · s skip · q quit',
    gameOverControls: 'enter restart · q quit',
    jokersLabel: 'Jokers',
    needTty: 'The TUI needs an interactive terminal (TTY). Run it directly in a terminal.',
  },
  ja: {
    selectingControls: '1-8 選択 · enter プレイ · d 捨てる · r/s 並替 ランク/スート · q 終了',
    scoredControls: 'enter 続ける · q 終了',
    clearedControls: 'enter 次へ · q 終了',
    draftControls: '1-3 取る · s スキップ · q 終了',
    gameOverControls: 'enter リスタート · q 終了',
    jokersLabel: 'Jokers',
    needTty: 'TUI は対話端末 (TTY) が必要です。端末で直接実行してください。',
  },
};

export const ui: TuiStrings = STRINGS[locale];
