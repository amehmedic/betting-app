import type { Card, Rank } from "@/lib/blackjack";
import { buildDeck, shuffle, drawCard } from "@/lib/blackjack";

type HandScore = {
  category: number;
  tiebreaker: number[];
  label: string;
};

const RANK_VALUE: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  "10": 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

function rankToValue(rank: Rank) {
  return RANK_VALUE[rank];
}

function sortedRanks(cards: Card[]) {
  return cards.map((c) => rankToValue(c.rank)).sort((a, b) => b - a);
}

function evaluateFive(cards: Card[]): HandScore {
  const ranks = sortedRanks(cards);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = uniqueRanks[0] ?? 0;
  if (uniqueRanks.length === 5 && uniqueRanks[0] - uniqueRanks[4] === 4) {
    isStraight = true;
  } else if (uniqueRanks.length === 5 && uniqueRanks[0] === 14 && uniqueRanks[1] === 5) {
    isStraight = true;
    straightHigh = 5;
  }

  const counts = new Map<number, number>();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.rank - a.rank));

  if (isStraight && isFlush) {
    return { category: 8, tiebreaker: [straightHigh], label: "Straight flush" };
  }
  if (groups[0]?.count === 4) {
    const fourRank = groups[0].rank;
    const kicker = groups[1].rank;
    return { category: 7, tiebreaker: [fourRank, kicker], label: "Four of a kind" };
  }
  if (groups[0]?.count === 3 && groups[1]?.count === 2) {
    return { category: 6, tiebreaker: [groups[0].rank, groups[1].rank], label: "Full house" };
  }
  if (isFlush) {
    return { category: 5, tiebreaker: ranks, label: "Flush" };
  }
  if (isStraight) {
    return { category: 4, tiebreaker: [straightHigh], label: "Straight" };
  }
  if (groups[0]?.count === 3) {
    const kickers = groups.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return { category: 3, tiebreaker: [groups[0].rank, ...kickers], label: "Three of a kind" };
  }
  if (groups[0]?.count === 2 && groups[1]?.count === 2) {
    const highPair = Math.max(groups[0].rank, groups[1].rank);
    const lowPair = Math.min(groups[0].rank, groups[1].rank);
    const kicker = groups[2].rank;
    return { category: 2, tiebreaker: [highPair, lowPair, kicker], label: "Two pair" };
  }
  if (groups[0]?.count === 2) {
    const kickers = groups.slice(1).map((g) => g.rank).sort((a, b) => b - a);
    return { category: 1, tiebreaker: [groups[0].rank, ...kickers], label: "One pair" };
  }
  return { category: 0, tiebreaker: ranks, label: "High card" };
}

export function compareScores(a: HandScore, b: HandScore) {
  if (a.category !== b.category) return Math.sign(a.category - b.category);
  const len = Math.max(a.tiebreaker.length, b.tiebreaker.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a.tiebreaker[i] ?? 0) - (b.tiebreaker[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

export function bestHandFromSeven(cards: Card[]) {
  if (cards.length < 5) {
    throw new Error("Need at least 5 cards to evaluate.");
  }
  let best: HandScore | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a += 1) {
    for (let b = a + 1; b < n - 3; b += 1) {
      for (let c = b + 1; c < n - 2; c += 1) {
        for (let d = c + 1; d < n - 1; d += 1) {
          for (let e = d + 1; e < n; e += 1) {
            const score = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(score, best) > 0) {
              best = score;
            }
          }
        }
      }
    }
  }
  return best ?? evaluateFive(cards.slice(0, 5));
}

export function dealHoldem(playerCount: number) {
  const deck = shuffle(buildDeck());
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < 2; i += 1) {
    for (let p = 0; p < playerCount; p += 1) {
      hands[p].push(drawCard(deck));
    }
  }
  const community = Array.from({ length: 5 }, () => drawCard(deck));
  return { hands, community };
}

export function formatRanks(values: number[]) {
  return values
    .map((v) => (v === 14 ? "A" : v === 13 ? "K" : v === 12 ? "Q" : v === 11 ? "J" : String(v)))
    .join(", ");
}
