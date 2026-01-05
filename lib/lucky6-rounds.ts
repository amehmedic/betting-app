export const LUCKY6_ROUND_MS = 3 * 60 * 1000;

export function getLucky6RoundId(atMs: number = Date.now()) {
  return Math.floor(atMs / LUCKY6_ROUND_MS);
}

export function getLucky6RoundTimes(atMs: number = Date.now()) {
  const roundId = getLucky6RoundId(atMs);
  const roundStart = roundId * LUCKY6_ROUND_MS;
  const nextRound = roundStart + LUCKY6_ROUND_MS;
  return { roundId, roundStart, nextRound };
}
