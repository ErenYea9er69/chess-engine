export type PieceColor = 'w' | 'b';
export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard';

export interface ThemeDef {
  name: string;
  light: string;
  dark: string;
}

export interface LastMove {
  from: string;
  to: string;
}

export interface EngineEval {
  type: 'cp' | 'mate';
  value: number; // always from White's perspective
}
