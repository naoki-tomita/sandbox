import { Card as CardType, SUIT_SYMBOLS, RANK_LABELS } from '../game/cards';
import styles from '../styles/Card.module.css';

interface Props {
  card: CardType;
  onClick: () => void;
  isFlying?: boolean;
  dealIndex?: number;
  dealKey?: string;
}

const RED_SUITS = new Set(['hearts', 'diamonds']);

export function Card({ card, onClick, isFlying = false, dealIndex = 0, dealKey }: Props) {
  const isRed = RED_SUITS.has(card.suit);
  const symbol = SUIT_SYMBOLS[card.suit];
  const label = RANK_LABELS[card.rank];

  const className = [
    styles.card,
    isRed ? styles.red : styles.black,
    card.selected && !isFlying ? styles.selected : '',
    isFlying ? styles.flying : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      key={dealKey}
      className={className}
      onClick={isFlying ? undefined : onClick}
      role="button"
      aria-pressed={card.selected}
      aria-label={`${label} of ${card.suit}`}
      style={{ animationDelay: `${dealIndex * 0.055}s` }}
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
