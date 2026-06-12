import { describe, it, expect } from 'vitest';
import { detectHand } from './hands';
import { card } from './testFixtures';

describe('detectHand', () => {
  it('empty selection is a high card', () => {
    expect(detectHand([]).name).toBe('high_card');
  });

  it('single card is a high card', () => {
    expect(detectHand([card(14)]).name).toBe('high_card');
  });

  it('pair', () => {
    expect(detectHand([card(9, 'spades'), card(9, 'hearts')]).name).toBe('pair');
  });

  it('two pair', () => {
    expect(detectHand([
      card(9, 'spades'), card(9, 'hearts'),
      card(4, 'clubs'), card(4, 'diamonds'),
    ]).name).toBe('two_pair');
  });

  it('three of a kind', () => {
    expect(detectHand([
      card(7, 'spades'), card(7, 'hearts'), card(7, 'clubs'),
    ]).name).toBe('three_of_a_kind');
  });

  it('straight', () => {
    expect(detectHand([
      card(5, 'spades'), card(6, 'hearts'), card(7, 'clubs'), card(8, 'spades'), card(9, 'hearts'),
    ]).name).toBe('straight');
  });

  it('ace-high straight (10-J-Q-K-A)', () => {
    expect(detectHand([
      card(10, 'spades'), card(11, 'hearts'), card(12, 'clubs'), card(13, 'spades'), card(14, 'hearts'),
    ]).name).toBe('straight');
  });

  it('ace-low straight (A-2-3-4-5)', () => {
    expect(detectHand([
      card(14, 'spades'), card(2, 'hearts'), card(3, 'clubs'), card(4, 'spades'), card(5, 'hearts'),
    ]).name).toBe('straight');
  });

  it('four cards in a row are not a straight', () => {
    expect(detectHand([
      card(5, 'spades'), card(6, 'hearts'), card(7, 'clubs'), card(8, 'spades'),
    ]).name).toBe('high_card');
  });

  it('flush', () => {
    expect(detectHand([
      card(2, 'hearts'), card(5, 'hearts'), card(9, 'hearts'), card(11, 'hearts'), card(13, 'hearts'),
    ]).name).toBe('flush');
  });

  it('four same-suit cards are not a flush', () => {
    expect(detectHand([
      card(2, 'hearts'), card(5, 'hearts'), card(9, 'hearts'), card(11, 'hearts'),
    ]).name).toBe('high_card');
  });

  it('full house', () => {
    expect(detectHand([
      card(8, 'spades'), card(8, 'hearts'), card(8, 'clubs'),
      card(3, 'spades'), card(3, 'hearts'),
    ]).name).toBe('full_house');
  });

  it('four of a kind', () => {
    expect(detectHand([
      card(12, 'spades'), card(12, 'hearts'), card(12, 'clubs'), card(12, 'diamonds'),
    ]).name).toBe('four_of_a_kind');
  });

  it('straight flush', () => {
    expect(detectHand([
      card(5, 'clubs'), card(6, 'clubs'), card(7, 'clubs'), card(8, 'clubs'), card(9, 'clubs'),
    ]).name).toBe('straight_flush');
  });

  it('royal flush', () => {
    expect(detectHand([
      card(10, 'diamonds'), card(11, 'diamonds'), card(12, 'diamonds'), card(13, 'diamonds'), card(14, 'diamonds'),
    ]).name).toBe('royal_flush');
  });

  it('ace-low straight flush is not royal', () => {
    expect(detectHand([
      card(14, 'clubs'), card(2, 'clubs'), card(3, 'clubs'), card(4, 'clubs'), card(5, 'clubs'),
    ]).name).toBe('straight_flush');
  });
});
