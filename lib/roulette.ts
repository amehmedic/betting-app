export type RouletteValue = number | "00";

export const AMERICAN_WHEEL: RouletteValue[] = [
  0,
  32,
  15,
  19,
  4,
  21,
  2,
  25,
  17,
  34,
  6,
  27,
  13,
  36,
  11,
  30,
  8,
  23,
  10,
  5,
  24,
  16,
  33,
  1,
  20,
  14,
  31,
  9,
  22,
  18,
  29,
  7,
  28,
  12,
  35,
  3,
  26,
];

export const RED_NUMBERS = new Set<number>([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function isRed(value: RouletteValue) {
  return typeof value === "number" && RED_NUMBERS.has(value);
}

export function isBlack(value: RouletteValue) {
  return typeof value === "number" && value !== 0 && !RED_NUMBERS.has(value);
}

export function isEven(value: RouletteValue) {
  return typeof value === "number" && value !== 0 && value % 2 === 0;
}

export function isOdd(value: RouletteValue) {
  return typeof value === "number" && value % 2 === 1;
}

export function dozen(value: RouletteValue): 1 | 2 | 3 | null {
  if (typeof value !== "number" || value === 0) return null;
  if (value >= 1 && value <= 12) return 1;
  if (value >= 13 && value <= 24) return 2;
  return 3;
}

export function column(value: RouletteValue): 1 | 2 | 3 | null {
  if (typeof value !== "number" || value === 0) return null;
  const mod = value % 3;
  if (mod === 1) return 1;
  if (mod === 2) return 2;
  return 3;
}

export function spinWheel(): RouletteValue {
  const idx = Math.floor(Math.random() * AMERICAN_WHEEL.length);
  return AMERICAN_WHEEL[idx];
}

export type RouletteBet =
  | { type: "straight"; pick: RouletteValue; amount: number }
  | { type: "split"; pick: RouletteValue[]; amount: number }
  | { type: "corner"; pick: RouletteValue[]; amount: number }
  | { type: "color"; pick: "red" | "black"; amount: number }
  | { type: "parity"; pick: "odd" | "even"; amount: number }
  | { type: "range"; pick: "low" | "high"; amount: number } // low=1-18, high=19-36
  | { type: "dozen"; pick: 1 | 2 | 3; amount: number }
  | { type: "column"; pick: 1 | 2 | 3; amount: number };

export function evaluateBet(bet: RouletteBet, result: RouletteValue): number {
  switch (bet.type) {
    case "straight":
      return bet.pick === result ? bet.amount * 35 : 0;
    case "split":
      return bet.pick.includes(result) ? bet.amount * 17 : 0;
    case "corner":
      return bet.pick.includes(result) ? bet.amount * 8 : 0;
    case "color":
      return (bet.pick === "red" && isRed(result)) || (bet.pick === "black" && isBlack(result))
        ? bet.amount
        : 0;
    case "parity":
      return bet.pick === "odd"
        ? isOdd(result)
          ? bet.amount
          : 0
        : isEven(result)
        ? bet.amount
        : 0;
    case "range":
      if (typeof result !== "number" || result === 0) return 0;
      return bet.pick === "low"
        ? result >= 1 && result <= 18
          ? bet.amount
          : 0
        : result >= 19 && result <= 36
        ? bet.amount
        : 0;
    case "dozen":
      return dozen(result) === bet.pick ? bet.amount * 2 : 0;
    case "column":
      return column(result) === bet.pick ? bet.amount * 2 : 0;
    default:
      return 0;
  }
}
