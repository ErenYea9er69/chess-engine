import { PIECE_VALUES } from './pieces';
import type { GamePhase, MoveClass, PieceColor } from './types';

export interface MoveClassMeta {
  label: string;
  symbol: string;
  colorVar: string;
}

// Order matters: this is the display order used across the UI. Matches the
// order chess.com's own move-classification docs list them in:
// https://support.chess.com/en/articles/8572705
export const MOVE_CLASS_ORDER: MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

export const MOVE_CLASS_META: Record<MoveClass, MoveClassMeta> = {
  brilliant: { label: 'Brilliant', symbol: '!!', colorVar: '--mc-brilliant' },
  great: { label: 'Great', symbol: '!', colorVar: '--mc-great' },
  best: { label: 'Best', symbol: '\u2605', colorVar: '--mc-best' },
  excellent: { label: 'Excellent', symbol: '\u2713', colorVar: '--mc-excellent' },
  good: { label: 'Good', symbol: '\u2713', colorVar: '--mc-good' },
  book: { label: 'Book', symbol: '\u{1F4D6}', colorVar: '--mc-book' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', colorVar: '--mc-inaccuracy' },
  mistake: { label: 'Mistake', symbol: '?', colorVar: '--mc-mistake' },
  miss: { label: 'Miss', symbol: '\u2715', colorVar: '--mc-miss' },
  blunder: { label: 'Blunder', symbol: '??', colorVar: '--mc-blunder' },
};

export interface MoveEvalInfo {
  mover: PieceColor;
  evalBefore: number; // pawns, White's point of view
  evalAfter: number; // pawns, White's point of view
  piece: string; // moved piece type, e.g. 'n'
  captured?: string; // captured piece type, if any
  /** True if this move delivers checkmate. Always graded Best, regardless of eval noise. */
  isCheckmate?: boolean;
  /** UCI of the move actually played, e.g. "e2e4". */
  playedUci?: string;
  /** UCI of the engine's own top choice from the position *before* this move. */
  bestUci?: string;
  /**
   * Eval (pawns, White POV) the engine expects if its *second*-choice move
   * had been played instead, evaluated from the position before this move.
   * Lets classifyMove tell a genuinely forced ("only move") position apart
   * from one where several moves were all roughly fine — chess.com's Great
   * and Miss labels are built on exactly this distinction, not on loss alone.
   * Pass null/undefined if MultiPV wasn't available (there's only one legal
   * move, or the engine call didn't request a second line); classification
   * degrades gracefully to the loss-based ladder in that case.
   */
  secondBestEvalBefore?: number | null;
}

export function evalForMover(evalWhitePov: number, mover: PieceColor): number {
  return mover === 'w' ? evalWhitePov : -evalWhitePov;
}

/** How much worse the position got for the mover, in pawns, versus the best line the engine saw. */
export function lossPawns(info: MoveEvalInfo): number {
  const before = evalForMover(info.evalBefore, info.mover);
  const after = evalForMover(info.evalAfter, info.mover);
  return Math.max(0, before - after);
}

/**
 * Converts a centipawn score (from the mover's point of view) into a 0-100 win
 * probability, using the same sigmoid Lichess publishes for its accuracy metric:
 * https://lichess.org/page/accuracy
 * A raw pawn score is not a fair unit for comparing moves: a 300cp swing means
 * one thing at 0.00 and almost nothing at +7.00. Win% fixes that, and it also
 * naturally caps mate scores near 0 or 100 instead of letting a mate-to-mate
 * swing dominate an average the way raw pawns do.
 */
export function winPercent(centipawnsForMover: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawnsForMover)) - 1);
}

/** Win% lost by the mover on this move, the unit chess.com/lichess actually average for accuracy. */
export function winPercentLoss(info: MoveEvalInfo): number {
  const beforeCp = evalForMover(info.evalBefore, info.mover) * 100;
  const afterCp = evalForMover(info.evalAfter, info.mover) * 100;
  const before = winPercent(beforeCp);
  const after = winPercent(afterCp);
  return Math.max(0, before - after);
}

