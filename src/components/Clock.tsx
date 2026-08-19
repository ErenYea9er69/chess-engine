function formatClock(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

interface ClockProps {
  name: string;
  seconds: number | null; // null when clock is off
  active: boolean;
  flag: boolean;
}

export default function Clock({ name, seconds, active, flag }: ClockProps) {
  const classes = ['clock'];
  if (active) classes.push('active');
  if (flag) classes.push('flag');
  return (
    <div className={classes.join(' ')}>
      <span className="name">{name}</span>
      <span className="time">{seconds === null ? '\u2014' : formatClock(seconds)}</span>
    </div>
  );
}
