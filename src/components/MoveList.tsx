import { MOVE_CLASS_META } from '../lib/analysis';
import type { MoveClass } from '../lib/types';

interface MoveListProps {
  moves: string[]; // SAN history
  currentPly?: number; // 1-indexed ply to highlight, 0 = start position
  onJump?: (ply: number) => void;
  emptyText?: string;
  classifications?: (MoveClass | null)[]; // aligned with `moves`, optional
}

function MoveBadge({ cls }: { cls: MoveClass }) {
  const meta = MOVE_CLASS_META[cls];
  return (
    <span className={'mv-badge mc-' + cls} title={meta.label} style={{ color: `var(${meta.colorVar})` }}>
      {meta.symbol}
    </span>
  );
}

export default function MoveList({ moves, currentPly, onJump, emptyText = 'No moves yet.', classifications }: MoveListProps) {
  if (moves.length === 0) {
    return <div className="movelist">{emptyText}</div>;
  }
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    const whiteCls = classifications?.[i] ?? null;
    const blackCls = classifications?.[i + 1] ?? null;
    rows.push(
      <span key={i} className="mv-row">
        <span className="mv-num">{i / 2 + 1}. </span>
        <span
          className={'mv' + (currentPly === i + 1 ? ' current' : '')}
          onClick={onJump ? () => onJump(i + 1) : undefined}
        >
          {moves[i]}
          {whiteCls && <MoveBadge cls={whiteCls} />}
        </span>{' '}
        {moves[i + 1] && (
          <span
            className={'mv' + (currentPly === i + 2 ? ' current' : '')}
            onClick={onJump ? () => onJump(i + 2) : undefined}
          >
            {moves[i + 1]}
            {blackCls && <MoveBadge cls={blackCls} />}
          </span>
        )}{' '}
      </span>
    );
  }
  return <div className="movelist">{rows}</div>;
}
