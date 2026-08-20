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
  animationsOn: boolean;
  onAnimationsChange: (on: boolean) => void;
  children?: ReactNode;
}

export default function Sidebar({
  mode,
  onModeChange,
  themeIndex,
  onThemeChange,
  soundOn,
  onSoundChange,
  animationsOn,
  onAnimationsChange,
  children,
}: SidebarProps) {
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
          <span className="nav-icon">&#9812;</span> Play vs Computer
        </button>
        <button className={'nav-btn' + (mode === 'analyze' ? ' active' : '')} onClick={() => onModeChange('analyze')}>
          <span className="nav-icon">&#9787;</span> Analyze a Game
        </button>
      </nav>

      {children}

      <div className="side-section">
        <h3><span className="section-icon">&#9881;</span> Settings</h3>

        <div className="setting-block">
          <span className="setting-label">Board theme</span>
          <ThemeSwatches activeIndex={themeIndex} onChange={onThemeChange} />
        </div>

        <div className="toggle-row">
          <span>Move sounds</span>
          <label className="switch">
            <input type="checkbox" checked={soundOn} onChange={(e) => onSoundChange(e.target.checked)} />
            <span className="switch-track"><span className="switch-thumb" /></span>
          </label>
        </div>

        <div className="toggle-row">
          <span>Animations</span>
          <label className="switch">
            <input type="checkbox" checked={animationsOn} onChange={(e) => onAnimationsChange(e.target.checked)} />
            <span className="switch-track"><span className="switch-thumb" /></span>
          </label>
        </div>
      </div>

      <details className="side-section about">
        <summary>About this engine</summary>
        <p className="footnote">
          The computer opponent is the real Stockfish 18 engine, compiled to WebAssembly and running entirely in
          this browser tab, with no server calls. Difficulty adjusts its skill level and search depth, from casual
          blunders to strong club play.
        </p>
      </details>
    </aside>
  );
}
