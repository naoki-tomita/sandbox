import { PlayScore } from '../game/scoring';
import { HAND_DISPLAY_NAMES } from '../game/hands';

interface Props {
  currentScore: number;
  blindTarget: number;
  handsPlayed: number;
  maxHands: number;
  discardsLeft: number;
  lastPlay: PlayScore | null;
  blindIndex: number;
}

const progressStyle = (current: number, target: number): React.CSSProperties => ({
  width: `${Math.min((current / target) * 100, 100)}%`,
  height: '100%',
  background: 'linear-gradient(90deg, #f1c40f, #e67e22)',
  borderRadius: 4,
  transition: 'width 0.4s ease',
});

export function ScoreBoard({ currentScore, blindTarget, handsPlayed, maxHands, discardsLeft, lastPlay, blindIndex }: Props) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.45)',
      borderRadius: 12,
      padding: '16px 24px',
      width: '100%',
      maxWidth: 560,
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.6 }}>
            Blind {blindIndex + 1}
          </div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#f1c40f' }}>
            {currentScore.toLocaleString()}
            <span style={{ fontSize: 14, color: '#aaa', marginLeft: 6 }}>/ {blindTarget.toLocaleString()}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Hands</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>
            {maxHands - handsPlayed}
            <span style={{ fontSize: 12, color: '#aaa' }}> left</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Discards</div>
          <div style={{ fontSize: 16, fontWeight: 'bold' }}>
            {discardsLeft}
            <span style={{ fontSize: 12, color: '#aaa' }}> left</span>
          </div>
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={progressStyle(currentScore, blindTarget)} />
      </div>

      {lastPlay && (
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          background: 'rgba(241,196,15,0.1)',
          borderRadius: 8,
          borderLeft: '3px solid #f1c40f',
        }}>
          <span style={{ color: '#f1c40f', fontWeight: 'bold', marginRight: 8 }}>
            {HAND_DISPLAY_NAMES[lastPlay.handName]}
          </span>
          <span style={{ opacity: 0.8, fontSize: 14 }}>
            {lastPlay.chips} chips × {lastPlay.mult} mult = {' '}
          </span>
          <span style={{ color: '#e67e22', fontWeight: 'bold' }}>
            {lastPlay.total.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
