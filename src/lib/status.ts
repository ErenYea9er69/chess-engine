import type { Chess } from 'chess.js';

export function gameOverMessage(game: Chess): string {
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Black' : 'White';
    return 'Checkmate. ' + winner + ' wins.';
  }
  if (game.isStalemate()) return 'Stalemate. The game is a draw.';
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material.';
  if (game.isThreefoldRepetition()) return 'Draw by repetition.';
  if (game.isDrawByFiftyMoves()) return 'Draw by the fifty move rule.';
  if (game.isDraw()) return 'Draw.';
  return 'Game over.';
}
