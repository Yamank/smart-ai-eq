export type Band = { freq: number; gain: number; q: number; reason?: string };
export type BandCount = 8 | 10;

export const BAND_LIMITS: Record<BandCount, [number, number][]> = {
  8: [[20, 99], [100, 199], [200, 399], [400, 999], [1000, 2999], [3000, 5999], [6000, 11999], [12000, 20000]],
  10: [[20, 49], [50, 99], [100, 199], [200, 399], [400, 799], [800, 1599], [1600, 3199], [3200, 6399], [6400, 12799], [12800, 20000]],
};

export const GAIN_MAX = 8;

export const roundGain = (g: number) => Math.max(-GAIN_MAX, Math.min(GAIN_MAX, Math.round(g * 2) / 2));
export const roundQ = (q: number) => Math.max(0.1, Math.min(10, Math.round(q * 10) / 10));
export const clampFreq = (f: number, i: number, count: BandCount) => {
  const [lo, hi] = BAND_LIMITS[count][i];
  return Math.max(lo, Math.min(hi, Math.round(f)));
};

export const flatBands = (count: BandCount): Band[] =>
  BAND_LIMITS[count].map(([lo, hi]) => ({ freq: Math.round(Math.sqrt(lo * hi)), gain: 0, q: 1 }));

export const fmtHz = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${f}`);

// RBJ peaking filter magnitude response in dB at frequency f
const FS = 48000;
function peakDb(b: Band, f: number) {
  if (Math.abs(b.gain) < 0.01) return 0;
  const A = Math.pow(10, b.gain / 40);
  const w0 = (2 * Math.PI * b.freq) / FS;
  const alpha = Math.sin(w0) / (2 * b.q);
  const cw = Math.cos(w0);
  const b0 = 1 + alpha * A, b1 = -2 * cw, b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A, a1 = -2 * cw, a2 = 1 - alpha / A;
  const w = (2 * Math.PI * f) / FS;
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

export const responseDb = (bands: Band[], f: number) => bands.reduce((s, b) => s + peakDb(b, f), 0);

export const bandsSpec = (bands: Band[]) =>
  bands.filter((b) => Math.abs(b.gain) >= 0.01).map((b) => `${b.freq}:${b.gain}:${b.q}`).join(",");

export const bandsText = (bands: Band[]) =>
  bands.map((b, i) => `B${i + 1}  ${fmtHz(b.freq)}Hz  ${b.gain > 0 ? "+" : ""}${b.gain}dB  Q${b.q.toFixed(1)}`).join("\n");
