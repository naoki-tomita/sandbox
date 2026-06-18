import { t } from '../i18n';

interface Props {
  selectedCount: number;
  discardsLeft: number;
  onPlayHand: () => void;
  onDiscard: () => void;
  disabled: boolean;
}

export function PlayArea({ selectedCount, discardsLeft, onPlayHand, onDiscard, disabled }: Props) {
  const canPlay = selectedCount > 0 && !disabled;

  return (
    <div style={{
      display: 'flex',
      gap: 16,
      marginTop: 20,
      justifyContent: 'center',
    }}>
      <button
        onClick={onPlayHand}
        disabled={disabled || selectedCount === 0}
        style={{
          padding: '12px 32px',
          fontSize: 17,
          fontWeight: 700,
          background: canPlay ? 'var(--lacquer)' : 'var(--paper)',
          color: canPlay ? '#fff' : 'var(--ink)',
          borderRadius: 14,
          letterSpacing: 0.5,
          minWidth: 140,
        }}
      >
        {t.playHand}
        {selectedCount > 0 && <span style={{ fontSize: 13, marginLeft: 6, opacity: 0.8 }}>({selectedCount})</span>}
      </button>

      <button
        onClick={onDiscard}
        disabled={disabled || selectedCount === 0 || discardsLeft === 0}
        style={{
          padding: '12px 24px',
          fontSize: 15,
          fontWeight: 700,
          background: 'var(--paper)',
          color: 'var(--ink)',
          borderRadius: 14,
          minWidth: 120,
        }}
      >
        {t.discard} ({discardsLeft})
      </button>
    </div>
  );
}
