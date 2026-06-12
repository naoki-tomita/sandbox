import { JokerId, JOKERS } from '../game/jokers';

interface Props {
  choices: JokerId[];
  onPick: (id: JokerId) => void;
  onSkip: () => void;
}

/** Between blinds the workshop offers three trade cards; take one or move on. */
export function JokerDraft({ choices, onPick, onSkip }: Props) {
  return (
    <div style={{
      marginTop: 24,
      textAlign: 'center',
      background: 'var(--paper)',
      color: 'var(--ink)',
      border: '1px solid var(--paper-shade)',
      borderRadius: 10,
      boxShadow: 'inset 0 0 0 4px var(--paper), inset 0 0 0 5px var(--gilt), 0 8px 24px rgba(0,0,0,0.5)',
      padding: '24px clamp(18px, 5vw, 36px) 22px',
      maxWidth: '100%',
      animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) backwards',
    }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--lacquer)', marginBottom: 4 }}>
        THE WORKSHOP OFFERS
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, marginBottom: 16 }}>
        Take a joker
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 18,
      }}>
        {choices.map((id, i) => (
          <button
            key={id}
            onClick={() => onPick(id)}
            style={{
              flex: '1 1 150px',
              maxWidth: 190,
              padding: '14px 12px 12px',
              background: 'linear-gradient(160deg, #faf3e3 0%, #f1e6cc 100%)',
              color: 'var(--ink)',
              border: '1px solid var(--gilt)',
              borderRadius: 8,
              boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
              textAlign: 'center',
              animation: `popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) ${0.1 + i * 0.08}s backwards`,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--gilt)', marginBottom: 6 }} aria-hidden="true">✦</div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              lineHeight: 1.2,
              marginBottom: 6,
            }}>
              {JOKERS[id].name}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.35, opacity: 0.75 }}>
              {JOKERS[id].description}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onSkip}
        style={{
          padding: '8px 22px',
          fontSize: 14,
          background: 'transparent',
          color: 'var(--ink)',
          opacity: 0.6,
          border: '1px solid var(--paper-shade)',
          borderRadius: 8,
        }}
      >
        Continue without
      </button>
    </div>
  );
}
