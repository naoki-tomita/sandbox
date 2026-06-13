# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Unit tests use vitest (`npm test`, watch mode via `npm run test:watch`). They cover the pure game layer only — `src/game/*.test.ts`, with card fixtures in `src/game/testFixtures.ts`. Engine tests construct `GameEngine` with explicit `GameState` objects to stay deterministic despite `shuffle`/draft randomness. CI runs them on every PR touching `balatro/**` (`.github/workflows/test.yml`). TypeScript strict mode (`tsc` during `npm run build`) remains the check for the React layer.

When you change game rules (scoring, hands, jokers, engine flow), update or add tests in the same PR.

## Architecture

### Game logic — `src/game/`

All game rules live here, completely decoupled from React.

- **`cards.ts`** — primitive types (`Suit`, `Rank`, `Card`) and pure functions (`createDeck`, `shuffle`, `cardChips`). Card IDs are `"${rank}-${suit}"` (stable across shuffles).
- **`hands.ts`** — `detectHand(cards)` returns the best `HandResult` from the selected cards. Handles ace-low straight (A-2-3-4-5).
- **`scoring.ts`** — `calculateScore(hand, jokers, ctx)` returns `PlayScore`. Pipeline: chips = baseChips + card chips, mult = baseMult, then each owned joker's effect applies **left to right** (chips +=, mult +=, mult ×=). `PlayScore` carries the full breakdown (`baseChips`, `baseMult`, `cardContributions`, `jokerContributions`) so the UI can animate the tally. `BLIND_TARGETS` array drives progression.
- **`jokers.ts`** — the joker pool (`JOKERS` record, keyed by `JokerId`). Each `JokerDef` is `{ id, effect }`; `effect(ctx)` returns a `JokerEffect` (`chips`/`mult`/`xmult`) or `null` when it doesn't trigger. Display names/descriptions are **not** here — they live in `src/i18n` keyed by `JokerId`. `drawJokerChoices(owned)` picks three unowned ones for the draft; `MAX_JOKERS = 5`. Parity jokers use the pip value (Ace = 1, odd), not the internal rank 14.
- **`GameEngine.ts`** — immutable class that owns `GameState`. Every method returns a **new** `GameEngine` instance (no mutation). React calls `setEngine(e => e.someMethod())`.

`GameEngine` phases: `selecting → playing → scored → selecting | blind_cleared | game_over`, plus `blind_cleared → joker_draft → selecting` between blinds. The presentation beats are phases: `playing` covers the fly-off animation (500 ms; `startPlay()` → `resolvePlay()`), and `scored` covers the score-tally overlay — `resolvePlay()` applies the score and draws cards but never decides the outcome; `advanceAfterScore()` (called by the UI when the overlay finishes) does. This guarantees the cleared/game-over popups can't appear behind the overlay. After a clear, `startJokerDraft()` offers three jokers (`pickJoker(id)` / `skipDraft()` both lead to the next blind); jokers persist across blinds and reset on `restart()`.

### Localization — `src/i18n/`

All user-facing copy is localized (Japanese + English). The game layer holds only stable IDs (`HandName`, `JokerId`, `Suit`); their display strings live here, keyed by those IDs.

- **`types.ts`** — the `Translations` interface. Strings that embed runtime values (counts, score, blind number) are functions so each language controls word order; everything else is a plain string.
- **`en.ts` / `ja.ts`** — the two dictionaries, each a full `Translations`. TypeScript guarantees they stay in sync (a missing key fails `tsc`).
- **`index.ts`** — `detectLocale(languages?)` reads `navigator.languages` (preference order) and returns the first supported locale, falling back to `en`. `locale` and the active table `t` are resolved **once** at module load — there is no language switcher or React state, so components just `import { t } from '../i18n'` and read `t.someKey`. `main.tsx` sets `<html lang>` from `locale`.

When you add a user-facing string, add it to `Translations` and both dictionaries. When you add a joker or hand, add its `name`/`description` (or hand name) to `t.jokers` / `t.handNames` in both languages.

### React — `src/`

`App.tsx` holds the single `useState<GameEngine>` and all `useCallback` handlers. No other component owns state. The 500 ms timer between `startPlay` / `resolvePlay` is the only imperative side-effect.

`ScoreBoard` uses `useCounter` (RAF-based animation) to count up the score display.

`ScoreOverlay` renders while `phase === 'scored'`. Its presentation is a sequential script (`useScript` in `src/hooks/useScript.ts`): stamp in → BASE tag → one tag per card → × mult → one gilt tag per triggered joker → = total → hold → stamp out → `onComplete()`, which advances the engine. The CHIPS and MULT counters are *derived* by replaying the scoring pipeline over the beats landed so far. Order lives in the code; only the pauses between beats are durations. Unmounting the overlay silently stops the script.

`JokerShelf` (owned jokers above the scoreboard, hidden while empty) and `JokerDraft` (the 3-choice panel during `joker_draft`) are stateless displays over `state.jokers` / `state.jokerChoices`.

### CSS / Styling

- Visual identity: "Maker's Mark" — a 19th-century playing-card maker's parlour. Design tokens live as CSS custom properties in `global.css` (`--mahogany`, `--paper`, `--ink`, `--lacquer`, `--cardback-blue`, `--gilt`). Chips are always card-back blue, mult is always lacquer red (the twin deck inks). Display face is Abril Fatface (`--font-display`), body is Crimson Pro (`--font-body`), both loaded from Google Fonts in `index.html`.
- Inline styles for layout, colours, and component-specific animations in `ScoreOverlay`, `Celebration`, etc. Inline styles reference the tokens via `var(--*)`.
- CSS Modules (`Card.module.css`, `Hand.module.css`) for the card visuals.
- `src/styles/global.css` for keyframes referenced by inline styles (`overlayEnter`, `overlayBackdrop`, `popIn`, `slideInUp`, `confettiFall`, etc.) and base resets.

**Critical rule**: `@keyframes` that are referenced inside a `.module.css` class declaration **must be defined in the same file** — CSS Modules scopes them. Keyframes referenced only via inline `style={{ animation: '...' }}` can live in `global.css`.

### Card animation lifecycle

`Card.tsx` starts with `isDealing = true` on mount, which applies the `.dealing` class and triggers the `dealIn` bounce. An `animationend` listener removes the class immediately after — this prevents the animation from re-firing when React re-renders the component due to class changes (e.g., toggling `.selected`). New cards drawn after a hand automatically remount because `Hand.tsx` keys cards as `` `${dealKey}-${card.id}` `` and `dealKey` increments on each new blind.

## Deployment

Merging to `main` with changes under `balatro/**` triggers `.github/workflows/deploy.yml`, which builds and deploys to GitHub Pages at `https://naoki-tomita.github.io/sandbox/balatro/`.

`vite.config.ts` sets `base: '/sandbox/balatro/'` to match this path.

## Branch workflow

Create a new branch from `main` for each task. PRs target `main`.
