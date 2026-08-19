let audioCtx: AudioContext | null = null;

function beep(freq: number, durationMs: number, delayMs = 0) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const start = audioCtx.currentTime + delayMs / 1000;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + durationMs / 1000);
  } catch {
    /* audio not available, ignore */
  }
}

export function playMoveSound(isCapture: boolean, enabled: boolean) {
  if (!enabled) return;
  if (isCapture) beep(300, 90);
  else beep(620, 70);
}

export function playCheckSound(enabled: boolean) {
  if (!enabled) return;
  beep(880, 80);
  beep(880, 80, 120);
}

export function playGameOverSound(enabled: boolean) {
  if (!enabled) return;
  beep(500, 120);
  beep(400, 160, 140);
  beep(300, 220, 300);
}
