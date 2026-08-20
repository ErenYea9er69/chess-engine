#!/usr/bin/env node
/**
 * Grid-searches the two accuracy knobs in src/lib/analysis.ts
 * (curveK, powerMeanExponent) against real games where you already know
 * what chess.com reported, so the formula in this repo can be tuned to your
 * own data instead of the three-point fit that ships as the default.
 *
 * Neither chess.com's formula nor a public reference implementation of it
 * is available, so there's no substitute for calibrating against real
 * examples — this script just automates the search once you've gathered a
 * handful.
 *
 * HOW TO GATHER SAMPLES
 * ----------------------
 * For a handful of your own games (10-20 is plenty to start):
 *   1. Run chess.com's Game Review on the game, note the Accuracy it shows
 *      for one side (targetAccuracy).
 *   2. Run *this* webapp's analysis on the same PGN.
 *   3. For that same side, record the per-move win%-loss for every move
 *      chess.com did NOT mark as "Book" (winPercentLoss() in analysis.ts is
 *      already computing exactly this number per move — a quick console.log
 *      in AnalyzeMode's review useMemo, right where it pushes into
 *      whiteLosses/blackLosses, will get you the array to paste below).
 *   4. Add one entry to calibration-sample.json per (game, side).
 *
 * Usage: node scripts/calibrate-accuracy.mjs [path-to-samples.json]
 * Defaults to scripts/calibration-sample.json if no path is given.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesPath = process.argv[2] ?? path.join(__dirname, 'calibration-sample.json');

function moveAccuracyScore(loss, curveK) {
  return Math.max(0, Math.min(100, 100 * Math.exp(-Math.max(0, loss) / curveK)));
}

function accuracyFromLosses(losses, curveK, powerMeanExponent, moveScoreFloor) {
  if (losses.length === 0) return null;
  const moveScores = losses.map((loss) => Math.max(moveScoreFloor, moveAccuracyScore(loss, curveK)));
  let score;
  if (Math.abs(powerMeanExponent) < 1e-9) {
    const logSum = moveScores.reduce((sum, s) => sum + Math.log(s), 0);
    score = Math.exp(logSum / moveScores.length);
  } else {
    const meanOfPowers = moveScores.reduce((sum, s) => sum + Math.pow(s, powerMeanExponent), 0) / moveScores.length;
    score = Math.pow(meanOfPowers, 1 / powerMeanExponent);
  }
  return Math.max(0, Math.min(100, score));
}

function meanAbsError(samples, curveK, powerMeanExponent, moveScoreFloor) {
  let total = 0;
  for (const s of samples) {
    const predicted = accuracyFromLosses(s.losses, curveK, powerMeanExponent, moveScoreFloor);
    total += Math.abs((predicted ?? 0) - s.targetAccuracy);
  }
  return total / samples.length;
}

let samples;
try {
  samples = JSON.parse(readFileSync(samplesPath, 'utf-8'));
} catch (err) {
  console.error(`Couldn't read samples from ${samplesPath}: ${err.message}`);
  console.error('See the header comment in this file for the expected format.');
  process.exit(1);
}

if (!Array.isArray(samples) || samples.length === 0) {
  console.error('Samples file must be a non-empty JSON array of { losses: number[], targetAccuracy: number }.');
  process.exit(1);
}

const FLOOR = 3; // held fixed; free to add to the grid search too if you want to chase it further
let best = { curveK: null, powerMeanExponent: null, error: Infinity };

for (let curveK = 4; curveK <= 30; curveK += 0.5) {
  for (let p = -1.5; p <= 1.0; p += 0.05) {
    const error = meanAbsError(samples, curveK, p, FLOOR);
    if (error < best.error) best = { curveK, powerMeanExponent: p, error };
  }
}

console.log(`Searched ${samples.length} sample(s).`);
console.log('Best fit:');
console.log(`  curveK = ${best.curveK}`);
console.log(`  powerMeanExponent = ${best.powerMeanExponent.toFixed(2)}`);
console.log(`  mean absolute error vs chess.com = ${best.error.toFixed(2)} accuracy points`);
console.log('\nPaste these into DEFAULT_ACCURACY_OPTIONS in src/lib/analysis.ts.');
console.log('More samples (and covering a wider rating/sharpness range) will make this more reliable —');
console.log('a handful of games can overfit to whatever those specific games happened to look like.');
