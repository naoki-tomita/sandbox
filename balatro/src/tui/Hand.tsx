import { Box } from 'ink';
import { Card as CardType } from '../game/cards';
import { Card } from './Card';

interface Props {
  cards: CardType[];
}

/** The dealt hand as a row of selectable cards. */
export function Hand({ cards }: Props) {
  return (
    <Box gap={1}>
      {cards.map((card, i) => (
        <Card key={card.id} card={card} index={i + 1} />
      ))}
    </Box>
  );
}
