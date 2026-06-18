import { useState } from 'react';
import type { CSSProperties } from 'react';
import { PlayScore, JokerContribution } from '../game/scoring';
import { RANK_LABELS, SUIT_SYMBOLS } from '../game/cards';
import { useScript } from '../hooks/useScript';
import { t } from '../i18n';

/* Pauses between the beats of the tally (ms) */
const STAMP_IN = 500;     // stamp pressed + the hand name gets a beat
const TAG_STEP = 150;     // between each landing tag
const MULT_PAUSE = 300;   // before × MULT
const JOKER_STEP = 380;   // between each joker chiming in
const TOTAL_PAUSE = 250;  // before = TOTAL
const HOLD = 900;         // dwell on the finished formula
const STAMP_OUT = 300;    // lift-off animation length

const RED_SUITS = new Set(['hearts', 'diamonds']);

const CORNER_PIPS: Array<{ symbol: string; style: CSSProperties; }> = [
  { symbol: '♠', style: { top: 10, left: 14 } },
  { symbol: '♥', style: { top: 10, right: 14, color: 'var(--lacquer)' } },
  { symbol: '♦', style: { bottom: 10, left: 14, color: 'var(--lacquer)' } },
  { symbol: '♣', style: { bottom: 10, right: 14 } },
];

const tagLabelStyle: CSSProperties = { fontSize: 10, letterSpacing: 1, opacity: 0.55 };

function Tag({ top, topColor, chips }: { top: string; topColor?: string; chips: number; }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 1,
      minWidth: 38,
      padding: '6px 8px',
      background: 'var(--paper)',
      border: 'none',
      borderRadius: 12,
      boxShadow: 'var(--neu-raised-sm)',
      animation: 'popIn 0.3s ease-out backwards',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1, color: topColor }}>{top}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cardback-blue)' }}>+{chips}</div>
    </div>
  );
}

function jokerEffectText(c: JokerContribution): { text: string; color: string } {
  if (c.xmult) return { text: `×${c.xmult} ${t.multUnit}`, color: 'var(--lacquer)' };
  if (c.mult) return { text: `+${c.mult} ${t.multUnit}`, color: 'var(--lacquer)' };
  return { text: `+${c.chips}`, color: 'var(--cardback-blue)' };
}

/** A joker chiming in: gilt-edged, named, with its effect on the tally. */
function JokerTag({ contribution }: { contribution: JokerContribution }) {
  const { text, color } = jokerEffectText(contribution);
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      minWidth: 64,
      padding: '6px 10px',
      background: 'var(--paper)',
      border: '1px solid var(--gilt-soft)',
      borderRadius: 12,
      boxShadow: 'var(--neu-raised-sm)',
      animation: 'popIn 0.3s ease-out backwards',
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, lineHeight: 1.1 }}>
        {t.jokers[contribution.jokerId].name}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color }}>{text}</div>
    </div>
  );
}

interface Props {
  play: PlayScore;
  /** Called when the stamp has fully lifted away; the game may move on. */
  onComplete: () => void;
}

/**
 * The maker's duty stamp as a running tally. The order of the beats is the
 * code below: stamp lands → BASE tag → one tag per card (chips ticking up)
 * → × mult → = total → hold → lift away → onComplete().
 */
