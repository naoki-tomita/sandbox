import { describe, it, expect } from 'vitest';
import { JOKERS, JOKER_IDS, JokerId, ScoringContext, drawJokerChoices } from './jokers';
import { detectHand } from './hands';
import { Card } from './cards';
import { card } from './testFixtures';

function ctx(cards: Card[], overrides: Partial<Omit<ScoringContext, 'hand'>> = {}): ScoringContext {
  return { hand: detectHand(cards), discardsLeft: 3, jokerCount: 1, ...overrides };
}

const effect = (id: JokerId, c: ScoringContext) => JOKERS[id].effect(c);

describe('各ジョーカーの効果', () => {
  it('The Apprentice: 無条件で +4 Mult', () => {
    expect(effect('apprentice', ctx([card(2)]))).toEqual({ mult: 4 });
  });

  it('顔料壺シリーズ: 自分のスーツだけを数えて1枚 +3 Mult', () => {
    const mixed = ctx([card(5, 'hearts'), card(9, 'hearts'), card(13, 'spades')]);
    expect(effect('lacquer_pot', mixed)).toEqual({ mult: 6 });   // ♥2枚
    expect(effect('india_ink', mixed)).toEqual({ mult: 3 });     // ♠1枚
    expect(effect('vermilion_jar', mixed)).toBeNull();           // ♦なし
    expect(effect('lamp_black', mixed)).toBeNull();              // ♣なし
  });

  it('Twin Press: 同ランク2枚以上を含めば +50 Chips(フルハウス内のペアでも発動)', () => {
    expect(effect('twin_press', ctx([card(8, 'spades'), card(8, 'hearts')]))).toEqual({ chips: 50 });
    expect(effect('twin_press', ctx([
      card(8, 'spades'), card(8, 'hearts'), card(8, 'clubs'),
      card(3, 'spades'), card(3, 'hearts'),
    ]))).toEqual({ chips: 50 });
    expect(effect('twin_press', ctx([card(8), card(9, 'hearts')]))).toBeNull();
  });

  it('Short Run: 3枚以下のプレイで +20 Mult、4枚では不発', () => {
    expect(effect('short_run', ctx([card(2), card(3, 'hearts'), card(4, 'clubs')]))).toEqual({ mult: 20 });
    expect(effect('short_run', ctx([card(2), card(3, 'hearts'), card(4, 'clubs'), card(5, 'diamonds')]))).toBeNull();
  });

  it('Uncut Sheets: 残りディスカード1回につき +30 Chips、残り0なら不発', () => {
    expect(effect('uncut_sheets', ctx([card(2)], { discardsLeft: 3 }))).toEqual({ chips: 90 });
    expect(effect('uncut_sheets', ctx([card(2)], { discardsLeft: 0 }))).toBeNull();
  });

  it('Last Scrap: 残りディスカード0のときだけ +15 Mult', () => {
    expect(effect('last_scrap', ctx([card(2)], { discardsLeft: 0 }))).toEqual({ mult: 15 });
    expect(effect('last_scrap', ctx([card(2)], { discardsLeft: 1 }))).toBeNull();
  });

  it('偶奇は表示値で判定する: Aは1(奇数)、Qは12(偶数)', () => {
    // A(奇)、Q(偶)、J(奇)、4(偶)
    const hand = ctx([card(14), card(12, 'hearts'), card(11, 'clubs'), card(4, 'diamonds')]);
    expect(effect('even_grain', hand)).toEqual({ mult: 8 });   // Q + 4 の2枚
    expect(effect('odd_lot', hand)).toEqual({ chips: 60 });    // A + J の2枚
  });

  it('Court Painter: 絵札(J,Q,K)だけを数える(Aは対象外)', () => {
    expect(effect('court_painter', ctx([card(11), card(12, 'hearts'), card(14, 'clubs')])))
      .toEqual({ chips: 60 }); // J + Q の2枚
    expect(effect('court_painter', ctx([card(10), card(14, 'clubs')]))).toBeNull();
  });

  it('The Collector: 所持ジョーカー数 × +3 Mult', () => {
    expect(effect('collector', ctx([card(2)], { jokerCount: 4 }))).toEqual({ mult: 12 });
  });

  it('The Engraver: 絵札を含むときだけ Mult ×2', () => {
    expect(effect('engraver', ctx([card(12)]))).toEqual({ xmult: 2 });
    expect(effect('engraver', ctx([card(14), card(10, 'hearts')]))).toBeNull();
  });
});

describe('drawJokerChoices: ドラフト抽選', () => {
  it('未所持から3種、重複なしで提示する', () => {
    const owned: JokerId[] = ['apprentice', 'engraver'];
    for (let i = 0; i < 20; i++) {
      const choices = drawJokerChoices(owned);
      expect(choices).toHaveLength(3);
      expect(new Set(choices).size).toBe(3);
      for (const id of choices) expect(owned).not.toContain(id);
    }
  });

  it('プールが3種未満なら残っている分だけ提示する', () => {
    const owned = JOKER_IDS.slice(0, JOKER_IDS.length - 2);
    expect(drawJokerChoices(owned)).toHaveLength(2);
    expect(drawJokerChoices(JOKER_IDS)).toHaveLength(0);
  });
});
