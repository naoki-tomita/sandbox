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
          background: canPlay ? 'var(--lacquer)' : 'rgba(244,234,213,0.12)',
          color: 'var(--paper)',
          borderRadius: 8,
          letterSpacing: 0.5,
          minWidth: 140,
          boxShadow: canPlay
            ? 'inset 0 -2px 0 rgba(0,0,0,0.25), 0 4px 14px rgba(168,50,58,0.4)'
            : 'none',
        }}
      >
        Play hand
        {selectedCount > 0 && <span style={{ fontSize: 13, marginLeft: 6, opacity: 0.8 }}>({selectedCount})</span>}
      </button>

      <button
        onClick={onDiscard}
        disabled={disabled || selectedCount === 0 || discardsLeft === 0}
        style={{
          padding: '12px 24px',
          fontSize: 15,
          background: 'transparent',
          color: 'var(--paper)',
          borderRadius: 8,
          border: '1px solid var(--gilt-soft)',
          minWidth: 120,
        }}
      >
        Discard ({discardsLeft})
      </button>
    </div>
  );
}