export function ScoreOverlay({ play, onComplete }: Props) {
  // 0 = no tags yet, 1 = BASE landed, 1+i = first i card tags landed
  const [tagCount, setTagCount] = useState(0);
  const [showMult, setShowMult] = useState(false);
  const [jokersLanded, setJokersLanded] = useState(0);
  const [showTotal, setShowTotal] = useState(false);
  const [exiting, setExiting] = useState(false);

  useScript(async wait => {
    await wait(STAMP_IN);
    setTagCount(1);
    for (let i = 0; i < play.cardContributions.length; i++) {
      await wait(TAG_STEP);
      setTagCount(n => n + 1);
    }
    await wait(MULT_PAUSE);
    setShowMult(true);
    for (let i = 0; i < play.jokerContributions.length; i++) {
      await wait(JOKER_STEP);
      setJokersLanded(n => n + 1);
    }
    await wait(TOTAL_PAUSE);
    setShowTotal(true);
    await wait(HOLD);
    setExiting(true);
    await wait(STAMP_OUT);
    onComplete();
  });

  const landedTags = play.cardContributions.slice(0, Math.max(tagCount - 1, 0));
  const landedJokers = play.jokerContributions.slice(0, jokersLanded);
  // Both counters replay the scoring pipeline over the beats landed so far
  const chipsShown = (tagCount === 0
    ? 0
    : play.baseChips + landedTags.reduce((sum, c) => sum + c.chips, 0))
    + landedJokers.reduce((sum, c) => sum + (c.chips ?? 0), 0);
  const multShown = landedJokers.reduce(
    (m, c) => (m + (c.mult ?? 0)) * (c.xmult ?? 1),
    play.baseMult,
  );

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 150,
      background: 'rgba(214, 221, 232, 0.6)',
      backdropFilter: 'blur(3px)',
      WebkitBackdropFilter: 'blur(3px)',
      animation: exiting
        ? `backdropOut ${STAMP_OUT}ms ease-out forwards`
        : 'backdropIn 0.25s ease-out backwards',
    }}>
      <div style={{
        position: 'relative',
        textAlign: 'center',
        background: 'var(--paper)',
        color: 'var(--ink)',
        borderRadius: 28,
        border: 'none',
        boxShadow: 'var(--neu-raised-lg)',
        padding: '30px clamp(16px, 6vw, 44px) 26px',
        minWidth: 'min(360px, calc(100vw - 32px))',
        maxWidth: 'calc(100vw - 32px)',
        animation: exiting
          ? `stampOut ${STAMP_OUT}ms ease-in forwards`
          : 'stampIn 0.35s ease-out backwards',
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
        }}>
          {t.scoredStamp}
        </div>

        {/* Hand name */}
        <div style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'clamp(26px, 8vw, 34px)',
          letterSpacing: 1,
          marginBottom: 6,
        }}>
          {t.handNames[play.handName]}
        </div>

        <div style={{
          height: 1,
          background: 'var(--gilt)',
          opacity: 0.6,
          marginBottom: 14,
        }} />

        {/* The tally: hand base + one tag per card, landing in order */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 16,
          minHeight: 42,
        }}>
          {tagCount >= 1 && <Tag top={t.baseTag} chips={play.baseChips} />}
          {landedTags.map(c => (
            <Tag
              key={c.card.id}
              top={`${RANK_LABELS[c.card.rank]}${SUIT_SYMBOLS[c.card.suit]}`}
              topColor={RED_SUITS.has(c.card.suit) ? 'var(--lacquer)' : undefined}
              chips={c.chips}
            />
          ))}
          {landedJokers.map(c => (
            <JokerTag key={c.jokerId} contribution={c} />
          ))}
        </div>

        {/* Formula: twin deck inks — chips blue, mult red */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'clamp(8px, 3vw, 14px)',
          minHeight: 64,
        }}>
          {tagCount >= 1 && (
            <div style={{ textAlign: 'center', animation: 'popIn 0.3s ease-out backwards' }}>
              <div
                key={chipsShown}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  color: 'var(--cardback-blue)',
                  fontSize: 30,
                  animation: 'chipTick 0.25s ease-out',
                }}
              >
                {chipsShown}
              </div>
              <div style={tagLabelStyle}>{t.chips}</div>
            </div>
          )}
          {showMult && (
            <>
              <span style={{ opacity: 0.4, fontSize: 22, animation: 'popIn 0.3s ease-out backwards' }}>×</span>
              <div style={{ textAlign: 'center', animation: 'popIn 0.3s ease-out backwards' }}>
                <div
                  key={multShown}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    color: 'var(--lacquer)',
                    fontSize: 30,
                    animation: 'chipTick 0.25s ease-out',
                  }}
                >
                  {multShown}
                </div>
                <div style={tagLabelStyle}>{t.mult}</div>
              </div>
            </>
          )}
          {showTotal && (
            <>
              <span style={{ opacity: 0.4, fontSize: 22, animation: 'popIn 0.3s ease-out backwards' }}>=</span>
              <div style={{ textAlign: 'center', animation: 'numberBounce 0.4s ease-out backwards' }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 'clamp(32px, 9vw, 40px)',
                  borderBottom: '3px double var(--gilt)',
                  lineHeight: 1.1,
                }}>
                  {play.total.toLocaleString()}
                </div>
                <div style={{ ...tagLabelStyle, fontSize: 11, marginTop: 3 }}>{t.score}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
