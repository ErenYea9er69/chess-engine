import { useState } from 'react';
import { MOVE_CLASS_META } from '../lib/analysis';
import type { GamePhase, MoveClass } from '../lib/types';

const PRIMARY_ROWS: MoveClass[] = ['brilliant', 'great', 'best', 'mistake', 'miss', 'blunder'];
const SECONDARY_ROWS: MoveClass[] = ['excellent', 'good', 'inaccuracy'];

export interface PhaseRow {
  phase: GamePhase;
  white: number | null;
  black: number | null;
}

interface GameReviewProps {
  whiteName: string;
  blackName: string;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  whiteCounts: Record<MoveClass, number>;
  blackCounts: Record<MoveClass, number>;
  phases: PhaseRow[];
  pending: boolean;
}

function AccuracyPill({ value }: { value: number | null }) {
  return <div className="gr-accuracy-pill">{value === null ? '\u2014' : value.toFixed(1)}</div>;
}

function phaseTier(value: number | null): 'high' | 'mid' | 'low' | 'none' {
  if (value === null) return 'none';
  if (value >= 85) return 'high';
  if (value >= 65) return 'mid';
  return 'low';
}

const PHASE_LABEL: Record<GamePhase, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
};

export default function GameReview({
  whiteName,
  blackName,
  whiteAccuracy,
  blackAccuracy,
  whiteCounts,
  blackCounts,
  phases,
  pending,
}: GameReviewProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? [...PRIMARY_ROWS.slice(0, 3), ...SECONDARY_ROWS, ...PRIMARY_ROWS.slice(3)] : PRIMARY_ROWS;

  return (
    <div className="panel game-review">
      <h3>Game review{pending && <span className="gr-pending"> \u00b7 evaluating\u2026</span>}</h3>

      <div className="gr-players">
        <div className="gr-player">{whiteName}</div>
        <div className="gr-player right">{blackName}</div>
      </div>
      <div className="gr-accuracy-row">
        <AccuracyPill value={whiteAccuracy} />
        <span className="gr-accuracy-label">Accuracy</span>
        <AccuracyPill value={blackAccuracy} />
      </div>

      <div className="gr-rows">
        {rows.map((cls) => {
          const meta = MOVE_CLASS_META[cls];
          return (
            <div className="gr-row" key={cls}>
              <span className="gr-count">{whiteCounts[cls]}</span>
              <span className={'gr-icon mc-' + cls} style={{ color: `var(${meta.colorVar})` }}>
                {meta.symbol}
              </span>
              <span className="gr-label">{meta.label}</span>
              <span className={'gr-icon mc-' + cls} style={{ color: `var(${meta.colorVar})` }}>
                {meta.symbol}
              </span>
              <span className="gr-count">{blackCounts[cls]}</span>
            </div>
          );
        })}
      </div>

      <button className="gr-toggle" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? 'Show fewer rows' : 'Show more rows'}>
        <span className={'chevron' + (expanded ? ' up' : '')}>&#9662;</span>
      </button>

      {phases.length > 0 && (
        <div className="gr-phases">
          {phases.map((row) => (
            <div className="gr-phase-row" key={row.phase}>
              <span className={'gr-phase-badge tier-' + phaseTier(row.white)}>
                {row.white === null ? '\u2014' : Math.round(row.white)}
              </span>
              <span className="gr-phase-name">{PHASE_LABEL[row.phase]}</span>
              <span className={'gr-phase-badge tier-' + phaseTier(row.black)}>
                {row.black === null ? '\u2014' : Math.round(row.black)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