/**
 * Buckets a move into one of chess.com's ten Game Review labels.
 *
 * The best/excellent/good/inaccuracy/mistake/blunder cutoffs below are not
 * guesses — they're copied straight from chess.com's own published table for
 * its "Expected Points Model" (Classification V2):
 * https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
 *   Best        0.00 - 0.00   (expected-points lost)
 *   Excellent   0.00 - 0.02
 *   Good        0.02 - 0.05
 *   Inaccuracy  0.05 - 0.10
 *   Mistake     0.10 - 0.20
 *   Blunder     0.20 - 1.00
 * "Expected points" there is the same 0-1 win-probability scale winPercentLoss
 * already returns as 0-100, so those cutoffs become 0 / 2 / 5 / 10 / 20 below.
 *
 * Brilliant, Great, and Miss are *not* on that ladder — chess.com's docs
 * describe them as separate, rule-based overlays checked ahead of it (a good
 * sacrifice; a critical/only move found or missed), so they're evaluated
 * first here too, in roughly the priority order community write-ups
 * describe chess.com using (mate > brilliant > best > miss > great > ladder).
 * "Book" is deliberately not handled in this function — the caller should
 * short-circuit to 'book' before ever computing an eval-based classification
 * for a theory move (see openingBook.ts), the same way chess.com's report
 * never grades book moves at all.
 */
export function classifyMove(info: MoveEvalInfo): MoveClass {
  if (info.isCheckmate) return 'best';

  const beforeWin = winPercent(evalForMover(info.evalBefore, info.mover) * 100);
  const afterWin = winPercent(evalForMover(info.evalAfter, info.mover) * 100);
  const loss = Math.max(0, beforeWin - afterWin);

  const isTopEngineMove = Boolean(info.playedUci) && info.playedUci === info.bestUci;

  // --- Brilliant: a good sacrifice, per chess.com's own (simplified) definition ---
  // "a good piece sacrifice... you should not be in a bad position after...
  // you should not be completely winning even if you hadn't found the move."
  const movedValue = PIECE_VALUES[info.piece] ?? 0;
  const takenValue = info.captured ? PIECE_VALUES[info.captured] ?? 0 : 0;
  const wasASacrifice = info.captured ? movedValue > takenValue + 150 : false;
  const wasAlreadyCompletelyWinning = beforeWin >= 95;
  const isBadPositionAfter = afterWin < 50;
  if (wasASacrifice && loss <= 2 && !wasAlreadyCompletelyWinning && !isBadPositionAfter) {
    return 'brilliant';
  }

  // --- Great / Miss: was this a "critical moment" — one move clearly better
  // than everything else? Needs the engine's runner-up line to tell a forced
  // position apart from a comfortable one; degrades to "no" if unavailable. ---
  let runnerUpGap: number | null = null;
  if (info.secondBestEvalBefore !== null && info.secondBestEvalBefore !== undefined) {
    const secondBestWin = winPercent(evalForMover(info.secondBestEvalBefore, info.mover) * 100);
    runnerUpGap = Math.max(0, beforeWin - secondBestWin);
  }
  const wasCriticalMoment = runnerUpGap !== null && runnerUpGap >= 12;

  // Miss: a real winning chance was on the board (either already winning, or
  // this was the one move that would have seized a winning position) and it
  // got let slip. Chess.com's docs: "fail to capitalize on your opponent's
  // mistake and miss the opportunity to gain a winning position." Checked
  // ahead of the plain mistake/blunder ladder so a let-slip win reads as a
  // Miss rather than just another Blunder.
  const hadRealWinningChance = beforeWin >= 90 || (wasCriticalMoment && beforeWin >= 65);
  if (hadRealWinningChance && loss >= 12 && afterWin < beforeWin - 8) {
    return 'miss';
  }

  if (isTopEngineMove) return wasCriticalMoment ? 'great' : 'best';
  if (loss <= 0.5) return 'best'; // effectively tied the top line even without a UCI match to confirm it
  if (wasCriticalMoment && loss <= 4) return 'great';

  if (loss <= 2) return 'excellent';
  if (loss <= 5) return 'good';
  if (loss <= 10) return 'inaccuracy';
  if (loss <= 20) return 'mistake';
  return 'blunder';
}

