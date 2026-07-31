import React, { useEffect, useState } from 'react';
import { Crown, Trophy, Flame, Star, Building2 } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { getHallOfFame } from '@/lib/legacy';

const RANK_STYLES = [
  { badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', label: 'Lenda' },
  { badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40', label: 'Ícone' },
  { badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40', label: 'Grande' },
];

export default function HallOfFame() {
  const [legends, setLegends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHallOfFame(12).then(data => {
      setLegends(data || []);
      setLoading(false);
    });
  }, []);

  return (
    <GlassCard>
      <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
        <Building2 className="h-4 w-4 text-amber-400" /> Hall da Fama
      </h2>
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : legends.length === 0 ? (
        <EmptyStateCard icon={Crown} message="Nenhuma lenda no Hall da Fama ainda. Seja o primeiro!" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {legends.map((legend, i) => {
            const rank = RANK_STYLES[i] || { badge: 'bg-secondary/40 text-muted-foreground border-border/40', label: 'Veterano' };
            return (
              <div key={legend.id || i} className={`rounded-xl border p-3 flex flex-col items-center gap-1.5 text-center ${rank.badge}`}>
                <div className="flex items-center gap-1">
                  {i < 3 && <Star className="h-3 w-3" />}
                  <span className="text-[9px] font-bold uppercase tracking-wide">{rank.label}</span>
                </div>
                <div className="h-9 w-9 rounded-full bg-background/40 flex items-center justify-center">
                  <span className="font-black text-sm">{(legend.sport_name || '?')[0]?.toUpperCase()}</span>
                </div>
                <span className="text-[10px] font-bold leading-tight truncate w-full">{legend.sport_name}</span>
                <div className="flex items-center gap-2 text-[9px]">
                  <span className="flex items-center gap-0.5"><Trophy className="h-2.5 w-2.5" />{legend.tournaments_won || 0}</span>
                  <span className="flex items-center gap-0.5"><Flame className="h-2.5 w-2.5" />{legend.legacy_score?.toLocaleString('pt-BR')}</span>
                </div>
                <span className="text-[8px] text-muted-foreground">Gen {legend.generation || 1}</span>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}