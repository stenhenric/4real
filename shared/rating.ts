export const RATING_SYSTEM = {
  startingRating: 300,
  minimumRating: 0,
  provisionalGames: 10,
  experiencedGames: 30,
  provisionalK: 40,
  activeK: 24,
  experiencedK: 16,
  repeatPairWindowMs: 24 * 60 * 60 * 1000,
  repeatPairFullWeightLimit: 3,
  repeatPairHalfWeightLimit: 5,
  formulaVersion: 'fresh-db-elo-v1',
} as const;
