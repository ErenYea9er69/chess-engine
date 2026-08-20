import { useLayoutEffect, useRef, useState } from 'react';
import type { Chess } from 'chess.js';
import { PIECE_UNICODE } from '../lib/pieces';
import type { LastMove, PieceColor } from '../lib/types';

const FILES = 'abcdefgh';

interface BoardProps {
  game: Chess;
  orientation: PieceColor;
  selected?: string | null;
  legalTargets?: string[];
  lastMove?: LastMove | null;
  onSquareClick?: (square: string) => void;
}

interface PieceEntry {
  id: number;
  type: string;
  color: 'w' | 'b';
  square: string;
}

type BoardCell = { type: string; color: 'w' | 'b' } | null;

function findCheckedKingSquare(game: Chess): string | null {
  if (!game.inCheck()) return null;
  const turn = game.turn();
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === turn) return FILES[c] + (8 - r);
    }
  }
  return null;
}

function squareCoords(square: string, orientation: PieceColor) {
  const fileIdx = FILES.indexOf(square[0]);
  const rankIdx = parseInt(square[1], 10) - 1;
  const col = orientation === 'w' ? fileIdx : 7 - fileIdx;
  const row = orientation === 'w' ? 7 - rankIdx : rankIdx;
  return { left: col * 12.5, top: row * 12.5 };
}

let uidCounter = 0;

/**
 * Turns a fresh 8x8 board snapshot into a piece list. Pieces that stay on the
 * same square keep the same id; pieces that moved are matched to their closest
 * same-type predecessor so they keep their id too, and therefore slide to their
 * new square with a CSS transition instead of popping in and out.
 */
function assignPieceIds(prev: PieceEntry[], board: BoardCell[][]): PieceEntry[] {
  const current: Array<{ square: string; type: string; color: 'w' | 'b' }> = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) current.push({ square: FILES[c] + (8 - r), type: p.type, color: p.color });
    }
  }

  const usedPrev = new Set<number>();
  const next: PieceEntry[] = [];

  current.forEach((c) => {
    const idx = prev.findIndex(
      (p, i) => !usedPrev.has(i) && p.square === c.square && p.type === c.type && p.color === c.color
    );
    if (idx !== -1) {
      usedPrev.add(idx);
      next.push({ ...prev[idx] });
    }
  });

  const settledSquares = new Set(next.map((n) => n.square));
  const remaining = current.filter((c) => !settledSquares.has(c.square));

  remaining.forEach((c) => {
    let bestIdx = -1;
    let bestDist = Infinity;
    prev.forEach((p, i) => {
      if (usedPrev.has(i) || p.type !== c.type || p.color !== c.color) return;
      const df = Math.abs(FILES.indexOf(p.square[0]) - FILES.indexOf(c.square[0]));
      const dr = Math.abs(parseInt(p.square[1], 10) - parseInt(c.square[1], 10));
      const dist = df + dr;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    if (bestIdx !== -1) {
      usedPrev.add(bestIdx);
      next.push({ id: prev[bestIdx].id, type: c.type, color: c.color, square: c.square });
    } else {
      next.push({ id: ++uidCounter, type: c.type, color: c.color, square: c.square });
    }
  });

  return next;
}

export default function Board({ game, orientation, selected, legalTargets, lastMove, onSquareClick }: BoardProps) {
  const board = game.board();
  const checkSquare = findCheckedKingSquare(game);
  const targets = legalTargets ?? [];
  const fenPlacement = game.fen().split(' ')[0];

  const prevRef = useRef<PieceEntry[]>([]);
  const lastFenRef = useRef<string>('');
  const [pieces, setPieces] = useState<PieceEntry[]>(() => {
    const initial = assignPieceIds([], board);
    prevRef.current = initial;
    lastFenRef.current = fenPlacement;
    return initial;
  });

  useLayoutEffect(() => {
    if (fenPlacement === lastFenRef.current) return;
    lastFenRef.current = fenPlacement;
    const next = assignPieceIds(prevRef.current, board);
    prevRef.current = next;
    setPieces(next);
    // board/fenPlacement are recomputed from `game` every render; fenPlacement alone
    // is the right change signal here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fenPlacement]);

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const fileIdx = orientation === 'w' ? col : 7 - col;
      const rankIdx = orientation === 'w' ? 7 - row : row;
      const sq = FILES[fileIdx] + (rankIdx + 1);
      const piece = board[7 - rankIdx][fileIdx];
      const isLight = (fileIdx + rankIdx) % 2 === 1;
      const isSelected = selected === sq;
      const isLastMove = !!lastMove && (lastMove.from === sq || lastMove.to === sq);
      const isCheck = sq === checkSquare;
      const isTarget = targets.includes(sq);

      const classes = ['sq', isLight ? 'light' : 'dark'];
      if (isSelected) classes.push('selected');
      if (isLastMove) classes.push('lastmove');
      if (isCheck) classes.push('check');

      squares.push(
        <div
          key={sq}
          className={classes.join(' ')}
          data-square={sq}
          onClick={onSquareClick ? () => onSquareClick(sq) : undefined}
          role={onSquareClick ? 'button' : undefined}
          aria-label={onSquareClick ? `Square ${sq}` : undefined}
        >
          {isTarget && <div className={piece ? 'ring' : 'dot'} />}
        </div>
      );
    }
  }

  return (
    <div className="board-grid-wrap">
      <div className="board-grid">{squares}</div>
      <div className="piece-layer">
        {pieces.map((p) => {
          const { left, top } = squareCoords(p.square, orientation);
          return (
            <div
              key={p.id}
              className="piece-token"
              style={{ left: left + '%', top: top + '%' }}
              data-square={p.square}
            >
              <span className={'piece ' + (p.color === 'w' ? 'white' : 'black')}>
                {PIECE_UNICODE[p.color + p.type]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
