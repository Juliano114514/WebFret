import { useEffect, useRef, useState, type ReactNode } from 'react';

export function NumberField({
  value,
  min,
  max,
  onValue,
  onInvalid,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onValue: (value: number) => void;
  onInvalid?: () => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const valid = (text: string) =>
    text !== '' && Number.isInteger(Number(text)) && Number(text) >= min && Number(text) <= max;
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      value={draft}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        if (valid(text) && Number(text) !== value) onValue(Number(text));
      }}
      onBlur={() => {
        if (!valid(draft)) {
          setDraft(String(value));
          onInvalid?.();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
import type { Chord } from './model';

const paths: Record<string, ReactNode> = {
  library: (
    <>
      <path d="M4 5h6v15H4zM14 5h6v15h-6zM7 8h0M17 8h0" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l11-2v13M9 8l11-2" />
      <ellipse cx="6" cy="18" rx="3" ry="2" />
      <ellipse cx="17" cy="16" rx="3" ry="2" />
    </>
  ),
  guitar: (
    <>
      <path d="m14 10 5-7 3 3-7 5c3 5 0 8-4 10-4 2-9-3-7-7 1-2 4-2 4-4 0-2 3-4 6 0z" />
      <circle cx="10" cy="15" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4" />
    </>
  ),
  arrow: <path d="m9 5 7 7-7 7" />,
  back: <path d="m14 5-7 7 7 7M7 12h14" />,
  play: <path d="m8 4 12 8-12 8z" />,
  pause: (
    <>
      <path d="M7 5v14M17 5v14" strokeWidth="4" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  repeat: (
    <>
      <path d="M20 7H6l-3 3m3 7h14l3-3M17 4l3 3-3 3M7 14l-3 3 3 3" />
    </>
  ),
  check: <path d="m5 12 4 4L20 5" />,
  cloud: (
    <>
      <path d="M7 18H5a4 4 0 0 1-1-8 6 6 0 0 1 12-1 4.5 4.5 0 0 1 3 9h-2" />
      <path d="m9 16 2 2 4-4" />
    </>
  ),
  edit: (
    <>
      <path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  undo: (
    <>
      <path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7" />
    </>
  ),
  redo: (
    <>
      <path d="m16 5 5 5-5 5M21 10H11a7 7 0 0 0-7 7" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H3V3h12v2" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h13l4 4v14H3V3zM7 3v7h10V3M7 21v-7h10v7" />
    </>
  ),
  wifi: (
    <>
      <path d="M2 8a16 16 0 0 1 20 0M5 12a10 10 0 0 1 14 0M9 16a5 5 0 0 1 6 0" />
      <circle cx="12" cy="20" r=".5" />
    </>
  ),
  book: (
    <>
      <path d="M12 5v16M3 4c4-1 6 0 9 1 3-1 5-2 9-1v15c-4-1-6 0-9 1-3-1-5-2-9-1z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  headphones: (
    <>
      <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
      <rect x="3" y="12" width="4" height="8" rx="2" />
      <rect x="17" y="12" width="4" height="8" rx="2" />
    </>
  ),
};
export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name] ?? paths.music}
    </svg>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey) return;
      const controls = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]',
        ) ?? []),
      ].filter((el) => el.offsetParent !== null);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="关闭弹窗" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function ChordDiagram({ chord }: { chord: Chord }) {
  const frets = [...chord.frets].reverse();
  const positive = frets.filter((n) => n > 0);
  const base = positive.length && Math.min(...positive) > 3 ? Math.min(...positive) : 1;
  const width = 72,
    step = 44 / (frets.length - 1);
  return (
    <svg
      width={width}
      height="85"
      viewBox="0 0 72 85"
      role="img"
      aria-label={`${chord.name} 和弦指型`}
      className="chord-diagram"
    >
      <text x="36" y="13" textAnchor="middle" className="chord-name">
        {chord.name}
      </text>
      {Array.from({ length: 5 }, (_, i) => (
        <path
          key={'f' + i}
          d={`M14 ${27 + i * 10}h44`}
          stroke="currentColor"
          strokeWidth={i === 0 && base === 1 ? 2.5 : 0.7}
        />
      ))}
      {frets.map((fret, i) => (
        <g key={i}>
          <path d={`M${14 + i * step} 27v40`} stroke="currentColor" strokeWidth=".7" />
          {fret > 0 ? (
            <>
              <circle
                cx={14 + i * step}
                cy={32 + Math.min(fret - base, 3) * 10}
                r="3.2"
                fill="currentColor"
              />
              {fret - base > 3 && (
                <text x={14 + i * step} y="79" fontSize="8" textAnchor="middle">
                  {fret}
                </text>
              )}
            </>
          ) : (
            <text x={14 + i * step} y="23" textAnchor="middle" fontSize="9">
              {fret < 0 ? '×' : '○'}
            </text>
          )}
        </g>
      ))}
      {base > 1 && (
        <text x="5" y="35" fontSize="8">
          {base}
        </text>
      )}
    </svg>
  );
}
