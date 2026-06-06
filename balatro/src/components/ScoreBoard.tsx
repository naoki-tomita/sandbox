import { useId } from 'react';
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

function LastPlayReveal({ play }: { play: PlayScore }) {
  return (
    <div style={{
      marginTop: 12,
      padding: '10px 14px',
      background: 'rgba(241,196,15,0.08)',
      borderRadius: 8,
      borderLeft: '3px solid #f1c40f',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{
        color: '#f1c40f',
        fontWeight: 'bold',
        fontSize: 15,
        animation: 'slideInUp 0.25s ease-out backwards',
        animationDelay: '0s',
      }}>
        {HAND_DISPLAY_NAMES[play.handName]}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, flexWrap: 'wrap' }}>
        <span style={{ animation: 'slideInUp 0.25s ease-out backwards', animationDelay: '0.08s' }}>
          <span style={{ color: '#7eb8f7', fontWeight: 'bold' }}>{play.chips}</span>
          <span style={{ opacity: 0.6 }}> chips</span>
        </span>
        <span style={{ opacity: 0.5, animation: 'slideInUp 0.25s ease-out backwards', animationDelay: '0.16s' }}>×</span>
        <span style={{ animation: 'slideInUp 0.25s ease-out backwards', animationDelay: '0.24s' }}>
          <span style={{ color: '#f08080', fontWeight: 'bold' }}>{play.mult}</span>
          <span style={{ opacity: 0.6 }}> mult</span>
        </span>
        <span style={{ opacity: 0.5, animation: 'slideInUp 0.25s ease-out backwards', animationDelay: '0.32s' }}>=</span>
        <span style={{
          color: '#e67e22',
          fontWeight: 'bold',
          fontSize: 18,
          animation: 'popIn 0.35s cubic-bezier(0.34,1.56,0.64,1) backwards',
          animationDelay: '0.42s',
        }}>
          {play.total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function ScoreBoard({ currentScore, blindTarget, handsPlayed, maxHands, discardsLeft, lastPlay, blindIndex }: Props) {
  const animatedScore = useCounter(currentScore, 600);
  const revealId = useId();

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
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#f1c40f', transition: 'color 0.3s' }}>
            {animatedScore.toLocaleString()}
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
        <div style={{
          width: `${Math.min((currentScore / blindTarget) * 100, 100)}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #f1c40f, #e67e22)',
          borderRadius: 4,
          transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          boxShadow: '0 0 8px rgba(241,196,15,0.6)',
        }} />
      </div>

      {lastPlay && <LastPlayReveal key={`${revealId}-${lastPlay.handName}-${lastPlay.total}`} play={lastPlay} />}
    </div>
  );
}
