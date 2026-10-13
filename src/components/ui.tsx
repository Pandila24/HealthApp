import { useEffect, type ReactNode } from 'react';

export function Bar({ label, value, target, unit = 'g', color, invert = false }: { label: string; value: number; target: number; unit?: string; color: string; invert?: boolean }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  // For "limit" nutrients like sugar, going over is bad; for others it's just full.
  const fill = invert && over ? 'var(--danger)' : color;
  return (
    <div className="bar">
      <div className="bar-head">
        <span>{label}</span>
        <span className={invert && over ? 'danger' : 'muted'}>
          {Math.round(value)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
}

export function Ring({ value, target, size = 150 }: { value: number; target: number; size?: number }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const left = Math.round(target - value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value)} of ${target} calories`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth="12" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={left < 0 ? 'var(--danger)' : 'var(--accent)'}
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="46%" textAnchor="middle" className="ring-big">
        {Math.abs(left)}
      </text>
      <text x="50%" y="62%" textAnchor="middle" className="ring-small">
        {left >= 0 ? 'kcal left' : 'kcal over'}
      </text>
    </svg>
  );
}

/** Tiny dependency-free bar chart. */
export function BarChart({ data, target, height = 120, format = (n: number) => String(Math.round(n)) }: { data: { label: string; value: number }[]; target?: number; height?: number; format?: (n: number) => string }) {
  const max = Math.max(1, target ?? 0, ...data.map((d) => d.value)) * 1.1;
  const w = 100 / data.length;
  return (
    <svg className="chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }}>
      {target ? <line x1="0" x2="100" y1={height - 16 - ((height - 24) * target) / max} y2={height - 16 - ((height - 24) * target) / max} stroke="var(--muted)" strokeDasharray="2 2" strokeWidth="0.4" vectorEffect="non-scaling-stroke" /> : null}
      {data.map((d, i) => {
        const h = ((height - 24) * d.value) / max;
        return (
          <g key={i}>
            <rect x={i * w + w * 0.15} y={height - 16 - h} width={w * 0.7} height={h} rx="1" fill={target && d.value > target * 1.1 ? 'var(--warn)' : 'var(--accent)'}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
            <text x={i * w + w / 2} y={height - 4} textAnchor="middle" className="chart-label">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ data, height = 120, format = (n: number) => n.toFixed(1) }: { data: { label: string; value: number }[]; height?: number; format?: (n: number) => string }) {
  if (data.length < 2) return <p className="muted small">Add at least two entries to see a trend.</p>;
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 8;
  const pts = data.map((d, i) => [pad + (i * (100 - 2 * pad)) / (data.length - 1), pad + (1 - (d.value - min) / span) * (height - 2 * pad - 12)] as const);
  return (
    <div className="linechart">
      <svg className="chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }}>
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="linechart-axis small muted">
        <span>{data[0].label}</span>
        <span>
          {format(min)} – {format(max)}
        </span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

// Sheets can nest (e.g. exercise detail over the library), so track a stack:
// Escape closes only the top one and page scrolling unlocks when the last closes.
const sheetStack: symbol[] = [];

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const me = Symbol(title);
    sheetStack.push(me);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && sheetStack[sheetStack.length - 1] === me && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      sheetStack.splice(sheetStack.indexOf(me), 1);
      if (!sheetStack.length) document.body.style.overflow = '';
    };
  }, [onClose, title]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function NumberInput({ value, onChange, step = 1, min = 0, ...rest }: { value: number; onChange: (n: number) => void; step?: number; min?: number; className?: string; 'aria-label'?: string; placeholder?: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      // With a placeholder, 0 means "not entered yet" and shows the hint instead.
      value={!Number.isFinite(value) || (value === 0 && rest.placeholder) ? '' : value}
      step={step}
      min={min}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      {...rest}
    />
  );
}
