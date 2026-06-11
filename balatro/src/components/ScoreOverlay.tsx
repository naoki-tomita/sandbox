import type { CSSProperties } from 'react';
import { PlayScore } from '../game/scoring';
import { HAND_DISPLAY_NAMES } from '../game/hands';

const CORNER_PIPS: Array<{ symbol: string; style: CSSProperties; }> = [
  { symbol: '♠', style: { top: 10, left: 14 } },
  { symbol: '♥', style: { top: 10, right: 14, color: 'var(--lacquer)' } },
  { symbol: '♦', style: { bottom: 10, left: 14, color: 'var(--lacquer)' } },
  { symbol: '♣', style: { bottom: 10, right: 14 } },
];

function Factor({ value, label, color, delay }: { value: number; label: string; color: string; delay: string; }) {
  return (
    <div style={{ textAlign: 'center', animation: 'popIn 0.3s ease-out backwards', animationDelay: delay }}>
      <div style={{ fontFamily: 'var(--font-display)', color, fontSize: 30 }}>{value}</div>
      <div style={{ fontSize: 11, opacity: 0.55, letterSpacing: 2 }}>{label}</div>
    </div>
  );
}

/**
 * The maker's duty stamp: each scored hand is pressed onto the table
 * as a gilt-framed cartouche, chips in card-back blue, mult in lacquer red.
 */
export function ScoreOverlay({ play }: { play: PlayScore; }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 150,
      background: 'rgba(20,6,5,0.55)',
      animation: 'overlayBackdrop 1.8s ease-out forwards',
    }}>
      <div style={{
        position: 'relative',
        textAlign: 'center',
        background: 'var(--paper)',
        color: 'var(--ink)',
        borderRadius: 10,
        border: '2px solid var(--gilt)',
        boxShadow: 'inset 0 0 0 5px var(--paper), inset 0 0 0 6px var(--gilt), 0 12px 40px rgba(0,0,0,0.65)',
        padding: '30px 48px 26px',
        minWidth: 320,
        animation: 'overlayEnter 1.8s ease-out forwards',
      }}>
        {CORNER_PIPS.map(pip => (
          <span
            key={pip.symbol}
            aria-hidden="true"
            style={{ position: 'absolute', fontSize: 13, opacity: 0.7, ...pip.style }}
          >
            {pip.symbol}
          </span>
        ))}

        <div style={{
          fontSize: 11,
          letterSpacing: 4,
          color: 'var(--lacquer)',
          marginBottom: 4,
          animation: 'slideInUp 0.25s ease-out backwards',
          animationDelay: '0.05s',
        }}>
          SCORED
        </div>

        {/* Hand name */}
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34,
          letterSpacing: 1,
          marginBottom: 6,
          animation: 'slideInUp 0.25s ease-out backwards',
          animationDelay: '0.05s',
        }}>
          {HAND_DISPLAY_NAMES[play.handName]}
        </div>

        <div style={{
          height: 1,
          background: 'var(--gilt)',
          opacity: 0.6,
          marginBottom: 18,
          animation: 'slideInUp 0.25s ease-out backwards',
          animationDelay: '0.1s',
        }} />

        {/* Formula: twin deck inks — chips blue, mult red */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}>
          <Factor value={play.chips} label="CHIPS" color="var(--cardback-blue)" delay="0.2s" />
          <span style={{ opacity: 0.4, fontSize: 22, animation: 'popIn 0.3s ease-out backwards', animationDelay: '0.28s' }}>×</span>
          <Factor value={play.mult} label="MULT" color="var(--lacquer)" delay="0.35s" />
          <span style={{ opacity: 0.4, fontSize: 22, animation: 'popIn 0.3s ease-out backwards', animationDelay: '0.43s' }}>=</span>
          <div style={{ textAlign: 'center', animation: 'numberBounce 0.4s ease-out backwards', animationDelay: '0.5s' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              borderBottom: '3px double var(--gilt)',
              lineHeight: 1.1,
            }}>
              {play.total.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, opacity: 0.55, letterSpacing: 2, marginTop: 3 }}>SCORE</div>
          </div>
        </div>
      </div>
    </div>
  );
}
