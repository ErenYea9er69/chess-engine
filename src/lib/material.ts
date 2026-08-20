import type { Chess } from 'chess.js';
import { PIECE_VALUES } from './pieces';

export type Counts = Record<'w' | 'b', Record<string, number>>;

export function materialCounts(game: Chess): Counts {
  const board = game.board();
  const counts: Counts = { w: {}, b: {} };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      counts[p.color][p.type] = (counts[p.color][p.type] || 0) + 1;
    }
  }
  return counts;
}

/** Sum of non-pawn, non-king piece values on the board, both sides combined.
 *  Used as a rough signal for when a game has moved from middlegame to endgame. */
export function nonPawnMaterial(game: Chess): number {
  const board = game.board();
  let total = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.type === 'p' || p.type === 'k') continue;
      total += PIECE_VALUES[p.type];
    }
  }
  return total;
}

export function materialScore(game: Chess): number {
  const board = game.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      score += (p.color === 'w' ? 1 : -1) * PIECE_VALUES[p.type];
    }
  }
  return score;
}

export interface CapturedDisplay {
  top: string; // unicode string of pieces to show above the board
  bottom: string;
  topDiff: number; // material lead to display next to the top tray (0 if none)
  bottomDiff: number;
}

/**
 * Builds the "captured pieces" trays shown above/below the board: the tray for a
 * color shows the *opponent's* pieces that are missing from the board (i.e. what
 * that color has captured), plus a "+N" material lead badge on the leading side.
 */
export function capturedDisplay(game: Chess, orientation: 'w' | 'b'): CapturedDisplay {
  const counts = materialCounts(game);
  const score = materialScore(game);
  const start: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const order = ['q', 'r', 'b', 'n', 'p'];
  const unicode: Record<string, string> = {
    wp: '\u2659', wn: '\u2658', wb: '\u2657', wr: '\u2656', wq: '\u2655',
    bp: '\u265F', bn: '\u265E', bb: '\u265D', br: '\u265C', bq: '\u265B',
  };
  function trayFor(missingColor: 'w' | 'b') {
    let out = '';
    order.forEach((t) => {
      const missing = start[t] - (counts[missingColor][t] || 0);
      for (let i = 0; i < missing; i++) out += unicode[missingColor + t];
    });
    return out;
  }
  const whiteCaptured = trayFor('b'); // black pieces missing = captured by White
  const blackCaptured = trayFor('w');
  const diff = Math.round(score / 100);

  const top = orientation === 'w' ? blackCaptured : whiteCaptured;
  const bottom = orientation === 'w' ? whiteCaptured : blackCaptured;
  const topColor = orientation === 'w' ? 'b' : 'w';
  const bottomColor = orientation === 'w' ? 'w' : 'b';
  const topDiff = (topColor === 'w' && diff > 0) || (topColor === 'b' && diff < 0) ? Math.abs(diff) : 0;
  const bottomDiff = (bottomColor === 'w' && diff > 0) || (bottomColor === 'b' && diff < 0) ? Math.abs(diff) : 0;

  return { top, bottom, topDiff, bottomDiff };
}
