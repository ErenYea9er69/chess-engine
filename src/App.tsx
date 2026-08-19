import { useEffect, useRef, useState } from 'react';
import Sidebar, { type Mode } from './components/Sidebar';
import PlayControls from './components/PlayControls';
import PlayMode, { type PlayModeHandle } from './modes/PlayMode';
import AnalyzeMode from './modes/AnalyzeMode';
import { useStockfish } from './engine/useStockfish';
import { THEMES } from './lib/pieces';
import type { Difficulty, PieceColor } from './lib/types';

export default function App() {
  const engine = useStockfish();
  const [mode, setMode] = useState<Mode>('play');
  const [themeIndex, setThemeIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(true);

  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [timeControl, setTimeControl] = useState('none');
  const [colorChoice, setColorChoice] = useState<PieceColor>('w');

  const playModeRef = useRef<PlayModeHandle>(null);

  useEffect(() => {
    const theme = THEMES[themeIndex];
    document.documentElement.style.setProperty('--light-sq', theme.light);
    document.documentElement.style.setProperty('--dark-sq', theme.dark);
  }, [themeIndex]);

  return (
    <div className="app">
      <Sidebar
        mode={mode}
        onModeChange={setMode}
        themeIndex={themeIndex}
        onThemeChange={setThemeIndex}
        soundOn={soundOn}
        onSoundChange={setSoundOn}
      >
        {mode === 'play' && (
          <PlayControls
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            timeControl={timeControl}
            onTimeControlChange={setTimeControl}
            color={colorChoice}
            onColorChange={setColorChoice}
            onNewGame={() => playModeRef.current?.newGame()}
            onUndo={() => playModeRef.current?.undo()}
            onFlip={() => playModeRef.current?.flip()}
            onResign={() => playModeRef.current?.resign()}
          />
        )}
      </Sidebar>

      <main className="main">
        {engine.error && <div className="feedback bad" style={{ marginBottom: 14 }}>{engine.error}</div>}
        {/* Both modes stay mounted so a game in progress isn't lost when switching tabs. */}
        <div style={{ display: mode === 'play' ? 'block' : 'none' }} data-mode-panel="play">
          <PlayMode ref={playModeRef} engine={engine} soundOn={soundOn} difficulty={difficulty} timeControl={timeControl} colorChoice={colorChoice} />
        </div>
        <div style={{ display: mode === 'analyze' ? 'block' : 'none' }} data-mode-panel="analyze">
          <AnalyzeMode engine={engine} />
        </div>
      </main>
    </div>
  );
}
