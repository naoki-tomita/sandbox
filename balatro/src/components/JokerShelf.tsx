import { JokerId, JOKERS, MAX_JOKERS } from '../game/jokers';

interface Props {
  jokers: JokerId[];
}

/** The workshop shelf above the ledger: owned jokers as little trade cards. */
export function JokerShelf({ jokers }: Props) {
  if (jokers.length === 0) return null;

  const emptySlots = MAX_JOKERS - jokers.length;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      width: '100%',
      marginBottom: 14,
    }}>
      {jokers.map(id => (
        <div
          key={id}
          title={JOKERS[id].description}
          style={{
            flex: '0 1 128px',
            minWidth: 104,
            padding: '8px 10px',
            background: 'var(--paper)',
            color: 'var(--ink)',
            border: '1px solid var(--gilt)',
            borderRadius: 7,
            boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
            textAlign: 'center',
            animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) backwards',
          }}
        >
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            lineHeight: 1.2,
            marginBottom: 3,
          }}>
            {JOKERS[id].name}
          </div>
          <div style={{ fontSize: 10.5, lineHeight: 1.25, opacity: 0.65 }}>
            {JOKERS[id].description}
          </div>
        </div>
      ))}
      {Array.from({ length: emptySlots }, (_, i) => (
        <div
          key={`empty-${i}`}
          aria-hidden="true"
          style={{
            flex: '0 1 128px',
            minWidth: 104,
            border: '1px dashed rgba(200, 162, 75, 0.3)',
            borderRadius: 7,
            minHeight: 48,
          }}
        />
      ))}
    </div>
  );
}
