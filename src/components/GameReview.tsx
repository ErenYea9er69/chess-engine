import { useState } from 'react';
import { MOVE_CLASS_META, REVIEW_CATEGORY_LABEL, REVIEW_TIER_SYMBOL, tierFromWinPercentLoss } from '../lib/analysis';
import type { MoveClass } from '../lib/types';
import type { ReviewCategory } from '../lib/analysis';

const PRIMARY_ROWS: MoveClass[] = ['brilliant', 'great', 'best', 'mistake', 'miss', 'blunder'];
const SECONDARY_ROWS: MoveClass[] = ['excellent', 'good', 'inaccuracy'];

export interface CategoryRow {
  category: ReviewCategory;
  whiteAvgLoss: number | null;
  blackAvgLoss: number | null;
}

interface GameReviewProps {
  whiteName: string;
  blackName: string;
  whiteRating: number | null;
  blackRating: number | null;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  whiteCounts: Record<MoveClass, number>;
  blackCounts: Record<MoveClass, number>;
  categories: CategoryRow[];
  pending: boolean;
}

function AccuracyPill({ value }: { value: number | null }) {
  return <div className="gr-accuracy-pill">{value === null ? '\u2014' : value.toFixed(1)}</div>;
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 2).toUpperCase();
}

// Deterministic color so the same name always gets the same avatar tint.
function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

function Avatar({ name }: { name: string }) {
  const hue = hueFor(name || '?');
  return (
    <div className="gr-avatar" style={{ background: `hsl(${hue} 45% 28%)`, color: `hsl(${hue} 70% 88%)` }}>
      {initialsFor(name)}
    </div>
  );
}

export default function GameReview({
  whiteName,
  blackName,
  whiteRating,
  blackRating,
  whiteAccuracy,
  blackAccuracy,
  whiteCounts,
  blackCounts,
  categories,
  pending,
}: GameReviewProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? [...PRIMARY_ROWS.slice(0, 3), ...SECONDARY_ROWS, ...PRIMARY_ROWS.slice(3)] : PRIMARY_ROWS;

  return (
    <div className="panel game-review">
      <h3>Game review{pending && <span className="gr-pending"> \u00b7 evaluating\u2026</span>}</h3>

      <div className="gr-players">
        <div className="gr-player">
          <Avatar name={whiteName} />
          <span>{whiteName}</span>
        </div>
        <div className="gr-player right">
          <span>{blackName}</span>
          <Avatar name={blackName} />
        </div>
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

      <div className="gr-rating-row">
        <div className="gr-rating-pill">{whiteRating === null ? '\u2014' : whiteRating}</div>
        <span className="gr-accuracy-label">Game rating</span>
        <div className="gr-rating-pill">{blackRating === null ? '\u2014' : blackRating}</div>
      </div>
      <p className="footnote gr-rating-note">
        Estimated from move quality and each player's PGN Elo. Chess.com hasn't published its own formula, so this
        is an approximation, not a match to their number.
      </p>

      {categories.length > 0 && (
        <div className="gr-phases">
          {categories.map((row) => {
            const whiteTier = tierFromWinPercentLoss(row.whiteAvgLoss);
            const blackTier = tierFromWinPercentLoss(row.blackAvgLoss);
            return (
              <div className="gr-phase-row" key={row.category}>
                <span className={'gr-phase-badge tier-' + whiteTier} title={whiteTier}>
                  {REVIEW_TIER_SYMBOL[whiteTier]}
                </span>
                <span className="gr-phase-name">{REVIEW_CATEGORY_LABEL[row.category]}</span>
                <span className={'gr-phase-badge tier-' + blackTier} title={blackTier}>
                  {REVIEW_TIER_SYMBOL[blackTier]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
