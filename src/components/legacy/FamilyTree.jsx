import React from 'react';
import { Crown, GraduationCap, TreePine, ChevronDown } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';

export default function FamilyTree({ legacies, currentGeneration }) {
  const sorted = [...(legacies || [])].sort((a, b) => (a.generation || 1) - (b.generation || 1));

  return (
    <GlassCard>
      <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
        <TreePine className="h-4 w-4 text-primary" /> Árvore Genealógica
      </h2>
      {sorted.length === 0 ? (
        <EmptyStateCard icon={TreePine} message="Sua árvore genealógica começa com você. Aposente-se e inicie uma nova carreira para expandi-la." />
      ) : (
        <div className="relative">
          {sorted.map((legacy, i) => {
            const isLast = i === sorted.length - 1;
            const isCurrent = legacy.generation === currentGeneration;
            return (
              <div key={legacy.id || i} className="relative flex gap-3 pb-4 last:pb-0">
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-border" />
                )}
                {/* Node */}
                <div className={`relative z-10 h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${legacy.is_coach ? 'bg-primary/15' : 'bg-amber-500/15'}`}>
                  {legacy.is_coach ? <GraduationCap className="h-5 w-5 text-primary" /> : <Crown className="h-5 w-5 text-amber-400" />}
                </div>
                {/* Content */}
                <div className={`flex-1 glass rounded-xl p-3 ${isCurrent ? 'border-primary/40 ring-1 ring-primary/20' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold truncate">{legacy.sport_name}</span>
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground">Gen {legacy.generation || 1}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {legacy.is_coach ? `Treinou ${legacy.coached_athlete_name || '—'}` : 'Atleta'}
                        {' · '}{legacy.tournaments_won || 0} títulos · {legacy.wins || 0} vitórias
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-black text-amber-400 tabular-nums">{legacy.legacy_score?.toLocaleString('pt-BR')}</p>
                      <p className="text-[8px] text-muted-foreground uppercase">Legado</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Current generation indicator */}
          <div className="flex gap-3 items-center pt-2 border-t border-border/40">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Crown className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-primary">Geração Atual (Gen {currentGeneration || 1})</span>
              <p className="text-[10px] text-muted-foreground">Carreira em andamento...</p>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}