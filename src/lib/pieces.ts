import type { ThemeDef } from './types';

export const PIECE_UNICODE: Record<string, string> = {
  wp: '\u2659', wn: '\u2658', wb: '\u2657', wr: '\u2656', wq: '\u2655', wk: '\u2654',
  bp: '\u265F', bn: '\u265E', bb: '\u265D', br: '\u265C', bq: '\u265B', bk: '\u265A',
};

export const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export const THEMES: ThemeDef[] = [
  { name: 'Forest', light: '#ebe3c7', dark: '#7c9a6a' },
  { name: 'Walnut', light: '#e8d3ad', dark: '#8a5a3b' },
  { name: 'Slate', light: '#dfe6ea', dark: '#5c7c93' },
  { name: 'Coral', light: '#f4e3d3', dark: '#b56655' },
  { name: 'Midnight', light: '#c9d3e0', dark: '#3a4a68' },
  { name: 'Rosewood', light: '#f0dfe0', dark: '#8a4a56' },
];

export const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};
