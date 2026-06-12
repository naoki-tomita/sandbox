import { describe, it, expect } from 'vitest';
import { detectHand } from './hands';
import { card } from './testFixtures';

describe('detectHand: 役判定', () => {
  it('未選択(0枚)はハイカード扱い', () => {
    expect(detectHand([]).name).toBe('high_card');
  });

  it('1枚だけならハイカード', () => {
    expect(detectHand([card(14)]).name).toBe('high_card');
  });

  it('ペア', () => {
    expect(detectHand([card(9, 'spades'), card(9, 'hearts')]).name).toBe('pair');
  });

  it('ツーペア', () => {
    expect(detectHand([
      card(9, 'spades'), card(9, 'hearts'),
      card(4, 'clubs'), card(4, 'diamonds'),
    ]).name).toBe('two_pair');
  });

  it('スリーカード', () => {
    expect(detectHand([
      card(7, 'spades'), card(7, 'hearts'), card(7, 'clubs'),
    ]).name).toBe('three_of_a_kind');
  });

  it('ストレート', () => {
    expect(detectHand([
      card(5, 'spades'), card(6, 'hearts'), card(7, 'clubs'), card(8, 'spades'), card(9, 'hearts'),
    ]).name).toBe('straight');
  });

  it('Aハイストレート(10-J-Q-K-A)も成立する', () => {
    expect(detectHand([
      card(10, 'spades'), card(11, 'hearts'), card(12, 'clubs'), card(13, 'spades'), card(14, 'hearts'),
    ]).name).toBe('straight');
  });

  it('Aローストレート(A-2-3-4-5)も成立する', () => {
    expect(detectHand([
      card(14, 'spades'), card(2, 'hearts'), card(3, 'clubs'), card(4, 'spades'), card(5, 'hearts'),
    ]).name).toBe('straight');
  });

  it('連続4枚ではストレートにならない(5枚必須)', () => {
    expect(detectHand([
      card(5, 'spades'), card(6, 'hearts'), card(7, 'clubs'), card(8, 'spades'),
    ]).name).toBe('high_card');
  });

  it('フラッシュ', () => {
    expect(detectHand([
      card(2, 'hearts'), card(5, 'hearts'), card(9, 'hearts'), card(11, 'hearts'), card(13, 'hearts'),
    ]).name).toBe('flush');
  });

  it('同スーツ4枚ではフラッシュにならない(5枚必須)', () => {
    expect(detectHand([
      card(2, 'hearts'), card(5, 'hearts'), card(9, 'hearts'), card(11, 'hearts'),
    ]).name).toBe('high_card');
  });

  it('フルハウス', () => {
    expect(detectHand([
      card(8, 'spades'), card(8, 'hearts'), card(8, 'clubs'),
      card(3, 'spades'), card(3, 'hearts'),
    ]).name).toBe('full_house');
  });

  it('フォーカード', () => {
    expect(detectHand([
      card(12, 'spades'), card(12, 'hearts'), card(12, 'clubs'), card(12, 'diamonds'),
    ]).name).toBe('four_of_a_kind');
  });

  it('ストレートフラッシュ', () => {
    expect(detectHand([
      card(5, 'clubs'), card(6, 'clubs'), card(7, 'clubs'), card(8, 'clubs'), card(9, 'clubs'),
    ]).name).toBe('straight_flush');
  });

  it('ロイヤルフラッシュ', () => {
    expect(detectHand([
      card(10, 'diamonds'), card(11, 'diamonds'), card(12, 'diamonds'), card(13, 'diamonds'), card(14, 'diamonds'),
    ]).name).toBe('royal_flush');
  });

  it('Aローのストレートフラッシュはロイヤルではない', () => {
    expect(detectHand([
      card(14, 'clubs'), card(2, 'clubs'), card(3, 'clubs'), card(4, 'clubs'), card(5, 'clubs'),
    ]).name).toBe('straight_flush');
  });
});
