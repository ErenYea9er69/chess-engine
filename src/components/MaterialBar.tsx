import type { Chess } from 'chess.js';
import { materialScore } from '../lib/material';

interface MaterialBarProps {
  game: Chess;
  height?: string;
}

export default function MaterialBar({ game, height = '460px' }: MaterialBarProps) {
  const score = materialScore(game);
  const pawns = score / 100;
  let pctWhite = 50 + 50 * Math.tanh(pawns / 6);
  pctWhite = Math.max(4, Math.min(96, pctWhite));

  return (
    <div className="material-bar-wrap">
      <div className="material-bar" style={{ height }}>
        <div className="fill-black" style={{ flex: 100 - pctWhite }} />
        <div className="fill-white" style={{ flex: pctWhite }} />
      </div>
      <div className="material-label">{pawns === 0 ? 'Even' : (pawns > 0 ? '+' : '') + pawns.toFixed(1)}</div>
    </div>
  );
}
