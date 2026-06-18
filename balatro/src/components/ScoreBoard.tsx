import type { CSSProperties } from 'react';
import { PlayScore } from '../game/scoring';
import { useCounter } from '../hooks/useCounter';
import { t } from '../i18n';

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
      border: 'none',
      borderRadius: 24,
      boxShadow: 'var(--neu-raised)',
      padding: '18px clamp(16px, 4vw, 26px)',
      width: '100%',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ ...labelStyle, color: 'var(--lacquer)', opacity: 1 }}>
            {t.blindNo(blindIndex + 1)}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(27px, 8vw, 34px)', lineHeight: 1.2 }}>
            {animatedScore.toLocaleString()}
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              color: 'var(--ink)',
              opacity: 0.5,
              marginLeft: 8,
            }}>
              {t.ofTarget(blindTarget.toLocaleString())}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'clamp(12px, 3.5vw, 20px)', textAlign: 'center' }}>
          <div>
            <div style={labelStyle}>{t.handsLeft}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24 }}>{maxHands - handsPlayed}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--paper-shade)' }} />
          <div>
            <div style={labelStyle}>{t.discards}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24 }}>{discardsLeft}</div>
          </div>
        </div>
      </div>

      {/* Progress: gilt fill in a recessed neumorphic groove */}
      <div style={{
        background: 'var(--paper)',
        boxShadow: 'var(--neu-pressed-sm)',
        borderRadius: 8,
        height: 12,
        padding: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #b8975f, var(--gilt))',
          borderRadius: 6,
          boxShadow: '0 1px 2px rgba(168,180,200,0.6)',
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
          <span style={{ color: 'var(--lacquer)', fontWeight: 600 }}>{t.handNames[lastPlay.handName]}</span>
          <span style={{ opacity: 0.6 }}>{t.scoredPlus(lastPlay.total.toLocaleString())}</span>
        </div>
      )}
    </div>
  );
}
