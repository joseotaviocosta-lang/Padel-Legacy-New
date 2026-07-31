import React from 'react';

export default function HistoryEditor({ data, update }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">História do Personagem</p>
      <textarea
        value={data.backstory || ''}
        onChange={e => update('backstory', e.target.value)}
        rows={10}
        maxLength={1000}
        placeholder="Conte a história do seu atleta: de onde veio, como descobriu o padel, seus sonhos, rivalidades, estilo de vida, traumas, conquistas..."
        className="w-full rounded-xl glass bg-secondary/30 border border-border p-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 resize-none"
      />
      <p className="text-[10px] text-muted-foreground text-right">{(data.backstory || '').length} / 1000</p>
    </div>
  );
}