export function emptyClassCounts(): Record<MoveClass, number> {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    miss: 0,
    blunder: 0,
  };
}

/**
 * Turns one move's win% loss into a 0-100 "how good was this move" score.
 * Deliberately steeper than the game-level Lichess curve below: small slips
 * should still read as clearly good, real mistakes should fall off a cliff.
 * The constant (curveK = "how many win%-points of loss it takes to roughly
 * halve the score") is fit to the three example points a public
 * reverse-engineering write-up of chess.com's accuracy gives — a 2% loss
 * scoring ~78, a 9% loss scoring ~32, a 20%+ loss landing near 0:
 * https://backrank.io/blog/how-chess-accuracy-works
 * y = 100 * exp(-loss / 8) hits (2, 78.3), (9, 32.6), (20, 8.2) — close to
 * all three. It's a fit to three published numbers, not chess.com's actual
 * formula, so treat curveK as a knob to recalibrate, not a constant.
 */
export function moveAccuracyScore(loss: number, curveK = 8): number {
  return Math.max(0, Math.min(100, 100 * Math.exp(-Math.max(0, loss) / curveK)));
}

export interface AccuracyOptions {
  /** Per-move score curve steepness — see moveAccuracyScore. */
  curveK?: number;
  /**
   * Exponent of the power mean used to combine per-move scores into one
   * game score. 1 = plain average (too forgiving — a single blunder barely
   * moves it). 0 = geometric mean. Negative = harmonic-mean territory (one
   * bad move dominates the whole score). The write-up linked above lands its
   * calibration example between the geometric and arithmetic means, so this
   * defaults to a small positive value; nudge it up toward 1 if your scores
   * run low versus chess.com, or down toward/past 0 if they run high.
   */
  powerMeanExponent?: number;
  /** Floor under each per-move score so one catastrophic move (score -> 0)
   *  can't send the power mean to zero or make it undefined for negative
   *  exponents. */
  moveScoreFloor?: number;
}

const DEFAULT_ACCURACY_OPTIONS: Required<AccuracyOptions> = {
  curveK: 8,
  powerMeanExponent: 0.4,
  moveScoreFloor: 3,
};

/**
 * Converts a list of per-move win% losses into a single 0-100 game accuracy.
 *
 * IMPORTANT: this used to be a plain arithmetic mean of the losses fed
 * through the Lichess game-level curve. That's the right approach for
 * reproducing *Lichess's* accuracy number, but chess.com's own support docs
 * say plainly that its "CAPS2" score deliberately moved away from a scheme
 * where a high fraction of Best moves alone could push the score to 99+ even
 * with real mistakes mixed in — i.e. away from a forgiving plain average.
 * See https://support.chess.com/en/articles/8708970 and, for the specific
 * fix (per-move scoring + a power mean instead of an average), the write-up
 * at https://backrank.io/blog/how-chess-accuracy-works, which reports ~2
 * points average error against chess.com across ~928 games using this shape
 * of formula. Neither chess.com's exact formula nor Backrank's exact
 * constants are public, so the numbers here are a documented starting point
 * — see scripts/calibrate-accuracy.mjs to tune curveK/powerMeanExponent
 * against your own games' known chess.com accuracy.
 */
export function accuracyFromLosses(losses: number[], options?: AccuracyOptions): number | null {
  if (losses.length === 0) return null;
  const { curveK, powerMeanExponent, moveScoreFloor } = { ...DEFAULT_ACCURACY_OPTIONS, ...options };

  const moveScores = losses.map((loss) => Math.max(moveScoreFloor, moveAccuracyScore(loss, curveK)));

  let score: number;
  if (Math.abs(powerMeanExponent) < 1e-9) {
    // p -> 0 limit of the power mean is the geometric mean.
    const logSum = moveScores.reduce((sum, s) => sum + Math.log(s), 0);
    score = Math.exp(logSum / moveScores.length);
  } else {
    const meanOfPowers =
      moveScores.reduce((sum, s) => sum + Math.pow(s, powerMeanExponent), 0) / moveScores.length;
    score = Math.pow(meanOfPowers, 1 / powerMeanExponent);
  }
  return Math.max(0, Math.min(100, score));
}

