import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { PlayScore } from '../game/scoring';
import { HAND_DISPLAY_NAMES } from '../game/hands';
import { RANK_LABELS, SUIT_SYMBOLS } from '../game/cards';
import { MAX_SELECTED } from '../game/GameEngine';

/* Tally timeline (ms from mount) */
const BASE_TAG_AT = 500;
const CARD_TAGS_FROM = 700;
const TAG_STEP = 150;
const MULT_DELAY = 150;   // × MULT appears this long after the last card tag
const TOTAL_DELAY = 250;  // = TOTAL appears this long after the mult
const FINAL_HOLD = 1150;  // dwell after the slowest possible total reveal, incl. lift-off

/** Total lifetime of the overlay; App unmounts it after this. Derived from
    the timeline above at the maximum hand size, so retuning any step can
    never outlive the overlay. */
export const OVERLAY_DURATION_MS =
  CARD_TAGS_FROM + MAX_SELECTED * TAG_STEP + MULT_DELAY + TOTAL_DELAY + FINAL_HOLD;

const RED_SUITS = new Set(['hearts', 'diamonds']);

const CORNER_PIPS: Array<{ symbol: string; style: CSSProperties; }> = [
  { symbol: '♠', style: { top: 10, left: 14 } },
  { symbol: '♥', style: { top: 10, right: 14, color: 'var(--lacquer)' } },
  { symbol: '♦', style: { bottom: 10, left: 14, color: 'var(--lacquer)' } },
  { symbol: '♣', style: { bottom: 10, right: 14 } },
];

const tagLabelStyle: CSSProperties = { fontSize: 10, letterSpacing: 1, opacity: 0.55 };

function Tag({ top, topColor, chips, delayMs }: { top: string; topColor?: string; chips: number; delayMs: number; }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 1,
      minWidth: 38,
      padding: '5px 6px',
      background: '#fdf8ec',
      border: '1px solid var(--paper-shade)',
      borderRadius: 5,
      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      animation: 'popIn 0.3s ease-out backwards',
      animationDelay: `${delayMs}ms`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1, color: topColor }}>{top}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cardback-blue)' }}>+{chips}</div>
    </div>
  );
}

/**
 * The maker's duty stamp, now a running tally: the hand's base chips and
 * each card's value land one by one, ticking the CHIPS counter up, before
 * the mult and total are pressed in.
 */
export function ScoreOverlay({ play }: { play: PlayScore; }) {
  const [chipsShown, setChipsShown] = useState(0);

  const cardCount = play.cardContributions.length;
  const multAt = CARD_TAGS_FROM + cardCount * TAG_STEP + MULT_DELAY;
  const totalAt = multAt + TOTAL_DELAY;

  // Tick the chips counter in sync with each tag landing
  useEffect(() => {
    const timers = [
      setTimeout(() => setChipsShown(play.baseChips), BASE_TAG_AT),
      ...play.cardContributions.map((c, i) =>
        setTimeout(
          () => setChipsShown(prev => prev + c.chips),
          CARD_TAGS_FROM + i * TAG_STEP,
        )),
    ];
    return () => timers.forEach(clearTimeout);
  }, [play]);

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
      animation: `overlayBackdrop ${OVERLAY_DURATION_MS}ms ease-out forwards`,
    }}>
      <div style={{
        position: 'relative',
        textAlign: 'center',
        background: 'var(--paper)',
        color: 'var(--ink)',
        borderRadius: 10,
        border: '2px solid var(--gilt)',
        boxShadow: 'inset 0 0 0 5px var(--paper), inset 0 0 0 6px var(--gilt), 0 12px 40px rgba(0,0,0,0.65)',
        padding: '30px 44px 26px',
        minWidth: 360,
        maxWidth: 'calc(100vw - 32px)',
        animation: `overlayEnter ${OVERLAY_DURATION_MS}ms ease-out forwards`,
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
          marginBottom: 14,
          animation: 'slideInUp 0.25s ease-out backwards',
          animationDelay: '0.1s',
        }} />

        {/* The tally: hand base + one tag per card */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 16,
        }}>
          <Tag top="BASE" chips={play.baseChips} delayMs={BASE_TAG_AT} />
          {play.cardContributions.map((c, i) => (
            <Tag
              key={c.card.id}
              top={`${RANK_LABELS[c.card.rank]}${SUIT_SYMBOLS[c.card.suit]}`}
              topColor={RED_SUITS.has(c.card.suit) ? 'var(--lacquer)' : undefined}
              chips={c.chips}
              delayMs={CARD_TAGS_FROM + i * TAG_STEP}
            />
          ))}
        </div>

        {/* Formula: twin deck inks — chips blue, mult red */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}>
          <div style={{ textAlign: 'center', animation: 'popIn 0.3s ease-out backwards', animationDelay: `${BASE_TAG_AT - 100}ms` }}>
            <div
              key={chipsShown}
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--cardback-blue)',
                fontSize: 30,
                animation: chipsShown > 0 ? 'chipTick 0.25s ease-out' : undefined,
              }}
            >
              {chipsShown}
            </div>
            <div style={tagLabelStyle}>CHIPS</div>
          </div>
          <span style={{ opacity: 0.4, fontSize: 22, animation: 'popIn 0.3s ease-out backwards', animationDelay: `${multAt - 80}ms` }}>×</span>
          <div style={{ textAlign: 'center', animation: 'popIn 0.3s ease-out backwards', animationDelay: `${multAt}ms` }}>
            <div style={{ fontFamily: 'var(--font-display)', color: 'var(--lacquer)', fontSize: 30 }}>{play.mult}</div>
            <div style={tagLabelStyle}>MULT</div>
          </div>
          <span style={{ opacity: 0.4, fontSize: 22, animation: 'popIn 0.3s ease-out backwards', animationDelay: `${totalAt - 80}ms` }}>=</span>
          <div style={{ textAlign: 'center', animation: `numberBounce 0.4s ease-out backwards`, animationDelay: `${totalAt}ms` }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              borderBottom: '3px double var(--gilt)',
              lineHeight: 1.1,
            }}>
              {play.total.toLocaleString()}
            </div>
            <div style={{ ...tagLabelStyle, fontSize: 11, marginTop: 3 }}>SCORE</div>
          </div>
        </div>
      </div>
    </div>
  );
}
