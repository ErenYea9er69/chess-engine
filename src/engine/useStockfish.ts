import { useEffect, useRef, useState, useCallback } from 'react';
import type { EngineEval } from '../lib/types';

export interface EngineMove {
  from: string;
  to: string;
  promotion?: string;
}

// Maps the UI difficulty to a Stockfish "Skill Level" (0-20) and search depth.
// Skill Level makes the engine deliberately blunder / play more human-like at
// low settings; depth caps how far it looks ahead so low levels also respond fast.
export const DIFFICULTY_SETTINGS: Record<string, { skill: number; depth: number }> = {
  beginner: { skill: 0, depth: 4 },
  easy: { skill: 5, depth: 7 },
  medium: { skill: 11, depth: 10 },
  hard: { skill: 20, depth: 14 },
};

/**
 * Wraps a single Stockfish 18 (lite, single-threaded WASM) worker in a small
 * promise-based API. All calls are serialized through a queue because a UCI
 * engine process can only handle one "go" at a time.
 */
export function useStockfish() {
  const workerRef = useRef<Worker | null>(null);
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    try {
      const worker = new Worker('/engine/stockfish-18-lite-single.js');
      workerRef.current = worker;
      worker.onerror = () => {
        setError('The chess engine failed to load. Try reloading the page.');
      };
      readyPromiseRef.current = new Promise((resolve) => {
        const onMessage = (e: MessageEvent) => {
          if (typeof e.data === 'string' && e.data.trim() === 'readyok') {
            worker.removeEventListener('message', onMessage);
            setReady(true);
            resolve();
          }
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage('uci');
        worker.postMessage('isready');
      });
    } catch {
      setError('The chess engine could not be started in this browser.');
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    getWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [getWorker]);

  // Runs `job` after the previous queued job settles, keeping engine calls sequential.
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(job, job);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const bestMove = useCallback(
    (fen: string, skillLevel: number, depth: number): Promise<EngineMove | null> => {
      return enqueue(
        () =>
          new Promise<EngineMove | null>((resolve) => {
            const worker = getWorker();
            if (!worker) return resolve(null);
            const onMessage = (e: MessageEvent) => {
              if (typeof e.data !== 'string') return;
              if (e.data.startsWith('bestmove')) {
                worker.removeEventListener('message', onMessage);
                const uci = e.data.split(' ')[1];
                if (!uci || uci === '(none)') return resolve(null);
                resolve({
                  from: uci.slice(0, 2),
                  to: uci.slice(2, 4),
                  promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
                });
              }
            };
            worker.addEventListener('message', onMessage);
            worker.postMessage('setoption name Skill Level value ' + skillLevel);
            worker.postMessage('position fen ' + fen);
            worker.postMessage('go depth ' + depth);
          })
      );
    },
    [enqueue, getWorker]
  );

  const evaluate = useCallback(
    (fen: string, depth = 12): Promise<EngineEval | null> => {
      return enqueue(
        () =>
          new Promise<EngineEval | null>((resolve) => {
            const worker = getWorker();
            if (!worker) return resolve(null);
            let last: EngineEval | null = null;
            const sideToMove = fen.split(' ')[1] === 'b' ? -1 : 1;
            const onMessage = (e: MessageEvent) => {
              if (typeof e.data !== 'string') return;
              if (e.data.startsWith('info') && e.data.includes(' score ')) {
                const m = e.data.match(/score (cp|mate) (-?\d+)/);
                if (m) {
                  // UCI scores are relative to the side to move; normalize to White's POV.
                  last = { type: m[1] as 'cp' | 'mate', value: sideToMove * parseInt(m[2], 10) };
                }
              }
              if (e.data.startsWith('bestmove')) {
                worker.removeEventListener('message', onMessage);
                resolve(last);
              }
            };
            worker.addEventListener('message', onMessage);
            worker.postMessage('setoption name Skill Level value 20');
            worker.postMessage('position fen ' + fen);
            worker.postMessage('go depth ' + depth);
          })
      );
    },
    [enqueue, getWorker]
  );

  return { ready, error, bestMove, evaluate };
}

export type UseStockfishReturn = ReturnType<typeof useStockfish>;
