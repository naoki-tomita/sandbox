import { useEffect, useRef, useState } from 'react';
import { Card as CardType, SUIT_SYMBOLS, RANK_LABELS } from '../game/cards';
import styles from '../styles/Card.module.css';

interface Props {
  card: CardType;
  onClick: () => void;
  isFlying?: boolean;
  dealIndex?: number;
}

const RED_SUITS = new Set(['hearts', 'diamonds']);

export function Card({ card, onClick, isFlying = false, dealIndex = 0 }: Props) {
  const isRed = RED_SUITS.has(card.suit);
  const ref = useRef<HTMLDivElement>(null);
  const [isDealing, setIsDealing] = useState(true);

  // Remove dealing class as soon as the animation ends so class changes
  // (selection toggle, etc.) never re-trigger dealIn
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = () => setIsDealing(false);
    el.addEventListener('animationend', stop, { once: true });
    return () => el.removeEventListener('animationend', stop);
  }, []);

  const className = [
    styles.card,
    isRed ? styles.red : styles.black,
    isDealing ? styles.dealing : '',
    card.selected && !isFlying ? styles.selected : '',
    isFlying ? styles.flying : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      className={className}
      onClick={isFlying ? undefined : onClick}
      role="button"
      aria-pressed={card.selected}
      aria-label={`${RANK_LABELS[card.rank]} of ${card.suit}`}
      style={{ animationDelay: `${dealIndex * 0.055}s` }}
    >
      <div className={`${styles.corner} ${styles.cornerTop}`}>
        <span className={styles.rank}>{RANK_LABELS[card.rank]}</span>
        <span className={styles.suit}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
      <span className={styles.centerSuit}>{SUIT_SYMBOLS[card.suit]}</span>
      <div className={`${styles.corner} ${styles.cornerBottom}`}>
        <span className={styles.rank}>{RANK_LABELS[card.rank]}</span>
        <span className={styles.suit}>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );
}
