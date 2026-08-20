import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import Board from '../components/Board';
import MaterialBar from '../components/MaterialBar';
import MoveList from '../components/MoveList';
import Clock from '../components/Clock';
import PromotionModal from '../components/PromotionModal';
import { capturedDisplay } from '../lib/material';
import { gameOverMessage } from '../lib/status';
import { playMoveSound, playCheckSound, playGameOverSound } from '../lib/sound';
import { DIFFICULTY_SETTINGS, type UseStockfishReturn } from '../engine/useStockfish';
import type { Difficulty, LastMove, PieceColor } from '../lib/types';

export interface PlayModeHandle {
  newGame: () => void;
  undo: () => void;
  flip: () => void;
  resign: () => void;
}

interface PlayModeProps {
  engine: UseStockfishReturn;
  soundOn: boolean;
  difficulty: Difficulty;
  timeControl: string;
  colorChoice: PieceColor;
  onRequestReview?: (pgn: string) => void;
}

type StatusKind = 'good' | 'danger';
interface Feedback {
  kind: 'good' | 'bad' | 'over';
  text: string;
}

const PlayMode = forwardRef<PlayModeHandle, PlayModeProps>(function PlayMode(
  { engine, soundOn, difficulty, timeControl, colorChoice, onRequestReview },
  ref
) {
  const gameRef = useRef(new Chess());
  const [, setTick] = useState(0);
  const redraw = useCallback(() => setTick((t) => t + 1), []);

  const [playerColor, setPlayerColor] = useState<PieceColor>('w');
  const [orientation, setOrientation] = useState<PieceColor>('w');
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<{ kind: StatusKind; text: string }>({ kind: 'good', text: 'Your move.' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);

  const overRef = useRef(over);
  overRef.current = over;
  const moveTokenRef = useRef(0);

  // ---- clock ----
  const [clockOn, setClockOn] = useState(false);
  const clockRef = useRef({ w: 0, b: 0 });
  const [, setClockTick] = useState(0);
  const activeColorRef = useRef<PieceColor | null>(null);
  const clockIntervalRef = useRef<number | null>(null);

  const stopClockInterval = useCallback(() => {
    if (clockIntervalRef.current !== null) {
      window.clearInterval(clockIntervalRef.current);
      clockIntervalRef.current = null;
    }
    activeColorRef.current = null;
    setClockTick((t) => t + 1);
  }, []);

  const handleFlag = useCallback(() => {
    stopClockInterval();
    const game = gameRef.current;
    const loser = clockRef.current.w <= 0 ? 'White' : 'Black';
    const winner = loser === 'White' ? 'Black' : 'White';
    setOver(true);
    setFeedback({ kind: 'over', text: loser + ' ran out of time. ' + winner + ' wins.' });
    setStatus({ kind: 'danger', text: loser + ' ran out of time.' });
    playGameOverSound(soundOn);
    void game; // clock loss doesn't need a board mutation
  }, [soundOn, stopClockInterval]);

  const switchClock = useCallback(
    (turnColor: PieceColor) => {
      activeColorRef.current = turnColor;
      setClockTick((t) => t + 1);
      if (clockIntervalRef.current !== null) window.clearInterval(clockIntervalRef.current);
      clockIntervalRef.current = window.setInterval(() => {
        const ac = activeColorRef.current;
        if (!ac || overRef.current) return;
        clockRef.current[ac] = Math.max(0, clockRef.current[ac] - 1);
        setClockTick((t) => t + 1);
        if (clockRef.current.w <= 0 || clockRef.current.b <= 0) handleFlag();
      }, 1000);
    },
    [handleFlag]
  );

  useEffect(() => stopClockInterval, [stopClockInterval]);

  // ---- core move handling ----
  const afterMove = useCallback(
    (mover: PieceColor) => {
      const game = gameRef.current;
      redraw();
      if (game.isGameOver()) {
        setOver(true);
        stopClockInterval();
        const msg = gameOverMessage(game);
        setFeedback({ kind: 'over', text: msg });
        setStatus({ kind: 'danger', text: msg });
        playGameOverSound(soundOn);
        return;
      }
      if (game.inCheck()) {
        playCheckSound(soundOn);
        setStatus({ kind: 'danger', text: (game.turn() === playerColor ? 'You are' : 'Computer is') + ' in check.' });
      } else {
        setStatus({ kind: 'good', text: game.turn() === playerColor ? 'Your move.' : 'Waiting for the computer.' });
      }
      void mover;
      if (clockOn) switchClock(game.turn());
    },
    [redraw, soundOn, playerColor, clockOn, switchClock, stopClockInterval]
  );

  const scheduleAiMove = useCallback(() => {
    setBusy(true);
    setStatus({ kind: 'good', text: 'Computer is thinking\u2026' });
    const token = ++moveTokenRef.current;
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const fen = gameRef.current.fen();
    engine
      .bestMove(fen, settings.skill, settings.depth)
      .then((mv) => {
        if (token !== moveTokenRef.current) return; // stale response (undo/new game happened)
        setBusy(false);
        const game = gameRef.current;
        if (!mv) {
          afterMove(game.turn());
          return;
        }
        const moveInfo = game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || 'q' });
        if (!moveInfo) {
          afterMove(game.turn());
          return;
        }
        setLastMove({ from: mv.from, to: mv.to });
        playMoveSound(!!moveInfo.captured, soundOn);
        afterMove(moveInfo.color as PieceColor);
      })
      .catch(() => {
        if (token !== moveTokenRef.current) return;
        setBusy(false);
      });
  }, [engine, difficulty, soundOn, afterMove]);

  const commitPlayerMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const game = gameRef.current;
      const moveInfo = game.move({ from, to, promotion: promotion || 'q' });
      if (!moveInfo) return;
      setSelected(null);
      setLastMove({ from, to });
      playMoveSound(!!moveInfo.captured, soundOn);
      afterMove(moveInfo.color as PieceColor);
      if (!game.isGameOver() && game.turn() !== playerColor) {
        scheduleAiMove();
      }
    },
    [afterMove, soundOn, playerColor, scheduleAiMove]
  );

  const onSquareClick = useCallback(
    (sq: string) => {
      if (busy || over) return;
      const game = gameRef.current;
      if (game.turn() !== playerColor) return;
      const piece = game.get(sq as any);

      if (selected === null) {
        if (piece && piece.color === game.turn()) {
          setSelected(sq);
        }
        return;
      }
      if (sq === selected) {
        setSelected(null);
        return;
      }
      if (piece && piece.color === game.turn()) {
        setSelected(sq);
        return;
      }
      const legal = game.moves({ square: selected as any, verbose: true }) as any[];
      const match = legal.find((m) => m.to === sq);
      if (!match) {
        setSelected(null);
        return;
      }
      if (match.flags.indexOf('p') !== -1) {
        setPendingPromotion({ from: selected, to: sq });
      } else {
        commitPlayerMove(selected, sq);
      }
    },
    [busy, over, playerColor, selected, commitPlayerMove]
  );

  const onPromotionChoice = useCallback(
    (piece: 'q' | 'r' | 'b' | 'n') => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      setPendingPromotion(null);
      commitPlayerMove(from, to, piece);
    },
    [pendingPromotion, commitPlayerMove]
  );

  const startNewGame = useCallback(() => {
    moveTokenRef.current++; // invalidate any in-flight AI move
    gameRef.current = new Chess();
    setSelected(null);
    setLastMove(null);
    setBusy(false);
    setOver(false);
    setFeedback(null);
    setPendingPromotion(null);
    setPlayerColor(colorChoice);
    setOrientation(colorChoice);

    const tcOn = timeControl !== 'none';
    setClockOn(tcOn);
    stopClockInterval();
    if (tcOn) {
      const secs = parseInt(timeControl, 10);
      clockRef.current = { w: secs, b: secs };
    } else {
      clockRef.current = { w: 0, b: 0 };
    }
    setClockTick((t) => t + 1);
    redraw();
    setStatus({ kind: 'good', text: colorChoice === 'w' ? 'Your move.' : 'Waiting for the computer.' });

    if (tcOn) switchClock('w');
    if (colorChoice === 'b') {
      // Computer plays White's first move.
      setTimeout(() => scheduleAiMove(), 50);
    }
  }, [colorChoice, timeControl, difficulty, engine, soundOn, afterMove, redraw, stopClockInterval, switchClock, scheduleAiMove]);

  // start an initial game on mount
  useEffect(() => {
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = useCallback(() => {
    if (busy) return;
    moveTokenRef.current++; // invalidate any in-flight AI move
    const game = gameRef.current;
    game.undo();
    if (game.turn() !== playerColor) game.undo();
    setBusy(false);
    setOver(false);
    setLastMove(null);
    setSelected(null);
    setFeedback(null);
    redraw();
    setStatus({ kind: 'good', text: 'Your move.' });
  }, [busy, playerColor, redraw]);

  const flip = useCallback(() => {
    setOrientation((o) => (o === 'w' ? 'b' : 'w'));
  }, []);

  const resign = useCallback(() => {
    if (over) return;
    setOver(true);
    stopClockInterval();
    const winner = playerColor === 'w' ? 'Black' : 'White';
    setFeedback({ kind: 'over', text: 'You resigned. ' + winner + ' wins.' });
    setStatus({ kind: 'danger', text: 'You resigned.' });
  }, [over, playerColor, stopClockInterval]);

  const downloadPgn = useCallback(() => {
    const pgn = gameRef.current.pgn();
    const blob = new Blob([pgn || '*'], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'game.pgn';
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  useImperativeHandle(ref, () => ({ newGame: startNewGame, undo, flip, resign }), [startNewGame, undo, flip, resign]);

  const game = gameRef.current;
  const legalTargets = selected
    ? (game.moves({ square: selected as any, verbose: true }) as any[]).map((m) => m.to)
    : [];

  const captured = capturedDisplay(game, orientation);
  const topColor: PieceColor = orientation === 'w' ? 'b' : 'w';
  const bottomColor: PieceColor = orientation === 'w' ? 'w' : 'b';
  const topName = topColor === playerColor ? 'You' : 'Computer';
  const bottomName = bottomColor === playerColor ? 'You' : 'Computer';

  return (
    <section className="mode active">
      <div className={'status-bar' + (busy ? ' busy' : '')}>
        <span className={'status-dot ' + status.kind} />
        <span>{status.text}</span>
        {busy && (
          <span className="thinking-dots" aria-hidden="true">
            <i /><i /><i />
          </span>
        )}
      </div>

      <div className="play-layout">
        <div className="board-col">
          <MaterialBar game={game} height="min(460px, 86vw)" />
          <div className="board-shell">
            <Clock name={topName} seconds={clockOn ? clockRef.current[topColor] : null} active={clockOn && activeColorRef.current === topColor} flag={clockOn && clockRef.current[topColor] <= 0} />
            <div className="captured">
              {captured.top}
              {captured.topDiff > 0 && <span className="diff">+{captured.topDiff}</span>}
            </div>
            <Board
              game={game}
              orientation={orientation}
              selected={selected}
              legalTargets={legalTargets}
              lastMove={lastMove}
              onSquareClick={onSquareClick}
            />
            <div className="captured">
              {captured.bottom}
              {captured.bottomDiff > 0 && <span className="diff">+{captured.bottomDiff}</span>}
            </div>
            <Clock name={bottomName} seconds={clockOn ? clockRef.current[bottomColor] : null} active={clockOn && activeColorRef.current === bottomColor} flag={clockOn && clockRef.current[bottomColor] <= 0} />
          </div>
        </div>

        <div className="side-panel">
          {feedback && <div className={'feedback ' + feedback.kind}>{feedback.text}</div>}
          <div className="panel">
            <h3>Moves</h3>
            <MoveList moves={game.history()} />
          </div>
          <div className="panel">
            <h3>Game options</h3>
            <div className="btn-row">
              <button className="ghost" onClick={downloadPgn}>Download PGN</button>
              {over && onRequestReview && (
                <button className="action" onClick={() => onRequestReview(game.pgn())}>Review this game</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingPromotion && <PromotionModal color={playerColor} onChoose={onPromotionChoice} />}
    </section>
  );
});

export default PlayMode;
