import { PlayScore } from '../game/scoring';
import { HAND_DISPLAY_NAMES } from '../game/hands';
import { useCounter } from '../hooks/useCounter';

interface Props {
  currentScore: number;
  blindTarget: number;
  handsPlayed: number;
  maxHands: number;
  discardsLeft: number;
  lastPlay: PlayScore | null;
  blindIndex: number;
}

export function ScoreBoard({ currentScore, blindTarget, handsPlayed, maxHands, discardsLeft, lastPlay, blindIndex }: Props) {
  const animatedScore = useCounter(currentScore, 700);
  const pct = Math.min((currentScore / blindTarget) * 100, 100);

  return (
    <div style={{
      background: 'rgba(0,0,0,0.5)',
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
          <div style={{ fontSize: 30, fontWeight: 'bold', color: '#f1c40f' }}>
            {animatedScore.toLocaleString()}
            <span style={{ fontSize: 14, color: '#888', marginLeft: 8 }}>/ {blindTarget.toLocaleString()}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>
          <div style={{ opacity: 0.6 }}>Hands left</div>
          <div style={{ fontSize: 22, fontWeight: 'bold' }}>{maxHands - handsPlayed}</div>
          <div style={{ opacity: 0.6, marginTop: 4 }}>Discards</div>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>{discardsLeft}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #f1c40f, #e67e22)',
          borderRadius: 4,
          transition: 'width 0.7s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: '0 0 10px rgba(241,196,15,0.7)',
        }} />
      </div>

      {/* Last play summary (compact) */}
      {lastPlay && (
        <div style={{
          marginTop: 10,
          fontSize: 13,
          opacity: 0.65,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}>
          <span style={{ color: '#f1c40f' }}>{HAND_DISPLAY_NAMES[lastPlay.handName]}</span>
          <span>→ +{lastPlay.total.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
