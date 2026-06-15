import { render } from 'ink';
import { App } from './App';
import { ui } from './strings';

// Ink's keyboard handling needs raw mode, which requires an interactive TTY.
if (!process.stdin.isTTY) {
  console.error(ui.needTty);
  process.exit(1);
}

console.clear();
const app = render(<App />);
await app.waitUntilExit();
