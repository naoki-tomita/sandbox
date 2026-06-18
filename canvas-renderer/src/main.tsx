import { render } from './index';
import { Demo } from './demo';

const canvas = document.getElementById('app') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas#app not found');

// <Demo/> animates via its own state, so each setState commits and the
// renderer repaints — no manual frame loop needed here.
render(<Demo />, canvas, { background: '#0d0d1a' });
