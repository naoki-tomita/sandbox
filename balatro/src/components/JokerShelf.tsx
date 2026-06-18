import { JokerId, MAX_JOKERS } from '../game/jokers';
import { t } from '../i18n';

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
          title={t.jokers[id].description}
          style={{
            flex: '0 1 128px',
            minWidth: 104,
            padding: '10px 12px',
            background: 'var(--paper)',
            color: 'var(--ink)',
            border: '1px solid var(--gilt-soft)',
            borderRadius: 16,
            boxShadow: 'var(--neu-raised-sm)',
            textAlign: 'center',
            animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) backwards',
          }}
        >
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 13,
            lineHeight: 1.2,
            marginBottom: 3,
          }}>
            {t.jokers[id].name}
          </div>
          <div style={{ fontSize: 10.5, lineHeight: 1.25, opacity: 0.65 }}>
            {t.jokers[id].description}
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
            background: 'var(--paper)',
            borderRadius: 16,
            boxShadow: 'var(--neu-pressed-sm)',
            minHeight: 48,
          }}
        />
      ))}
    </div>
  );
}
