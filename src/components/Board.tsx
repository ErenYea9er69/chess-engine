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

function findCheckedKingSquare(game: Chess): string | null {
  if (!game.inCheck()) return null;
  const turn = game.turn();
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === 'k' && p.color === turn) {
        return FILES[c] + (8 - r);
      }
    }
  }
  return null;
}

export default function Board({ game, orientation, selected, legalTargets, lastMove, onSquareClick }: BoardProps) {
  const board = game.board();
  const checkSquare = findCheckedKingSquare(game);
  const targets = legalTargets ?? [];

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
          {piece && (
            <span className={'piece ' + (piece.color === 'w' ? 'white' : 'black')}>
              {PIECE_UNICODE[piece.color + piece.type]}
            </span>
          )}
          {isTarget && <div className={piece ? 'ring' : 'dot'} />}
        </div>
      );
    }
  }

  return <div className="board-grid">{squares}</div>;
}
