"use client";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

type Tone = 'gold' | 'line' | 'jade' | 'ruby';

export function Button({
  tone = 'line', small, busy, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; small?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`btn btn-${tone} ${small ? 'btn-sm' : ''} ${className}`}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Field({ label, hint, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs tracking-widest text-[#8fa1ad]">{label}</label>
      <input id={id} {...rest} className="field" />
      {hint ? <p className="mt-1 text-xs text-[#6f828f]">{hint}</p> : null}
    </div>
  );
}

export function Select({ label, className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs tracking-widest text-[#8fa1ad]">{label}</label>
      <select id={id} {...rest} className="field">{children}</select>
    </div>
  );
}

/** 2〜4択の切替（東風/半荘、3人/4人 など） */
export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-xs tracking-widest text-[#8fa1ad]">{label}</div>
      <div role="radiogroup" aria-label={label} className="flex border border-line">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-[40px] flex-1 whitespace-nowrap px-2 text-sm font-bold transition-colors ${
              o.value === value ? 'bg-gold text-[#1b1405]' : 'bg-transparent text-[#c4d0d8] hover:text-gold2'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[40px] w-full items-center justify-between gap-3 border border-line px-3 text-left text-sm hover:border-gold/60"
    >
      <span>
        {label}
        {hint ? <span className="ml-2 text-xs text-[#6f828f]">{hint}</span> : null}
      </span>
      <span className={`shrink-0 font-bold tracking-widest ${checked ? 'text-jade' : 'text-[#6f828f]'}`}>{checked ? 'あり' : 'なし'}</span>
    </button>
  );
}

export function Notice({ kind = 'error', children, onClose }: { kind?: 'error' | 'ok' | 'info'; children: ReactNode; onClose?: () => void }) {
  if (!children) return null;
  const c = kind === 'error' ? 'border-ruby/60 bg-ruby/10 text-[#ffd9de]' : kind === 'ok' ? 'border-jade/60 bg-jade/10 text-[#c9f5e8]' : 'border-line bg-panel2 text-[#c4d0d8]';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 border px-3 py-2 text-sm ${c}`}>
      <span>{children}</span>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="閉じる" className="shrink-0 px-1 opacity-70 hover:opacity-100">×</button>
      ) : null}
    </div>
  );
}

export function Frame({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`frame p-4 sm:p-5 ${className}`}>
      {title ? (
        <header className="mb-3 flex items-center gap-3">
          <h2 className="font-display shrink-0 text-base font-extrabold tracking-[0.18em] text-gold2">{title}</h2>
          <div className="rule-gold flex-1" />
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Dialog({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`frame room-in flex max-h-[calc(100dvh-24px)] w-full flex-col outline-none ${wide ? 'max-w-3xl' : 'max-w-md'}`}
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="font-display text-base font-extrabold tracking-[0.18em] text-gold2">{title}</h2>
          <div className="rule-gold flex-1" />
          <button type="button" onClick={onClose} aria-label="閉じる" className="px-2 text-xl leading-none text-[#8fa1ad] hover:text-gold2">×</button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Delta({ value, score }: { value: number | null | undefined; score?: boolean }) {
  if (value === null || value === undefined) return <span className="text-[#6f828f]">—</span>;
  const abs = score ? Math.abs(value).toFixed(1) : Math.abs(Math.trunc(value)).toLocaleString('ja-JP');
  return (
    <span className={`tabular font-bold ${value > 0 ? 'text-jade' : value < 0 ? 'text-ruby' : 'text-[#8fa1ad]'}`}>
      {value > 0 ? '+' : value < 0 ? '−' : '±'}{abs}
    </span>
  );
}

export function Tag({ children, tone = 'line' }: { children: ReactNode; tone?: 'gold' | 'jade' | 'ruby' | 'line' | 'sky' }) {
  const c = { gold: 'border-gold/70 text-gold2', jade: 'border-jade/70 text-jade', ruby: 'border-ruby/70 text-ruby', sky: 'border-sky/70 text-sky', line: 'border-line text-[#8fa1ad]' }[tone];
  return <span className={`inline-block whitespace-nowrap border px-1.5 py-px text-[11px] font-bold tracking-widest ${c}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-[#6f828f]">{children}</p>;
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#8fa1ad]">
      <Spinner /> 読み込み中
    </div>
  );
}

/** 整数入力（全角・カンマを許す）。空や不正は null。 */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，\s]/g, '');
  if (!/^\d{1,10}$/.test(t)) return null;
  return Number(t);
}
