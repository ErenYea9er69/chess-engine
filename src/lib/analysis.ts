import { PIECE_VALUES } from './pieces';
import type { GamePhase, MoveClass, PieceColor } from './types';

export interface MoveClassMeta {
  label: string;
  symbol: string;
  colorVar: string;
}

// Order matters: this is the display order used across the UI.
export const MOVE_CLASS_ORDER: MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
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
 * Buckets a move by how much win% it cost, versus the best line the engine saw.
 * This is a lightweight stand-in for chess.com's own model (which is closed-source),
 * not a copy of it, so treat the labels as an approximation rather than a certified
 * rating. Working in win% rather than raw pawns keeps a blunder in an already-lost
 * position from reading the same as one in an equal position.
 */
export function classifyMove(info: MoveEvalInfo): MoveClass {
  const beforeCp = evalForMover(info.evalBefore, info.mover) * 100;
  const afterCp = evalForMover(info.evalAfter, info.mover) * 100;
  const beforeWin = winPercent(beforeCp);
  const afterWin = winPercent(afterCp);
  const loss = Math.max(0, beforeWin - afterWin);

  const wasClearlyWinning = beforeWin >= 90;
  const stillClearlyWinning = afterWin >= 80;
  if (loss > 10 && wasClearlyWinning && !stillClearlyWinning) return 'miss';

  if (loss <= 1) {
    const movedValue = PIECE_VALUES[info.piece] ?? 0;
    const takenValue = info.captured ? PIECE_VALUES[info.captured] ?? 0 : 0;
    const wasASacrifice = info.captured ? movedValue > takenValue + 150 : false;
    if (wasASacrifice && afterWin >= 55) return 'brilliant';
    return 'best';
  }
  if (loss <= 3) return 'great';
  if (loss <= 6) return 'excellent';
  if (loss <= 10) return 'good';
  if (loss <= 15) return 'inaccuracy';
  if (loss <= 25) return 'mistake';
  return 'blunder';
}

export function emptyClassCounts(): Record<MoveClass, number> {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    miss: 0,
    blunder: 0,
  };
}

/**
 * Converts average win% lost per move into a 0-100 accuracy score, using the curve
 * Lichess fit to real game data: https://lichess.org/page/accuracy
 * IMPORTANT: `losses` must already be win% losses (see winPercentLoss above), not raw
 * pawn losses. Feeding raw pawns in here was the original bug: a 0.5-pawn loss got
 * treated as a 50-point win% loss and the exponential crushed it straight to 0,
 * which is why solid games were showing 0.0 accuracy for both sides.
 */
export function accuracyFromLosses(losses: number[]): number | null {
  if (losses.length === 0) return null;
  const avgWinPercentLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
  const score = 103.1668 * Math.exp(-0.04354 * avgWinPercentLoss) - 3.1669;
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
 * support docs and forums confirm the number leans heavily on the rating you feed
 * it, not on the game alone, so treat this as a labeled estimate, not a
 * reproduction of their internal model.
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
