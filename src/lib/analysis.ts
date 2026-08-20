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
 * Buckets a move by how far it fell from the engine's evaluation of the best available
 * continuation. This is a lightweight stand-in for chess.com's own model, not a copy of it,
 * so treat the labels as an approximation rather than a certified rating.
 */
export function classifyMove(info: MoveEvalInfo): MoveClass {
  const before = evalForMover(info.evalBefore, info.mover);
  const after = evalForMover(info.evalAfter, info.mover);
  const loss = Math.max(0, before - after);

  const wasWinningBig = before >= 1.5;
  const stillWinning = after >= 1.5;
  if (loss > 1.0 && wasWinningBig && !stillWinning) return 'miss';

  if (loss <= 0.02) {
    const movedValue = PIECE_VALUES[info.piece] ?? 0;
    const takenValue = info.captured ? PIECE_VALUES[info.captured] ?? 0 : 0;
    const wasASacrifice = info.captured ? movedValue > takenValue + 150 : false;
    if (wasASacrifice && after >= 1.0) return 'brilliant';
    return 'best';
  }
  if (loss <= 0.1) return 'great';
  if (loss <= 0.25) return 'excellent';
  if (loss <= 0.5) return 'good';
  if (loss <= 1.0) return 'inaccuracy';
  if (loss <= 2.0) return 'mistake';
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
 * Approximates a 0-100 accuracy score from average pawn loss, using the same falling
 * curve popularized by lichess's accuracy metric: it drops fast once mistakes add up.
 */
export function accuracyFromLosses(losses: number[]): number | null {
  if (losses.length === 0) return null;
  const acpl = (losses.reduce((a, b) => a + b, 0) / losses.length) * 100;
  const score = 103.1668 * Math.exp(-0.04354 * acpl) - 3.1669;
  return Math.max(0, Math.min(100, score));
}

/** Rough opening / middlegame / endgame split based on ply count and remaining material. */
export function phaseForPly(ply: number, totalPlies: number, nonPawnMaterial: number): GamePhase {
  const openingCutoff = Math.min(20, Math.max(10, Math.round(totalPlies * 0.28)));
  if (ply <= openingCutoff) return 'opening';
  if (nonPawnMaterial <= 2300) return 'endgame';
  return 'middlegame';
}
