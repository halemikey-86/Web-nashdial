import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../themes';

export function ThemeJack({ themeId, onChange }: { themeId: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === `Escape`) setOpen(false);
    };
    document.addEventListener(`pointerdown`, onPointer);
    document.addEventListener(`keydown`, onKey);
    return () => {
      document.removeEventListener(`pointerdown`, onPointer);
      document.removeEventListener(`keydown`, onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="theme-jack" ref={ref}>
      <button
        type="button"
        className={`theme-jack__input${open ? ` theme-jack__input--open` : ``}`}
        aria-label="Amp theme settings"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="theme-jack__plate" aria-hidden />
        <span className="theme-jack__ring" aria-hidden />
        <span className="theme-jack__hole" aria-hidden />
      </button>
      {open && (
        <div className="theme-jack__menu" role="menu" aria-label="Amp themes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={themeId === t.id}
              className={`theme-jack__option${themeId === t.id ? ` theme-jack__option--active` : ``}`}
              onClick={() => pick(t.id)}
            >
              <span className="theme-jack__option-name">{t.name}</span>
              <span className="theme-jack__option-sub">{t.subtitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
