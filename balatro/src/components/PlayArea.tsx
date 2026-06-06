interface Props {
  selectedCount: number;
  discardsLeft: number;
  onPlayHand: () => void;
  onDiscard: () => void;
  disabled: boolean;
}

export function PlayArea({ selectedCount, discardsLeft, onPlayHand, onDiscard, disabled }: Props) {
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
          fontSize: 16,
          fontWeight: 'bold',
          background: selectedCount > 0 && !disabled ? 'linear-gradient(135deg, #e74c3c, #c0392b)' : '#555',
          color: '#fff',
          borderRadius: 8,
          letterSpacing: 0.5,
          minWidth: 140,
        }}
      >
        Play Hand
        {selectedCount > 0 && <span style={{ fontSize: 12, marginLeft: 6, opacity: 0.8 }}>({selectedCount})</span>}
      </button>

      <button
        onClick={onDiscard}
        disabled={disabled || selectedCount === 0 || discardsLeft === 0}
        style={{
          padding: '12px 24px',
          fontSize: 14,
          background: 'rgba(255,255,255,0.1)',
          color: '#ddd',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.2)',
          minWidth: 120,
        }}
      >
        Discard ({discardsLeft})
      </button>
    </div>
  );
}
