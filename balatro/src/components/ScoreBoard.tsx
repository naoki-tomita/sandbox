import type { CSSProperties } from 'react';
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

const labelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--ink)',
  opacity: 0.55,
};

export function ScoreBoard({ currentScore, blindTarget, handsPlayed, maxHands, discardsLeft, lastPlay, blindIndex }: Props) {
  const animatedScore = useCounter(currentScore, 700);
  const pct = Math.min((currentScore / blindTarget) * 100, 100);

  return (
    <div style={{
      background: 'var(--paper)',
      color: 'var(--ink)',
      border: '1px solid var(--paper-shade)',
      borderRadius: 10,
      boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
      padding: '16px clamp(14px, 4vw, 24px)',
      width: '100%',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ ...labelStyle, color: 'var(--lacquer)', opacity: 1 }}>
            Blind No. {blindIndex + 1}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(27px, 8vw, 34px)', lineHeight: 1.2 }}>
            {animatedScore.toLocaleString()}
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--ink)',
              opacity: 0.5,
              marginLeft: 8,
            }}>
              of {blindTarget.toLocaleString()}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'clamp(12px, 3.5vw, 20px)', textAlign: 'center' }}>
          <div>
            <div style={labelStyle}>Hands</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>{maxHands - handsPlayed}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--paper-shade)' }} />
          <div>
            <div style={labelStyle}>Discards</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>{discardsLeft}</div>
          </div>
        </div>
      </div>

      {/* Progress: gilt fill in a recessed groove */}
      <div style={{
        background: 'var(--paper-shade)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
        borderRadius: 4,
        height: 10,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #b08a35, var(--gilt))',
          borderRadius: 4,
          transition: 'width 0.7s cubic-bezier(0.34,1.56,0.64,1)',
        }} />
      </div>

      {/* Last play summary (compact) */}
      {lastPlay && (
        <div style={{
          marginTop: 10,
          fontSize: 14,
          display: 'flex',
          gap: 6,
          alignItems: 'baseline',
        }}>
          <span style={{ color: 'var(--lacquer)', fontWeight: 600 }}>{HAND_DISPLAY_NAMES[lastPlay.handName]}</span>
          <span style={{ opacity: 0.6 }}>scored +{lastPlay.total.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
