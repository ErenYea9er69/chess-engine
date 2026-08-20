import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from '../components/Board';
import MaterialBar from '../components/MaterialBar';
import MoveList from '../components/MoveList';
import GameReview, { type PhaseRow } from '../components/GameReview';
import { accuracyFromLosses, classifyMove, emptyClassCounts, phaseForPly } from '../lib/analysis';
import { nonPawnMaterial } from '../lib/material';
import type { UseStockfishReturn } from '../engine/useStockfish';
import type { GamePhase, LastMove, MoveClass, PieceColor } from '../lib/types';

interface AnalyzeModeProps {
  engine: UseStockfishReturn;
  initialPgn?: { pgn: string; token: number } | null;
}

interface PlyState {
  fen: string;
  lastMove: LastMove | null;
  san: string | null;
  piece: string | null;
  captured: string | null;
  nonPawnMaterial: number;
}

const EVAL_DEPTH = 12;
const MATE_SCORE = 20; // pawns-equivalent used to cap the chart when a mate is found

export default function AnalyzeMode({ engine, initialPgn }: AnalyzeModeProps) {
  const [pgnInput, setPgnInput] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [states, setStates] = useState<PlyState[]>([]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<PieceColor>('w');
  const [evals, setEvals] = useState<(number | null)[]>([]);
  const [players, setPlayers] = useState<{ white: string; black: string }>({ white: 'White', black: 'Black' });
  const evalTokenRef = useRef(0);
  const lastAppliedReviewToken = useRef<number | null>(null);

  const reviewGame = useMemo(() => {
    const g = new Chess();
    if (states.length) g.load(states[ply].fen);
    return g;
  }, [states, ply]);

  const computeEvals = useCallback(
    async (freshStates: PlyState[]) => {
      const token = ++evalTokenRef.current;
      for (let i = 0; i < freshStates.length; i++) {
        const result = await engine.evaluate(freshStates[i].fen, EVAL_DEPTH);
        if (token !== evalTokenRef.current) return; // a newer PGN was loaded, abandon this run
        const value = result ? (result.type === 'mate' ? Math.sign(result.value || 1) * MATE_SCORE : result.value / 100) : 0;
        setEvals((prev) => {
          const next = prev.slice();
          next[i] = value;
          return next;
        });
      }
    },
    [engine]
  );

  const loadPgnText = useCallback(
    (pgn: string) => {
      setError('');
      const trimmed = pgn.trim();
      if (!trimmed) {
        setError('Paste a PGN first.');
        return;
      }
      const probe = new Chess();
      try {
        probe.loadPgn(trimmed, { strict: false });
      } catch {
        setError('That PGN could not be read. Check the move text and try again.');
        return;
      }
      const moves = probe.history();
      if (moves.length === 0) {
        setError('That PGN could not be read. Check the move text and try again.');
        return;
      }
      const headers = probe.header();

      const walker = new Chess();
      const freshStates: PlyState[] = [
        { fen: walker.fen(), lastMove: null, san: null, piece: null, captured: null, nonPawnMaterial: nonPawnMaterial(walker) },
      ];
      for (const san of moves) {
        const m = walker.move(san);
        freshStates.push({
          fen: walker.fen(),
          lastMove: m ? { from: m.from, to: m.to } : null,
          san,
          piece: m?.piece ?? null,
          captured: m?.captured ?? null,
          nonPawnMaterial: nonPawnMaterial(walker),
        });
      }

      setPlayers({ white: headers.White || 'White', black: headers.Black || 'Black' });
      setStates(freshStates);
      setPly(freshStates.length - 1);
      setLoaded(true);
      setEvals(new Array(freshStates.length).fill(null));
      void computeEvals(freshStates);
    },
    [computeEvals]
  );

  const handleLoad = useCallback(() => {
    loadPgnText(pgnInput);
  }, [pgnInput, loadPgnText]);

  // Lets PlayMode hand a finished game straight to Analyze via "Review this game".
  useEffect(() => {
    if (!initialPgn || initialPgn.token === lastAppliedReviewToken.current) return;
    lastAppliedReviewToken.current = initialPgn.token;
    setPgnInput(initialPgn.pgn);
    loadPgnText(initialPgn.pgn);
  }, [initialPgn, loadPgnText]);

  const jumpTo = useCallback(
    (target: number) => {
      setPly(Math.max(0, Math.min(states.length - 1, target)));
    },
    [states.length]
  );

  const sanHistory = states.slice(1).map((s) => s.san as string);

  // --- move classification & game review, recomputed whenever a new eval lands ---
  const classifications: (MoveClass | null)[] = useMemo(() => {
    const out: (MoveClass | null)[] = [];
    for (let i = 1; i < states.length; i++) {
      const before = evals[i - 1];
      const after = evals[i];
      if (before === null || after === null) {
        out.push(null);
        continue;
      }
      const mover: PieceColor = i % 2 === 1 ? 'w' : 'b';
      out.push(
        classifyMove({
          mover,
          evalBefore: before,
          evalAfter: after,
          piece: states[i].piece || '',
          captured: states[i].captured || undefined,
        })
      );
    }
    return out;
  }, [states, evals]);

  const review = useMemo(() => {
    const whiteCounts = emptyClassCounts();
    const blackCounts = emptyClassCounts();
    const whiteLosses: number[] = [];
    const blackLosses: number[] = [];
    const phaseLosses: Record<GamePhase, { w: number[]; b: number[] }> = {
      opening: { w: [], b: [] },
      middlegame: { w: [], b: [] },
      endgame: { w: [], b: [] },
    };
    const totalPlies = sanHistory.length;

    classifications.forEach((cls, idx) => {
      const ply1 = idx + 1;
      const mover: PieceColor = ply1 % 2 === 1 ? 'w' : 'b';
      const before = evals[idx];
      const after = evals[idx + 1];
      if (cls === null || before === null || after === null) return;
      const loss = Math.max(0, (mover === 'w' ? before : -before) - (mover === 'w' ? after : -after));
      if (mover === 'w') {
        whiteCounts[cls] += 1;
        whiteLosses.push(loss);
      } else {
        blackCounts[cls] += 1;
        blackLosses.push(loss);
      }
      const phase = phaseForPly(ply1, totalPlies, states[ply1]?.nonPawnMaterial ?? 0);
      phaseLosses[phase][mover === 'w' ? 'w' : 'b'].push(loss);
    });

    const phases: PhaseRow[] = (['opening', 'middlegame', 'endgame'] as GamePhase[])
      .filter((p) => phaseLosses[p].w.length > 0 || phaseLosses[p].b.length > 0)
      .map((phase) => ({
        phase,
        white: accuracyFromLosses(phaseLosses[phase].w),
        black: accuracyFromLosses(phaseLosses[phase].b),
      }));

    return {
      whiteCounts,
      blackCounts,
      whiteAccuracy: accuracyFromLosses(whiteLosses),
      blackAccuracy: accuracyFromLosses(blackLosses),
      phases,
    };
  }, [classifications, evals, sanHistory.length, states]);

  const pendingEval = evals.some((v) => v === null);

  return (
    <section className="mode active">
      <div className="panel" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.1rem' }}>Load a game</h2>
        <p style={{ color: 'var(--ivory-dim)', fontSize: '0.86rem', marginTop: -2 }}>
          Paste PGN move text below, then step through it move by move. The graph shows Stockfish's evaluation of
          each position in pawns, computed live in your browser; positive favors White.
        </p>
        <textarea
          rows={5}
          placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ..."
          value={pgnInput}
          onChange={(e) => setPgnInput(e.target.value)}
        />
        <div style={{ marginTop: 10 }}>
          <button className="action" onClick={handleLoad}>Load Game</button>
          {error && <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginLeft: 10 }}>{error}</span>}
        </div>
      </div>

      {loaded && (
        <div className="panel fade-in">
          <div className="play-layout">
            <div className="board-col">
              <MaterialBar game={reviewGame} height="min(440px, 86vw)" />
              <div className="board-shell">
                <Board game={reviewGame} orientation={orientation} lastMove={states[ply]?.lastMove ?? null} />
                <div className="step-row">
                  <button className="ghost" onClick={() => jumpTo(0)}>&laquo;</button>
                  <button className="ghost" onClick={() => jumpTo(ply - 1)}>&lsaquo; Prev</button>
                  <input
                    type="range"
                    min={0}
                    max={states.length - 1}
                    value={ply}
                    style={{ flex: 1 }}
                    onChange={(e) => jumpTo(parseInt(e.target.value, 10))}
                  />
                  <button className="ghost" onClick={() => jumpTo(ply + 1)}>Next &rsaquo;</button>
                  <button className="ghost" onClick={() => jumpTo(states.length - 1)}>&raquo;</button>
                </div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="ghost" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>Flip</button>
                </div>
              </div>
            </div>
            <div className="side-panel">
              <div className="panel">
                <h3>Stockfish evaluation through the game</h3>
                <EvalChart evals={evals} ply={ply} onSelect={jumpTo} />
              </div>
              <GameReview
                whiteName={players.white}
                blackName={players.black}
                whiteAccuracy={review.whiteAccuracy}
                blackAccuracy={review.blackAccuracy}
                whiteCounts={review.whiteCounts}
                blackCounts={review.blackCounts}
                phases={review.phases}
                pending={pendingEval}
              />
              <div className="panel">
                <h3>Moves</h3>
                <MoveList moves={sanHistory} currentPly={ply} onJump={jumpTo} emptyText={'\u00A0'} classifications={classifications} />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EvalChart({ evals, ply, onSelect }: { evals: (number | null)[]; ply: number; onSelect: (p: number) => void }) {
  const w = 600;
  const h = 140;
  const mid = h / 2;
  const values = evals.map((v) => v ?? 0);
  const maxAbs = Math.max(4, ...values.map((v) => Math.abs(v)));
  const points = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * w : 0;
    const y = mid - (v / maxAbs) * (mid - 10);
    return [x, y] as const;
  });
  const pointsAttr = points.map(([x, y]) => x + ',' + y).join(' ');
  const areaAttr = points.length > 1 ? `0,${mid} ` + pointsAttr + ` ${w},${mid}` : '';
  const markerX = points.length > 1 ? (ply / (points.length - 1)) * w : 0;
  const markerY = points[ply]?.[1] ?? mid;
  const pending = evals.some((v) => v === null);

  return (
    <div className="chart-box">
      <svg
        viewBox={'0 0 ' + w + ' ' + h}
        style={{ width: '100%', height: 130, cursor: 'pointer' }}
        onClick={(e) => {
          if (values.length < 2) return;
          const rect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
          if (!rect) return;
          const relX = ((e.clientX - rect.left) / rect.width) * w;
          const idx = Math.round((relX / w) * (values.length - 1));
          onSelect(idx);
        }}
      >
        <line x1={0} y1={mid} x2={w} y2={mid} stroke="#33513f" strokeWidth={1} />
        {areaAttr && <polygon points={areaAttr} fill="url(#evalGradient)" opacity={0.35} />}
        <defs>
          <linearGradient id="evalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9a24b" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#c9a24b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <polyline points={pointsAttr} fill="none" stroke="#c9a24b" strokeWidth={2} className="eval-line" />
        {points.length > 0 && <circle cx={markerX} cy={markerY} r={4} fill="#efe8d6" stroke="#c9a24b" strokeWidth={2} className="eval-marker" />}
      </svg>
      {pending && <div className="footnote" style={{ marginTop: 6 }}>Evaluating positions&hellip;</div>}
    </div>
  );
}
