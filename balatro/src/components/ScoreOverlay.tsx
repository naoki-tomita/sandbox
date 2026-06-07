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
      background: 'rgba(0,0,0,0.45)',
      animation: 'overlayBackdrop 1.8s ease-out forwards',
    }}>
      <div style={{
        textAlign: 'center',
        background: 'rgba(15,20,30,0.92)',
        border: `2px solid ${color}`,
        borderRadius: 20,
        padding: '28px 44px',
        boxShadow: `0 0 40px ${color}55, 0 8px 32px rgba(0,0,0,0.7)`,
        backdropFilter: 'blur(8px)',
        minWidth: 300,
        animation: 'overlayEnter 1.8s ease-out forwards',
      }}>
        {/* Hand name */}
        <div style={{
          fontSize: 36,
          fontWeight: 'bold',
          color: '#fff',
          letterSpacing: 3,
          marginBottom: 4,
          animation: 'slideInUp 0.25s ease-out backwards',
          animationDelay: '0.05s',
        }}>
          {HAND_DISPLAY_NAMES[play.handName].toUpperCase()}
        </div>

        {/* Color accent bar */}
        <div style={{
          height: 3,
          background: color,
          borderRadius: 2,
          marginBottom: 20,
          boxShadow: `0 0 10px ${color}`,
          animation: 'slideInUp 0.25s ease-out backwards',
          animationDelay: '0.1s',
        }} />

        {/* Formula */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          fontSize: 26,
          fontWeight: 'bold',
        }}>
          <div style={{ textAlign: 'center', animation: 'popIn 0.3s ease-out backwards', animationDelay: '0.2s' }}>
            <div style={{ color: '#7eb8f7', fontSize: 30 }}>{play.chips}</div>
            <div style={{ color: '#fff', fontSize: 11, opacity: 0.6, fontWeight: 'normal', letterSpacing: 1 }}>CHIPS</div>
          </div>

          <span style={{ color: '#fff', opacity: 0.4, fontSize: 22, animation: 'popIn 0.3s ease-out backwards', animationDelay: '0.28s' }}>×</span>

          <div style={{ textAlign: 'center', animation: 'popIn 0.3s ease-out backwards', animationDelay: '0.35s' }}>
            <div style={{ color: '#f08080', fontSize: 30 }}>{play.mult}</div>
            <div style={{ color: '#fff', fontSize: 11, opacity: 0.6, fontWeight: 'normal', letterSpacing: 1 }}>MULT</div>
          </div>

          <span style={{ color: '#fff', opacity: 0.4, fontSize: 22, animation: 'popIn 0.3s ease-out backwards', animationDelay: '0.43s' }}>=</span>

          <div style={{ textAlign: 'center', animation: 'numberBounce 0.4s ease-out backwards', animationDelay: '0.5s' }}>
            <div style={{ color, fontSize: 38, textShadow: `0 0 16px ${color}` }}>
              {play.total.toLocaleString()}
            </div>
            <div style={{ color: '#fff', fontSize: 11, opacity: 0.6, fontWeight: 'normal', letterSpacing: 1 }}>SCORE</div>
          </div>
        </div>
      </div>
    </div>
  );
}
