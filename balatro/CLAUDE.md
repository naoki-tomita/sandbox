# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Unit tests use vitest (`npm test`, watch mode via `npm run test:watch`). They cover the pure game layer only — `src/game/*.test.ts`, with card fixtures in `src/game/testFixtures.ts`. Engine tests construct `GameEngine` with explicit `GameState` objects to stay deterministic despite `shuffle`/draft randomness. CI runs them on every PR touching `balatro/**` (`.github/workflows/test.yml`). TypeScript strict mode (`tsc` during `npm run build`) remains the check for the React layer.

When you change game rules (scoring, hands, jokers, engine flow), update or add tests in the same PR.

## Architecture

### Game logic — `src/game/`

All game rules live here, completely decoupled from React.

- **`cards.ts`** — primitive types (`Suit`, `Rank`, `Card`) and pure functions (`createDeck`, `shuffle`, `cardChips`, `sortCards`). Card IDs are `"${rank}-${suit}"` (stable across shuffles). `sortCards(cards, 'rank' | 'suit')` returns a readability-sorted copy (used by the TUI hand view).
- **`hands.ts`** — `detectHand(cards)` returns the best `HandResult` from the selected cards. Handles ace-low straight (A-2-3-4-5).
- **`scoring.ts`** — `calculateScore(hand, jokers, ctx)` returns `PlayScore`. Pipeline: chips = baseChips + card chips, mult = baseMult, then each owned joker's effect applies **left to right** (chips +=, mult +=, mult ×=). `PlayScore` carries the full breakdown (`baseChips`, `baseMult`, `cardContributions`, `jokerContributions`) so the UI can animate the tally. `BLIND_TARGETS` array drives progression.
- **`jokers.ts`** — the joker pool (`JOKERS` record, keyed by `JokerId`). Each `JokerDef` is `{ id, effect }`; `effect(ctx)` returns a `JokerEffect` (`chips`/`mult`/`xmult`) or `null` when it doesn't trigger. Display names/descriptions are **not** here — they live in `src/i18n` keyed by `JokerId`. `drawJokerChoices(owned)` picks three unowned ones for the draft; `MAX_JOKERS = 5`. Parity jokers use the pip value (Ace = 1, odd), not the internal rank 14.
- **`GameEngine.ts`** — immutable class that owns `GameState`. Every method returns a **new** `GameEngine` instance (no mutation). React calls `setEngine(e => e.someMethod())`.

`GameEngine` phases: `selecting → playing → scored → selecting | blind_cleared | game_over`, plus `blind_cleared → joker_draft → selecting` between blinds. The presentation beats are phases: `playing` covers the fly-off animation (500 ms; `startPlay()` → `resolvePlay()`), and `scored` covers the score-tally overlay — `resolvePlay()` applies the score and draws cards but never decides the outcome; `advanceAfterScore()` (called by the UI when the overlay finishes) does. This guarantees the cleared/game-over popups can't appear behind the overlay. After a clear, `startJokerDraft()` offers three jokers (`pickJoker(id)` / `skipDraft()` both lead to the next blind); jokers persist across blinds and reset on `restart()`.

### Localization — `src/i18n/`

All user-facing copy is localized (Japanese + English). The game layer holds only stable IDs (`HandName`, `JokerId`, `Suit`); their display strings live here, keyed by those IDs.

- **`types.ts`** — the `Translations` interface plus `DeepPartial<T>`. Strings that embed runtime values (counts, score, blind number) are functions so each language controls word order; everything else is a plain string.
- **`en.ts`** — the **complete** `Translations`. English is the fallback, so every key must exist here.
- **`ja.ts`** — a `DeepPartial<Translations>`: a non-English locale only lists what it translates. Anything omitted falls back to English string by string.
- **`index.ts`** — `detectLocale(languages?)` returns the first supported locale (preference order), falling back to `en`. The language list comes from `navigator.languages` in the browser, or POSIX env vars (`LC_ALL`/`LANG`/`LANGUAGE`, e.g. `ja_JP.UTF-8`) when running in a terminal — so the same module drives both the web app and the TUI. `buildTranslations(override)` overlays a locale's partial table onto English **leaf by leaf** (nested tables like `jokers` merge per string; functions are taken whole). `locale` and the active table `t` are resolved **once** at module load — there is no language switcher or React state, so components just `import { t } from '../i18n'` and read `t.someKey`. The web `main.tsx` sets `<html lang>` from `locale`.

When you add a user-facing string, add it to `Translations` and to `en.ts`; translating it elsewhere is optional (untranslated keys show English). When you add a joker or hand, its English `name`/`description` (or hand name) goes in `en.ts` under `jokers` / `handNames`.

### React — `src/`

`App.tsx` holds the single `useState<GameEngine>` and all `useCallback` handlers. No other component owns state. The 500 ms timer between `startPlay` / `resolvePlay` is the only imperative side-effect.

`ScoreBoard` uses `useCounter` (RAF-based animation) to count up the score display.

`ScoreOverlay` renders while `phase === 'scored'`. Its presentation is a sequential script (`useScript` in `src/hooks/useScript.ts`): stamp in → BASE tag → one tag per card → × mult → one gilt tag per triggered joker → = total → hold → stamp out → `onComplete()`, which advances the engine. The CHIPS and MULT counters are *derived* by replaying the scoring pipeline over the beats landed so far. Order lives in the code; only the pauses between beats are durations. Unmounting the overlay silently stops the script.

`JokerShelf` (owned jokers above the scoreboard, hidden while empty) and `JokerDraft` (the 3-choice panel during `joker_draft`) are stateless displays over `state.jokers` / `state.jokerChoices`.

### Terminal UI — `src/tui/`

A second frontend that plays the same game in a terminal, built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal). Run it with `npm run tui`. It reuses the whole game layer and `src/i18n` unchanged — only the *views* are reimplemented for the terminal, and there are **no animations** (the score lands as a single static panel, not a tally script).

- **`App.tsx`** — the TUI counterpart of the web `App`: one `useState<GameEngine>`, a `sortMode` (`rank`/`suit`) for the displayed hand, and an Ink `useInput` keyboard router that switches on `state.phase`. Selection is by number key (`1`-`8` toggle, indexing the *sorted* hand), `enter` plays (it runs `startPlay().resolvePlay()` back to back since there's no fly-off to wait for), `d` discards, `r`/`s` re-sort the hand by rank/suit, the draft takes `1`-`3`/`s`, and `q`/`esc` quits. Sorting is display-only — the engine keys cards by id, so reordering never touches game state.
- **`Card`/`Hand`/`Scoreboard`/`JokerShelf`/`ScoreResult`/`JokerDraft`** — Ink (`<Box>`/`<Text>`) views mirroring the web components. Game text comes from `t`; terminal-only control hints live in **`strings.ts`** (keyed off the shared `locale`), and small render helpers (card label, suit color, joker effect text, progress bar) in **`format.ts`**.
- **`main.tsx`** — the entry: bails with a message unless `process.stdin.isTTY` (Ink needs raw mode), then renders `<App>`.

Build/types: the TUI is **excluded from the main `tsconfig.json`** (which pins `types: []` to keep Node globals out of the browser build) and type-checked separately via **`tsconfig.tui.json`** (`npm run typecheck:tui`, adds `@types/node`). It runs through `tsx`, so pass `--tsconfig tsconfig.tui.json` (the `tui` script does) or JSX falls back to the classic runtime.

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
