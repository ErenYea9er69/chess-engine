import type { ReactNode } from 'react';
import ThemeSwatches from './ThemeSwatches';

export type Mode = 'play' | 'analyze';

interface SidebarProps {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  themeIndex: number;
  onThemeChange: (i: number) => void;
  soundOn: boolean;
  onSoundChange: (on: boolean) => void;
  children?: ReactNode;
}

export default function Sidebar({ mode, onModeChange, themeIndex, onThemeChange, soundOn, onSoundChange, children }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark">&#9822;</span>
        <div>
          <h1>Chess Club</h1>
          <div className="sub">Plays fully in your browser</div>
        </div>
      </div>

      <nav className="nav">
        <button className={'nav-btn' + (mode === 'play' ? ' active' : '')} onClick={() => onModeChange('play')}>
          &#9812; Play vs Computer
        </button>
        <button className={'nav-btn' + (mode === 'analyze' ? ' active' : '')} onClick={() => onModeChange('analyze')}>
          &#9787; Analyze a Game
        </button>
      </nav>

      {children}

      <div className="side-section">
        <h3>Board Theme</h3>
        <ThemeSwatches activeIndex={themeIndex} onChange={onThemeChange} />
        <div className="toggle-row">
          <span>Move sounds</span>
          <input type="checkbox" checked={soundOn} onChange={(e) => onSoundChange(e.target.checked)} />
        </div>
      </div>

      <div className="footnote">
        The computer opponent is the real Stockfish 18 engine, compiled to WebAssembly and running entirely in this
        browser tab &mdash; no server calls. Difficulty adjusts its skill level and search depth, from casual
        blunders to strong club play.
      </div>
    </aside>
  );
}
