import { Card as CardType } from '../game/cards';
import { SUIT_SYMBOLS, RANK_LABELS } from '../game/cards';
import styles from '../styles/Card.module.css';

interface Props {
  card: CardType;
  onClick: () => void;
}

const RED_SUITS = new Set(['hearts', 'diamonds']);

export function Card({ card, onClick }: Props) {
  const isRed = RED_SUITS.has(card.suit);
  const symbol = SUIT_SYMBOLS[card.suit];
  const label = RANK_LABELS[card.rank];

  return (
    <div
      className={[styles.card, isRed ? styles.red : styles.black, card.selected ? styles.selected : ''].join(' ')}
      onClick={onClick}
      role="button"
      aria-pressed={card.selected}
      aria-label={`${label} of ${card.suit}`}
    >
      <div className={`${styles.corner} ${styles.cornerTop}`}>
        <span className={styles.rank}>{label}</span>
        <span className={styles.suit}>{symbol}</span>
      </div>
      <span className={styles.centerSuit}>{symbol}</span>
      <div className={`${styles.corner} ${styles.cornerBottom}`}>
        <span className={styles.rank}>{label}</span>
        <span className={styles.suit}>{symbol}</span>
      </div>
    </div>
  );
}
