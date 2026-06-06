import { Card as CardType } from '../game/cards';
import { Card } from './Card';
import styles from '../styles/Hand.module.css';

interface Props {
  cards: CardType[];
  onToggleSelect: (id: string) => void;
  isPlaying: boolean;
  dealKey: number;
}

const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };

export function Hand({ cards, onToggleSelect, isPlaying, dealKey }: Props) {
  const sorted = [...cards].sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]
  );

  function handleToggle(id: string) {
    if (isPlaying) return;
    onToggleSelect(id);
  }

  return (
    <div className={styles.hand}>
      {sorted.map((card, i) => (
        <Card
          key={`${dealKey}-${card.id}`}
          card={card}
          onClick={() => handleToggle(card.id)}
          isFlying={isPlaying && card.selected}
          dealIndex={i}
        />
      ))}
    </div>
  );
}
