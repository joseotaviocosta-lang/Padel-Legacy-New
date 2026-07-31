import React from 'react';
import { X, Crown, Trophy, AlertTriangle, Flame } from 'lucide-react';
import { calculateAge, RETIREMENT_AGE, overallRating, levelForXp } from '@/lib/padel';

export default function RetirementModal({ profile, legacyScore, onConfirm, onClose }) {
  const age = calculateAge(profile);
  const earlyRetirement = age < RETIREMENT_AGE;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div className="glass rounded-t-3xl md:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-400" /> Encerrar Carreira
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {earlyRetirement && (
          <div className="glass rounded-xl p-3 border border-amber-500/30 bg-amber-500/5 flex items-start gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">Aposentadoria antecipada aos {age} anos. Seu legado será menor do que se jogasse até os {RETIREMENT_AGE}.</p>
          </div>
        )}

        <div className="glass rounded-2xl p-4 space-y-3 mb-4">
          <div className="text-center">
            <div className="h-16 w-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mx-auto mb-2">
              <Flame className="h-8 w-8 text-amber-400" />
            </div>
            <p className="text-3xl font-black text-amber-400 tabular-nums">{legacyScore.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pontuação de Legado</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-border/40">
            <div><p className="text-lg font-black">{profile.matches_played || 0}</p><p className="text-[9px] text-muted-foreground uppercase">Partidas</p></div>
            <div><p className="text-lg font-black text-amber-400">{profile.wins || 0}</p><p className="text-[9px] text-muted-foreground uppercase">Vitórias</p></div>
            <div><p className="text-lg font-black text-primary">{profile.tournaments_won || 0}</p><p className="text-[9px] text-muted-foreground uppercase">Títulos</p></div>
          </div>
          <div className="flex justify-between text-xs pt-2 border-t border-border/40">
            <span className="text-muted-foreground">Nível final</span>
            <span className="font-bold">{levelForXp(profile.xp || 0)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Overall final</span>
            <span className="font-bold">{overallRating(profile)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-4 text-center">
          Ao encerrar, seu legado será registrado permanentemente. Você poderá iniciar uma nova carreira como treinador de um atleta da próxima geração.
        </p>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl glass text-muted-foreground font-semibold text-sm hover:text-foreground transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm hover:opacity-90 transition-opacity">
            Confirmar Aposentadoria
          </button>
        </div>
      </div>
    </div>
  );
}