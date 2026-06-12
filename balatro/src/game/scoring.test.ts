import { describe, it, expect } from 'vitest';
import { calculateScore } from './scoring';
import { detectHand } from './hands';
import { card } from './testFixtures';

describe('calculateScore: ジョーカーなしの基本式', () => {
  it('ハイカード: (役のベース5 + カードチップ) × 1', () => {
    const score = calculateScore(detectHand([card(14)]));
    expect(score.chips).toBe(5 + 11);
    expect(score.mult).toBe(1);
    expect(score.total).toBe(16);
    expect(score.baseMult).toBe(1);
    expect(score.jokerContributions).toEqual([]);
  });

  it('Kのペア: (10 + 10 + 10) × 2 = 60', () => {
    const score = calculateScore(detectHand([card(13, 'spades'), card(13, 'hearts')]));
    expect(score.total).toBe(60);
  });

  it('プレイした1枚ごとに寄与が記録される(演出用)', () => {
    const score = calculateScore(detectHand([card(2), card(5, 'hearts'), card(9, 'clubs')]));
    expect(score.cardContributions.map(c => c.chips)).toEqual([2, 5, 9]);
  });
});

describe('calculateScore: ジョーカーパイプライン', () => {
  const ctx = { discardsLeft: 2 };
  const faceHigh = detectHand([card(13)]); // K単騎: 5 + 10 = 15チップ、×1

  it('Chips系の効果は乗算の前に加算される', () => {
    const score = calculateScore(faceHigh, ['court_painter'], ctx);
    expect(score.chips).toBe(15 + 30);
    expect(score.total).toBe(45);
  });

  it('所持順(左→右)に適用される: 加算→×2 なら (1+4)×2 = 10', () => {
    const score = calculateScore(faceHigh, ['apprentice', 'engraver'], ctx);
    expect(score.mult).toBe(10);
    expect(score.total).toBe(150);
  });

  it('所持順(左→右)に適用される: ×2→加算 なら 1×2+4 = 6', () => {
    const score = calculateScore(faceHigh, ['engraver', 'apprentice'], ctx);
    expect(score.mult).toBe(6);
    expect(score.total).toBe(90);
  });

  it('不発動のジョーカーはスキップされ、寄与にも残らない', () => {
    const noFace = detectHand([card(7)]);
    const score = calculateScore(noFace, ['engraver', 'last_scrap'], ctx);
    expect(score.jokerContributions).toEqual([]);
    expect(score.mult).toBe(1);
  });

  it('コンテキストの残りディスカード数が効果に反映される', () => {
    const score = calculateScore(faceHigh, ['uncut_sheets'], { discardsLeft: 2 });
    expect(score.jokerContributions).toEqual([{ jokerId: 'uncut_sheets', chips: 60 }]);
  });

  it('The Collector は自身を含む所持数を数える', () => {
    const score = calculateScore(faceHigh, ['apprentice', 'collector'], ctx);
    expect(score.jokerContributions).toContainEqual({ jokerId: 'collector', mult: 6 });
  });

  it('合計は常に chips × mult と一致する', () => {
    const hand = detectHand([card(11, 'hearts'), card(11, 'clubs')]);
    const score = calculateScore(hand, ['twin_press', 'lacquer_pot', 'engraver'], { discardsLeft: 0 });
    expect(score.total).toBe(score.chips * score.mult);
  });
});
