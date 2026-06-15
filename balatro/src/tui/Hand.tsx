import { Box } from 'ink';
import { Card as CardType } from '../game/cards';
import { Card } from './Card';

interface Props {
  cards: CardType[];
  /** Index of the card the cursor is on, or -1 to show no cursor. */
  cursor: number;
}

/** The dealt hand as a row of cards with a movable selection cursor. */
export function Hand({ cards, cursor }: Props) {
  return (
    <Box gap={1}>
      {cards.map((card, i) => (
        <Card key={card.id} card={card} cursor={i === cursor} />
      ))}
    </Box>
  );
}
