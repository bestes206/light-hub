import { runSuite, assertDeepEqual, assertEqual } from './lib/assert.js';
import { hsvToRgb, polarToHue, hueToRgb } from '../src/color.js';

// Tolerance helper for trig math
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

const tests = {
  'hueToRgb 0° → red'() {
    const { r, g, b } = hueToRgb(0);
    assertEqual(r, 255); assertEqual(g, 0); assertEqual(b, 0);
  },
  'hueToRgb 120° → green'() {
    const { r, g, b } = hueToRgb(120);
    assertEqual(r, 0); assertEqual(g, 255); assertEqual(b, 0);
  },
  'hueToRgb 240° → blue'() {
    const { r, g, b } = hueToRgb(240);
    assertEqual(r, 0); assertEqual(g, 0); assertEqual(b, 255);
  },
  'hueToRgb 360° wraps to red'() {
    const { r, g, b } = hueToRgb(360);
    assertEqual(r, 255); assertEqual(g, 0); assertEqual(b, 0);
  },

  "polarToHue: 3 o'clock (1, 0) → 0°"() {
    const h = polarToHue(1, 0);
    if (!near(h, 0) && !near(h, 360)) throw new Error(`expected ~0, got ${h}`);
  },
  "polarToHue: 12 o'clock (0, -1) → 90°"() {
    const h = polarToHue(0, -1);
    if (!near(h, 90)) throw new Error(`expected ~90, got ${h}`);
  },
  "polarToHue: 9 o'clock (-1, 0) → 180°"() {
    const h = polarToHue(-1, 0);
    if (!near(h, 180)) throw new Error(`expected ~180, got ${h}`);
  },
  "polarToHue: 6 o'clock (0, 1) → 270°"() {
    const h = polarToHue(0, 1);
    if (!near(h, 270)) throw new Error(`expected ~270, got ${h}`);
  },

  'hsvToRgb (0, 1, 1) → red'() {
    assertDeepEqual(hsvToRgb(0, 1, 1), { r: 255, g: 0, b: 0 });
  },
  'hsvToRgb (0, 0, 1) → white'() {
    assertDeepEqual(hsvToRgb(0, 0, 1), { r: 255, g: 255, b: 255 });
  },
  'hsvToRgb (0, 1, 0) → black'() {
    assertDeepEqual(hsvToRgb(0, 1, 0), { r: 0, g: 0, b: 0 });
  },
};

export const run = () => runSuite('color.js', tests);
