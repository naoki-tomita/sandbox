import { describe, it, expect } from 'vitest';
import { detectLocale } from './index';

describe('detectLocale: ブラウザ言語からロケール判定', () => {
  it('ja を含む言語は日本語', () => {
    expect(detectLocale(['ja'])).toBe('ja');
    expect(detectLocale(['ja-JP'])).toBe('ja');
    expect(detectLocale(['JA-jp'])).toBe('ja');
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
