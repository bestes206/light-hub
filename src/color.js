// HSV → RGB. h in degrees [0, 360), s and v in [0, 1].
export function hsvToRgb(h, s, v) {
  const c = v * s;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 1)      { r1 = c; g1 = x; b1 = 0; }
  else if (hh < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hh < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hh < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; g1 = 0; b1 = c; }
  else             { r1 = c; g1 = 0; b1 = x; }
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// hue 0-360 → fully-saturated, full-value RGB
export function hueToRgb(hue) {
  return hsvToRgb(hue, 1, 1);
}

// (x, y) relative to wheel center, +x right, +y down (DOM coords).
// Returns hue in degrees [0, 360). 3 o'clock = 0°, going counter-clockwise.
// Negate y so y-up matches mathematical convention.
export function polarToHue(x, y) {
  let deg = Math.atan2(-y, x) * 180 / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}
