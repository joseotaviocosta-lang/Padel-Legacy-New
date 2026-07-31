import React from 'react';
import { Newspaper, Crown, Calendar, TrendingUp } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { generateTournamentNews } from '@/lib/tournaments';

const ICON_MAP = { Crown, Calendar, TrendingUp, Newspaper };

export default function TournamentNews({ tournaments, profile }) {
  const news = generateTournamentNews(tournaments, profile);

  return (
    <GlassCard>
      <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
        <Newspaper className="h-4 w-4 text-cyan-400" /> Notícias do Circuito
      </h2>
      {news.length === 0 ? (
        <EmptyStateCard icon={Newspaper} message="Nenhuma notícia disponível." />
      ) : (
        <div className="space-y-2">
          {news.map((n, i) => {
            const Icon = ICON_MAP[n.icon] || Newspaper;
            return (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-secondary/30 p-3">
                <div className="h-8 w-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
                  <Icon className={`h-4 w-4 ${n.accent || 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{n.title}</p>
                  <p className="text-[10px] text-muted-foreground">{n.description}</p>
                </div>
                {n.date && (
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {(() => { try { return new Date(n.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); } catch { return n.date; } })()}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}