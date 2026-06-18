import { JokerId } from '../game/jokers';
import { t } from '../i18n';

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
      border: 'none',
      borderRadius: 24,
      boxShadow: 'var(--neu-raised-lg)',
      padding: '24px clamp(18px, 5vw, 36px) 22px',
      maxWidth: '100%',
      animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) backwards',
    }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: 'var(--lacquer)', marginBottom: 4 }}>
        {t.workshopOffers}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, marginBottom: 16 }}>
        {t.takeAJoker}
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
              padding: '16px 14px 14px',
              background: 'var(--paper)',
              color: 'var(--ink)',
              border: '1px solid var(--gilt-soft)',
              borderRadius: 18,
              boxShadow: 'var(--neu-raised-sm)',
              textAlign: 'center',
              animation: `popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) ${0.1 + i * 0.08}s backwards`,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--gilt)', marginBottom: 6 }} aria-hidden="true">✦</div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 17,
              lineHeight: 1.2,
              marginBottom: 6,
            }}>
              {t.jokers[id].name}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.35, opacity: 0.75 }}>
              {t.jokers[id].description}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onSkip}
        style={{
          padding: '10px 24px',
          fontSize: 14,
          fontWeight: 700,
          background: 'var(--paper)',
          color: 'var(--ink)',
          opacity: 0.75,
          borderRadius: 14,
        }}
      >
        {t.continueWithout}
      </button>
    </div>
  );
}
