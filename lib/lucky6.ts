export const LUCKY6_COLORS = [
  "red",
  "green",
  "blue",
  "purple",
  "orange",
  "yellow",
  "brown",
  "black",
] as const;

export type Lucky6Color = (typeof LUCKY6_COLORS)[number];

export type Lucky6Ball = {
  number: number;
  color: Lucky6Color;
};

export type Lucky6Draw = {
  balls: Lucky6Ball[];
  completionOrder: Partial<Record<Lucky6Color, number>>;
};

const COLOR_PAYOUTS: Record<number, number> = {
  6: 25000,
  7: 15000,
  8: 7500,
  9: 3000,
  10: 1250,
  11: 700,
  12: 350,
  13: 250,
  14: 175,
  15: 125,
  16: 100,
  17: 90,
  18: 80,
  19: 70,
  20: 60,
  21: 50,
  22: 35,
  23: 25,
  24: 20,
  25: 15,
  26: 12,
  27: 10,
  28: 8,
  29: 7,
  30: 6,
  31: 5,
  32: 4,
  33: 3,
  34: 2,
  35: 1,
};

export function colorForNumber(num: number): Lucky6Color {
  const index = ((num - 1) % LUCKY6_COLORS.length) as number;
  return LUCKY6_COLORS[index];
}

export function generateDeck(): Lucky6Ball[] {
  const balls: Lucky6Ball[] = [];
  for (let i = 1; i <= 48; i += 1) {
    balls.push({ number: i, color: colorForNumber(i) });
  }
  return balls;
}

type RandomSource = () => number;

function shuffle<T>(arr: T[], rng: RandomSource): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeSeed(seed: string | number): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  return hashSeed(String(seed));
}

function createSeededRandom(seed: number): RandomSource {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function runLucky6Draw(seed?: string | number): Lucky6Draw {
  const rng = seed === undefined ? cryptoRandom : createSeededRandom(normalizeSeed(seed));
  const deck = shuffle(generateDeck(), rng);
  const drawn = deck.slice(0, 35);

  const counts: Record<Lucky6Color, number> = {
    red: 0,
    green: 0,
    blue: 0,
    purple: 0,
    orange: 0,
    yellow: 0,
    brown: 0,
    black: 0,
  };

  const completionOrder: Partial<Record<Lucky6Color, number>> = {};

  drawn.forEach((ball, index) => {
    counts[ball.color] += 1;
    if (counts[ball.color] === 6 && completionOrder[ball.color] === undefined) {
      completionOrder[ball.color] = index + 1; // 1-based draw index
    }
  });

  return { balls: drawn, completionOrder };
}

export function colorPayoutForPosition(position: number | undefined): number | null {
  if (!position) return null;
  return COLOR_PAYOUTS[position] ?? null;
}

export function isHigh(number: number): boolean {
  return number > 24;
}

export function isEven(number: number): boolean {
  return number % 2 === 0;
}

export function listColorNumbers(color: Lucky6Color): number[] {
  const offset = LUCKY6_COLORS.indexOf(color) + 1;
  const numbers: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    numbers.push(offset + i * 8);
  }
  return numbers;
}
