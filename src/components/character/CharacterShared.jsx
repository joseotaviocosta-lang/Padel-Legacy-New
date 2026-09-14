import React from 'react';

export function SectionLabel({ children }) {
  return <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">{children}</p>;
}

// Aviso de que um controle cosmético está sendo ofuscado por um item
// equipado na Loja/Inventário — a escolha continua salva e volta a valer
// assim que o item for desequipado; por isso o controle abaixo continua
// interativo (envolva com FallbackControl, não com `disabled`).
export function OverrideNotice({ itemName }) {
  return (
    <p className="text-[10px] text-amber-400/90 font-semibold mb-1.5 flex items-center gap-1">
      🔒 Sobrescrito pelo item equipado{itemName ? `: ${itemName}` : ''} — volta a valer ao desequipar
    </p>
  );
}

export function FallbackControl({ overridden, itemName, children }) {
  return (
    <div>
      {overridden && <OverrideNotice itemName={itemName} />}
      <div className={overridden ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
        {children}
      </div>
    </div>
  );
}

// Campo travado pós-criação (Fase A: height_cm/build) — diferente de
// FallbackControl: aqui não há valor de fallback esperando por trás, o
// valor É o definitivo. Trava rígida (sem resgate nesta fase), por isso o
// controle fica realmente inerte (pointer-events-none), não só dimmed.
export function LockedNotice() {
  return (
    <p className="text-[10px] text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
      🔒 Definido na criação do personagem — não pode ser alterado depois
    </p>
  );
}

export function LockedControl({ locked, children }) {
  return (
    <div>
      {locked && <LockedNotice />}
      <div className={locked ? 'opacity-50 pointer-events-none select-none' : undefined} aria-disabled={locked || undefined}>
        {children}
      </div>
    </div>
  );
}

// Sugestão de altura/biotipo (Fase B) com base no estilo/lado/mão já
// escolhidos no onboarding — nunca um bloqueio, só orientação contextual.
// Some sozinha quando o campo trava (Fase A) ou quando ainda não há
// estilo/lado escolhido (guard de getSuggestedPhysicalRange).
export function SuggestionNotice({ heightRange, buildLabel, secondaryBuildLabel, rationale, sideNote }) {
  return (
    <div className="rounded-lg bg-primary/8 border border-primary/20 px-3 py-2 text-[11px] leading-snug">
      <p className="font-semibold text-primary">
        💡 Sugestão pro seu perfil: {heightRange[0]}–{heightRange[1]}cm, biotipo {buildLabel}
        {secondaryBuildLabel ? ` (ou ${secondaryBuildLabel})` : ''}
      </p>
      <p className="text-muted-foreground mt-1">{rationale}</p>
      {sideNote && <p className="text-muted-foreground mt-1">{sideNote}</p>}
      <p className="text-muted-foreground/70 mt-1">Só uma sugestão — você pode escolher qualquer valor.</p>
    </div>
  );
}

export function ColorPicker({ label, options, value, onChange }) {
  const validOptions = (Array.isArray(options) ? options : []).filter(Boolean);
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {validOptions.map(opt => {
          const val = opt.id || opt;
          const isSel = value === val;
          const disabled = typeof opt === 'object' && (opt.unlocked === false || opt.disabled === true);
          const background = typeof opt === 'string' ? opt : opt.color || opt.id;
          return (
            <button
              type="button"
              key={val}
              onClick={() => !disabled && onChange(val)}
              disabled={disabled}
              aria-label={`${label}: ${opt.label || val}${disabled ? ' (bloqueado)' : ''}`}
              aria-pressed={isSel}
              data-option-id={val}
              className={`h-8 w-8 rounded-full border-2 transition-all ${isSel ? 'border-primary scale-110 ring-2 ring-primary/30' : 'border-transparent hover:scale-105'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              style={{ background }}
              title={opt.label || val}
            />
          );
        })}
      </div>
    </div>
  );
}

export function OptionGrid({ label, options, value, onChange, columns = 3 }) {
  const validOptions = (Array.isArray(options) ? options : []).filter(Boolean);
  const colClass = columns === 4 ? 'grid-cols-4' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div>
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className={`grid ${colClass} gap-2`}>
        {validOptions.map(opt => {
          const val = opt.id || opt;
          const isSel = value === val;
          const disabled = typeof opt === 'object' && (opt.unlocked === false || opt.disabled === true);
          return (
            <button
              type="button"
              key={val}
              onClick={() => !disabled && onChange(val)}
              disabled={disabled}
              aria-pressed={isSel}
              aria-label={`${label || 'Opção'}: ${opt.label || val}${disabled ? ' (bloqueado)' : ''}`}
              data-option-id={val}
              className={`rounded-xl p-2 border-2 transition-all text-center ${isSel ? 'border-primary bg-primary/10' : 'border-border glass hover:border-primary/30'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
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
        type="button"
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
        aria-label={label}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full bg-secondary appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

export function MultiSelectGrid({ label, options, selected, onToggle, columns = 4 }) {
  const validOptions = (Array.isArray(options) ? options : []).filter(Boolean);
  const colClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-4';
  return (
    <div>
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className={`grid ${colClass} gap-2`}>
        {validOptions.map(opt => {
          const val = opt.id || opt;
          const isSel = (selected || []).includes(val);
          return (
            <button
              type="button"
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
