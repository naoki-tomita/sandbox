import { Card as CardType } from '../game/cards';
import { Card } from './Card';
import styles from '../styles/Hand.module.css';

interface Props {
  cards: CardType[];
  onToggleSelect: (id: string) => void;
  maxSelected: number;
}

const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };

export function Hand({ cards, onToggleSelect, maxSelected }: Props) {
  const selectedCount = cards.filter(c => c.selected).length;

  const sorted = [...cards].sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]
  );

  function handleToggle(id: string) {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    if (!card.selected && selectedCount >= maxSelected) return;
    onToggleSelect(id);
  }

  return (
    <div className={styles.hand}>
      {sorted.map(card => (
        <Card key={card.id} card={card} onClick={() => handleToggle(card.id)} />
      ))}
    </div>
  );
}
