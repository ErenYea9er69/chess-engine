import { THEMES } from '../lib/pieces';

interface ThemeSwatchesProps {
  activeIndex: number;
  onChange: (index: number) => void;
}

export default function ThemeSwatches({ activeIndex, onChange }: ThemeSwatchesProps) {
  return (
    <div className="swatches">
      {THEMES.map((t, i) => (
        <div
          key={t.name}
          className={'swatch' + (i === activeIndex ? ' active' : '')}
          title={t.name}
          role="button"
          aria-label={'Use ' + t.name + ' theme'}
          onClick={() => onChange(i)}
        >
          <i style={{ background: t.light }} />
          <i style={{ background: t.dark }} />
        </div>
      ))}
    </div>
  );
}
