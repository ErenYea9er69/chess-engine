import { useCallback, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from '../components/Board';
import MaterialBar from '../components/MaterialBar';
import MoveList from '../components/MoveList';
import type { UseStockfishReturn } from '../engine/useStockfish';
import type { LastMove, PieceColor } from '../lib/types';

interface AnalyzeModeProps {
  engine: UseStockfishReturn;
}

interface PlyState {
  fen: string;
  lastMove: LastMove | null;
  san: string | null;
}

const EVAL_DEPTH = 12;
const MATE_SCORE = 20; // pawns-equivalent used to cap the chart when a mate is found

export default function AnalyzeMode({ engine }: AnalyzeModeProps) {
  const [pgnInput, setPgnInput] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [states, setStates] = useState<PlyState[]>([]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<PieceColor>('w');
  const [evals, setEvals] = useState<(number | null)[]>([]);
  const evalTokenRef = useRef(0);

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

  const handleLoad = useCallback(() => {
    setError('');
    const pgn = pgnInput.trim();
    if (!pgn) {
      setError('Paste a PGN first.');
      return;
    }
    const probe = new Chess();
    try {
      probe.loadPgn(pgn, { strict: false });
    } catch {
      setError('That PGN could not be read. Check the move text and try again.');
      return;
    }
    const moves = probe.history();
    if (moves.length === 0) {
      setError('That PGN could not be read. Check the move text and try again.');
      return;
    }

    const walker = new Chess();
    const freshStates: PlyState[] = [{ fen: walker.fen(), lastMove: null, san: null }];
    for (const san of moves) {
      const m = walker.move(san);
      freshStates.push({ fen: walker.fen(), lastMove: m ? { from: m.from, to: m.to } : null, san });
    }

    setStates(freshStates);
    setPly(freshStates.length - 1);
    setLoaded(true);
    setEvals(new Array(freshStates.length).fill(null));
    void computeEvals(freshStates);
  }, [pgnInput, computeEvals]);

  const jumpTo = useCallback(
    (target: number) => {
      setPly(Math.max(0, Math.min(states.length - 1, target)));
    },
    [states.length]
  );

  const sanHistory = states.slice(1).map((s) => s.san as string);

  return (
    <section className="mode active">
      <div className="panel" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.1rem' }}>Load a game</h2>
        <p style={{ color: 'var(--ivory-dim)', fontSize: '0.86rem', marginTop: -2 }}>
          Paste PGN move text below, then step through it move by move. The graph shows Stockfish's evaluation of
          each position in pawns, computed live in your browser, positive favors White.
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
        <div className="panel">
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
              <div className="panel">
                <h3>Moves</h3>
                <MoveList moves={sanHistory} currentPly={ply} onJump={jumpTo} emptyText={'\u00A0'} />
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
        <polyline points={pointsAttr} fill="none" stroke="#c9a24b" strokeWidth={2} />
        {points.length > 0 && <circle cx={markerX} cy={markerY} r={4} fill="#efe8d6" stroke="#c9a24b" strokeWidth={2} />}
      </svg>
      {pending && <div className="footnote" style={{ marginTop: 6 }}>Evaluating positions&hellip;</div>}
    </div>
  );
}
