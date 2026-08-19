import type { Difficulty, PieceColor } from '../lib/types';

interface PlayControlsProps {
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  timeControl: string;
  onTimeControlChange: (v: string) => void;
  color: PieceColor;
  onColorChange: (c: PieceColor) => void;
  onNewGame: () => void;
  onUndo: () => void;
  onFlip: () => void;
  onResign: () => void;
}

export default function PlayControls({
  difficulty,
  onDifficultyChange,
  timeControl,
  onTimeControlChange,
  color,
  onColorChange,
  onNewGame,
  onUndo,
  onFlip,
  onResign,
}: PlayControlsProps) {
  return (
    <div className="side-section" id="playControls">
      <h3>Match Setup</h3>
      <div className="field">
        <label htmlFor="difficultySelect">Difficulty</label>
        <select id="difficultySelect" value={difficulty} onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}>
          <option value="beginner">Beginner</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="timeControlSelect">Time control</label>
        <select id="timeControlSelect" value={timeControl} onChange={(e) => onTimeControlChange(e.target.value)}>
          <option value="none">No clock</option>
          <option value="180">3 min</option>
          <option value="300">5 min</option>
          <option value="600">10 min</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="colorSelect">Play as</label>
        <select id="colorSelect" value={color} onChange={(e) => onColorChange(e.target.value as PieceColor)}>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
      </div>
      <button className="action" style={{ width: '100%' }} onClick={onNewGame}>
        New Game
      </button>
      <div className="btn-row">
        <button className="ghost" onClick={onUndo}>Undo</button>
        <button className="ghost" onClick={onFlip}>Flip</button>
        <button className="ghost danger" onClick={onResign}>Resign</button>
      </div>
    </div>
  );
}
