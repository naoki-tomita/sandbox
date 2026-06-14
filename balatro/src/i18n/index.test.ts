import { describe, it, expect } from 'vitest';
import { detectLocale, buildTranslations } from './index';
import { en } from './en';

describe('detectLocale: ブラウザ言語からロケール判定', () => {
  it('ja を含む言語は日本語', () => {
    expect(detectLocale(['ja'])).toBe('ja');
    expect(detectLocale(['ja-JP'])).toBe('ja');
    expect(detectLocale(['JA-jp'])).toBe('ja');
  });

  it('POSIX ロケール形式 (LANG) も解釈する', () => {
    expect(detectLocale(['ja_JP.UTF-8'])).toBe('ja');
    expect(detectLocale(['en_US.UTF-8'])).toBe('en');
  });

  it('英語はそのまま英語', () => {
    expect(detectLocale(['en-US'])).toBe('en');
  });

  it('未対応の言語は英語にフォールバック', () => {
    expect(detectLocale(['fr-FR'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('優先順の先頭にある対応言語を採用する', () => {
    expect(detectLocale(['fr', 'ja', 'en'])).toBe('ja');
    expect(detectLocale(['en', 'ja'])).toBe('en');
  });
});

describe('buildTranslations: 文言単位の英語フォールバック', () => {
  it('指定した文言は上書きされる', () => {
    const t = buildTranslations({ playHand: '勝負' });
    expect(t.playHand).toBe('勝負');
  });

  it('欠けている文言は英語にフォールバックする', () => {
    const t = buildTranslations({ playHand: '勝負' });
    expect(t.discard).toBe(en.discard);
    expect(t.gameOver).toBe(en.gameOver);
  });

  it('ネストしたテーブルはキー単位でフォールバックする', () => {
    // ジョーカーの name だけ訳し、description は未指定
    const t = buildTranslations({ jokers: { guilloche: { name: 'ギヨシェ彫り' } } });
    expect(t.jokers.guilloche.name).toBe('ギヨシェ彫り');
    expect(t.jokers.guilloche.description).toBe(en.jokers.guilloche.description);
    // 触れていないジョーカーは丸ごと英語のまま
    expect(t.jokers.engraver.name).toBe(en.jokers.engraver.name);
  });

  it('未指定の言語関数は英語の関数にフォールバックする', () => {
    const t = buildTranslations({});
    expect(t.blindSettled(2)).toBe(en.blindSettled(2));
  });

  it('元の英語テーブルを変更しない', () => {
    buildTranslations({ playHand: '勝負', jokers: { guilloche: { name: 'x' } } });
    expect(en.playHand).toBe('Play hand');
    expect(en.jokers.guilloche.name).toBe('The Guilloché');
  });
});
