# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

No test runner is configured. TypeScript strict mode serves as the primary correctness check (`tsc` runs as part of `npm run build`).

## Architecture

### Game logic — `src/game/`

All game rules live here, completely decoupled from React.

- **`cards.ts`** — primitive types (`Suit`, `Rank`, `Card`) and pure functions (`createDeck`, `shuffle`, `cardChips`). Card IDs are `"${rank}-${suit}"` (stable across shuffles).
- **`hands.ts`** — `detectHand(cards)` returns the best `HandResult` from the selected cards. Handles ace-low straight (A-2-3-4-5).
- **`scoring.ts`** — `calculateScore(hand)` returns `PlayScore` using `(baseChips + sum of cardChips) × baseMult`. `BLIND_TARGETS` array drives progression.
- **`GameEngine.ts`** — immutable class that owns `GameState`. Every method returns a **new** `GameEngine` instance (no mutation). React calls `setEngine(e => e.someMethod())`.

`GameEngine` phases: `selecting → playing → blind_cleared | game_over`. The `playing` phase exists purely to give React time for the fly-off animation (500 ms); `startPlay()` sets it, `resolvePlay()` (called after the timeout) applies the score.

### React — `src/`

`App.tsx` holds the single `useState<GameEngine>` and all `useCallback` handlers. No other component owns state. The 500 ms timer between `startPlay` / `resolvePlay` is the only imperative side-effect.

`ScoreBoard` uses `useCounter` (RAF-based animation) to count up the score display.

`ScoreOverlay` shows the hand result for 1.8 s via a `useEffect` on `state.lastPlay` with a `setTimeout`.

### CSS / Styling

- Inline styles for layout, colours, and component-specific animations in `ScoreOverlay`, `Celebration`, etc.
- CSS Modules (`Card.module.css`, `Hand.module.css`) for the card visuals.
- `src/styles/global.css` for keyframes referenced by inline styles (`overlayEnter`, `overlayBackdrop`, `popIn`, `slideInUp`, `confettiFall`, etc.) and base resets.

**Critical rule**: `@keyframes` that are referenced inside a `.module.css` class declaration **must be defined in the same file** — CSS Modules scopes them. Keyframes referenced only via inline `style={{ animation: '...' }}` can live in `global.css`.

### Card animation lifecycle

`Card.tsx` starts with `isDealing = true` on mount, which applies the `.dealing` class and triggers the `dealIn` bounce. An `animationend` listener removes the class immediately after — this prevents the animation from re-firing when React re-renders the component due to class changes (e.g., toggling `.selected`). New cards drawn after a hand automatically remount because `Hand.tsx` keys cards as `` `${dealKey}-${card.id}` `` and `dealKey` increments on each new blind.

## Deployment

Merging to `main` with changes under `balatro/**` triggers `.github/workflows/deploy.yml`, which builds and deploys to GitHub Pages at `https://naoki-tomita.github.io/sandbox/`.

`vite.config.ts` sets `base: '/sandbox/'` to match this path.

## Branch workflow

Create a new branch from `main` for each task. PRs target `main`.
