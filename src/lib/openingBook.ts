// Book-move detection: chess.com marks the first several moves of a game as
// "Book" when they match known opening theory, and those moves are excluded
// from grading entirely (see the "last book move" note in chess.com's own
// Game Review docs). Skipping this step is a real source of mismatch versus
// chess.com: a completely normal, well-known 8th-move theoretical line can
// still get flagged as an "Inaccuracy" by a fixed-depth engine that hasn't
// looked far enough ahead to see why it's fine, which unfairly drags down
// both the accuracy score and the opening-phase grade.
//
// data/openings-book.txt is derived from the lichess-org/chess-openings
// dataset (MIT-style open data, https://github.com/lichess-org/chess-openings),
// exploded into every intermediate position reachable along its ~3,800 known
// lines (capped at 20 plies / 10 full moves each), deduplicated. That's a
// solid chunk of club-level opening theory, but it's not chess.com's own
// (much larger, master-game-derived) book, so it will occasionally run out
// of theory a move or two earlier or later than chess.com does on rare
// lines. Swap in a bigger book (e.g. a Polyglot .bin) here if you want
// tighter coverage.
import bookRaw from '../data/openings-book.txt?raw';

const BOOK_POSITIONS: Set<string> = new Set(bookRaw.split('\n').filter(Boolean));

/** Reduces a full FEN to the EPD fields (board, side to move, castling, en
 *  passant) that define an opening *position* — move-clock fields don't. */
export function fenToEpd(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function isKnownBookPosition(fen: string): boolean {
  return BOOK_POSITIONS.has(fenToEpd(fen));
}

/**
 * Given the FEN at every ply of a game (index 0 = starting position), returns
 * which plies are still "in book": a contiguous run from the start, ending
 * the first time the position falls off the known-theory set. This mirrors
 * how chess.com frames it — "the first key move is usually the last book
 * move" — rather than re-entering book status if a later position happens to
 * transpose back into a known line by coincidence.
 */
export function bookFlagsForGame(fens: string[]): boolean[] {
  const flags: boolean[] = new Array(fens.length).fill(false);
  for (let i = 0; i < fens.length; i++) {
    if (!isKnownBookPosition(fens[i])) break;
    flags[i] = true;
  }
  return flags;
}
