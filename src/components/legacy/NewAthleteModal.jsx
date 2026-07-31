import React, { useState } from 'react';
import { X, Baby, Sparkles, Check } from 'lucide-react';
import { GlassCard } from '@/components/padel/ui';

export default function NewAthleteModal({ bonuses, coachName, onConfirm, onClose }) {
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div className="glass rounded-t-3xl md:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black flex items-center gap-2">
            <Baby className="h-5 w-5 text-primary" /> Nova Carreira
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Como treinador, você guiará um novo talento da geração seguinte. Os bônus de legado de <span className="text-primary font-semibold">{coachName}</span> serão aplicados.
        </p>

        <div className="mb-4">
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5 block">Nome do novo atleta</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: João Silva"
            maxLength={30}
            className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/60 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            autoFocus
          />
        </div>

        {bonuses && (
          <GlassCard className="mb-4">
            <h3 className="text-xs font-bold flex items-center gap-2 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Bônus Herdados
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Pontos de atributo extra</span>
                <span className="font-black text-primary">+{bonuses.extraAttributePoints}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Moedas iniciais</span>
                <span className="font-black text-yellow-400">+{bonuses.startingCoins}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">XP inicial</span>
                <span className="font-black text-cyan-400">+{bonuses.startingXp}</span>
              </div>
            </div>
          </GlassCard>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl glass text-muted-foreground font-semibold text-sm hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Check className="h-4 w-4" /> Iniciar
          </button>
        </div>
      </div>
    </div>
  );
}