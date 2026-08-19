interface MoveListProps {
  moves: string[]; // SAN history
  currentPly?: number; // 1-indexed ply to highlight, 0 = start position
  onJump?: (ply: number) => void;
  emptyText?: string;
}

export default function MoveList({ moves, currentPly, onJump, emptyText = 'No moves yet.' }: MoveListProps) {
  if (moves.length === 0) {
    return <div className="movelist">{emptyText}</div>;
  }
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push(
      <span key={i}>
        <span className="mv-num">{i / 2 + 1}. </span>
        <span
          className={'mv' + (currentPly === i + 1 ? ' current' : '')}
          onClick={onJump ? () => onJump(i + 1) : undefined}
        >
          {moves[i]}
        </span>{' '}
        {moves[i + 1] && (
          <span
            className={'mv' + (currentPly === i + 2 ? ' current' : '')}
            onClick={onJump ? () => onJump(i + 2) : undefined}
          >
            {moves[i + 1]}
          </span>
        )}{' '}
      </span>
    );
  }
  return <div className="movelist">{rows}</div>;
}
