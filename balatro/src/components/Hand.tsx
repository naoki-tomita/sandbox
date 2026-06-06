import { Card as CardType } from '../game/cards';
import { Card } from './Card';
import styles from '../styles/Hand.module.css';

interface Props {
  cards: CardType[];
  onToggleSelect: (id: string) => void;
  maxSelected: number;
}

export function Hand({ cards, onToggleSelect, maxSelected }: Props) {
  const selectedCount = cards.filter(c => c.selected).length;

  function handleToggle(id: string) {
    const card = cards.find(c => c.id === id);
    if (!card) return;
    if (!card.selected && selectedCount >= maxSelected) return;
    onToggleSelect(id);
  }

  return (
    <div className={styles.hand}>
      {cards.map(card => (
        <Card key={card.id} card={card} onClick={() => handleToggle(card.id)} />
      ))}
    </div>
  );
}
