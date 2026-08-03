import React from 'react';

export function SectionLabel({ children }) {
  return <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">{children}</p>;
}

export function ColorPicker({ label, options, value, onChange }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const val = opt.id || opt;
          const isSel = value === val;
          return (
            <button
              key={val}
              onClick={() => onChange(val)}
              className={`h-8 w-8 rounded-full border-2 transition-all ${isSel ? 'border-primary scale-110 ring-2 ring-primary/30' : 'border-transparent hover:scale-105'}`}
              style={{ background: opt.color || opt }}
              title={opt.label}
            />
          );
        })}
      </div>
    </div>
  );
}

export function OptionGrid({ label, options, value, onChange, columns = 3 }) {
  const colClass = columns === 4 ? 'grid-cols-4' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div>
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className={`grid ${colClass} gap-2`}>
        {options.map(opt => {
          const val = opt.id || opt;
          const isSel = value === val;
          return (
            <button
              key={val}
              onClick={() => onChange(val)}
              className={`rounded-xl p-2 border-2 transition-all text-center ${isSel ? 'border-primary bg-primary/10' : 'border-border glass hover:border-primary/30'}`}
            >
              {opt.emoji && <div className="text-xl mb-0.5">{opt.emoji}</div>}
              <div className="text-[10px] font-semibold leading-tight">{opt.label || opt}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ToggleRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between glass rounded-xl px-3 py-2.5">
      <span className="text-sm font-semibold">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-secondary'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export function SliderRow({ label, value, onChange, min = 0, max = 100, unit = '' }) {
  const parsedValue = Number(value);
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : min;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-xs font-black text-primary tabular-nums">{safeValue}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={safeValue}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full bg-secondary appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

export function MultiSelectGrid({ label, options, selected, onToggle, columns = 4 }) {
  const colClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-4';
  return (
    <div>
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className={`grid ${colClass} gap-2`}>
        {options.map(opt => {
          const val = opt.id || opt;
          const isSel = (selected || []).includes(val);
          return (
            <button
              key={val}
              onClick={() => onToggle(val)}
              className={`rounded-xl p-2 border-2 transition-all text-center ${isSel ? 'border-primary bg-primary/10' : 'border-border glass hover:border-primary/30'}`}
            >
              {opt.emoji && <div className="text-xl mb-0.5">{opt.emoji}</div>}
              <div className="text-[10px] font-semibold leading-tight">{opt.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