/** Rough opening / middlegame / endgame split based on ply count and remaining material. */
export function phaseForPly(ply: number, totalPlies: number, nonPawnMaterial: number): GamePhase {
  const openingCutoff = Math.min(20, Math.max(10, Math.round(totalPlies * 0.28)));
  if (ply <= openingCutoff) return 'opening';
  if (nonPawnMaterial <= 2300) return 'endgame';
  return 'middlegame';
}

export type ReviewCategory = 'opening' | 'tactics' | 'strategy' | 'endgame';

/**
 * Splits the game the way chess.com's report does visually (Opening / Tactics /
 * Strategy / Endgame) rather than by ply alone. "Tactics" isn't a stretch of the
 * game, it's a move type: a capture, a check, or a move the engine graded as a
 * sharp swing (best-or-better vs. mistake-or-worse) cuts across the whole board,
 * so it's pulled out of the middlegame bucket rather than measured by move number.
 */
export function reviewCategoryForMove(
  ply: number,
  totalPlies: number,
  nonPawnMaterial: number,
  isTacticalMoment: boolean
): ReviewCategory {
  const phase = phaseForPly(ply, totalPlies, nonPawnMaterial);
  if (phase === 'opening') return 'opening';
  if (phase === 'endgame') return 'endgame';
  return isTacticalMoment ? 'tactics' : 'strategy';
}

export const REVIEW_CATEGORY_LABEL: Record<ReviewCategory, string> = {
  opening: 'Opening',
  tactics: 'Tactics',
  strategy: 'Strategy',
  endgame: 'Endgame',
};

export type ReviewTier = 'excellent' | 'solid' | 'shaky' | 'poor' | 'none';

/** Maps an average win% loss for a category into the coarse tier chess.com shows as an icon. */
export function tierFromWinPercentLoss(avgLoss: number | null): ReviewTier {
  if (avgLoss === null) return 'none';
  if (avgLoss <= 3) return 'excellent';
  if (avgLoss <= 8) return 'solid';
  if (avgLoss <= 15) return 'shaky';
  return 'poor';
}

export const REVIEW_TIER_SYMBOL: Record<ReviewTier, string> = {
  excellent: '\u{1F44D}', // thumbs up
  solid: '\u2605', // star
  shaky: '\u2713', // check
  poor: '!',
  none: '\u2014',
};

/**
 * Estimates a single-game "performance rating" the way chess.com's Game Rating
 * card frames it: how strong today's moves looked next to what's typical at the
 * player's own rating. Chess.com has never published its formula, and its own
 * support docs confirm it's "quality of your moves compared to what is expected
 * from a player at your rating level" without going further than that, so
 * treat this as a labeled estimate, not a reproduction of their internal model:
 * https://support.chess.com/en/articles/10773754-how-is-game-rating-calculated-in-game-review
 *
 * In practice this number is entirely downstream of accuracy: if accuracy
 * ranks the two players correctly relative to chess.com's own report (see the
 * accuracyFromLosses rework above), this will usually follow along sanely too.
 * If accuracy is still off, no amount of tuning the anchors below will fix
 * Game Rating on its own.
 */
export function estimateGameRating(playerElo: number | null, accuracy: number | null): number | null {
  if (accuracy === null) return null;
  const elo = playerElo ?? 1000;
  // Anchor points from typical accuracy-by-rating bands; linearly interpolated.
  const anchors: [number, number][] = [
    [400, 65],
    [800, 74],
    [1200, 80],
    [1600, 85],
    [2000, 90],
    [2400, 94],
    [2800, 97],
  ];
  let expected = anchors[0][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [e0, a0] = anchors[i];
    const [e1, a1] = anchors[i + 1];
    if (elo >= e0 && elo <= e1) {
      const t = (elo - e0) / (e1 - e0);
      expected = a0 + t * (a1 - a0);
      break;
    }
    if (elo > anchors[anchors.length - 1][0]) expected = anchors[anchors.length - 1][1];
  }
  const sensitivity = 22; // rating points per 1% accuracy above/below expectation
  const estimate = elo + (accuracy - expected) * sensitivity;
  return Math.max(200, Math.round(estimate));
}
