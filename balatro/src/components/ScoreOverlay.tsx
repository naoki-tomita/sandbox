import { PlayScore } from '../game/scoring';
import { HAND_DISPLAY_NAMES } from '../game/hands';

const HAND_COLORS: Record<string, string> = {
  royal_flush:     '#ff6b9d',
  straight_flush:  '#e74c3c',
  four_of_a_kind:  '#9b59b6',
  full_house:      '#e67e22',
  flush:           '#3498db',
  straight:        '#2ecc71',
  three_of_a_kind: '#1abc9c',
  two_pair:        '#f1c40f',
  pair:            '#f39c12',
  high_card:       '#95a5a6',
};

export function ScoreOverlay({ play }: { play: PlayScore; }) {
  const color = HAND_COLORS[play.handName] ?? '#f1c40f';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 150,
    }}>
      <div style={{
        textAlign: 'center',
        animation: 'overlayEnter 1.8s ease-out forwards',
      }}>
        {/* Hand name */}
        <div style={{
          fontSize: 42,
          fontWeight: 'bold',
          color,
          textShadow: `0 0 30px ${color}, 0 4px 12px rgba(0,0,0,0.8)`,
          letterSpacing: 3,
          marginBottom: 12,
          animation: 'slideInUp 0.3s ease-out backwards',
          animationDelay: '0.05s',
        }}>
          {HAND_DISPLAY_NAMES[play.handName].toUpperCase()}
        </div>

        {/* Formula */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          fontSize: 28,
          fontWeight: 'bold',
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 16,
          padding: '12px 28px',
          backdropFilter: 'blur(4px)',
          border: `1px solid ${color}44`,
        }}>
          <span style={{ color: '#7eb8f7', animation: 'popIn 0.3s ease-out backwards', animationDelay: '0.2s' }}>
            {play.chips}
          </span>
          <span style={{ opacity: 0.5, fontSize: 20 }}>chips ×</span>
          <span style={{ color: '#f08080', animation: 'popIn 0.3s ease-out backwards', animationDelay: '0.35s' }}>
            {play.mult}
          </span>
          <span style={{ opacity: 0.5, fontSize: 20 }}>mult =</span>
          <span style={{
            color,
            fontSize: 38,
            textShadow: `0 0 20px ${color}`,
            animation: 'numberBounce 0.4s ease-out backwards',
            animationDelay: '0.5s',
          }}>
            {play.total.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
