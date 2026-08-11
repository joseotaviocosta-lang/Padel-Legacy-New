import React from 'react';
import { Trophy, Calendar, Award, Video, Play, TrendingUp } from 'lucide-react';
import { HOF_CATEGORY_CONFIG } from '@/lib/hallOfFameData';
import { ModalShell } from '@/components/design-system';

export default function HallOfFameDetail({ entry, onClose }) {
  if (!entry) return null;
  const cat = HOF_CATEGORY_CONFIG[entry.category] || HOF_CATEGORY_CONFIG.lendario;
  const stats = entry.career_stats || {};
  const compStats = entry.comparison_stats || {};

  return (
    <ModalShell open onClose={onClose} size="md">
      <div className="-m-4 sm:-m-5">
        {/* Hero header */}
        <div className="relative p-5 md:p-6 border-b border-border/40">
          <div className={`absolute -top-10 -right-10 h-40 w-40 ${cat.bg} rounded-full blur-3xl opacity-40`} />
          <div className="relative flex items-start gap-4">
            <div className={`h-16 w-16 rounded-2xl ${cat.bg} flex items-center justify-center shrink-0 border ${cat.border}`}>
              <Trophy className={`h-8 w-8 ${cat.color}`} />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${cat.bg} ${cat.color} border ${cat.border}`}>{cat.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{entry.entity_type}</span>
              </div>
              <h2 className="text-xl font-black leading-tight">{entry.name}</h2>
              <p className="text-xs text-muted-foreground">{entry.nationality} · Induzido em {entry.induction_year}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-3xl font-black tabular-nums ${cat.color}`}>{entry.rating}</p>
              <p className="text-[9px] text-muted-foreground uppercase">Rating Histórico</p>
            </div>
          </div>
        </div>

        <div className="p-5 md:p-6 space-y-5">
          {/* Bio */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Biografia</h3>
            <p className="text-sm text-foreground/90 leading-relaxed">{entry.bio}</p>
          </div>

          {/* Stats */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Estatísticas</h3>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries(stats).slice(0, 8).map(([key, val]) => (
                <div key={key} className="glass rounded-xl p-2.5 text-center">
                  <p className="text-base font-black tabular-nums text-primary">{typeof val === 'number' ? val.toLocaleString('pt-BR') : val}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{key.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trophies */}
          {entry.trophies && entry.trophies.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" /> Troféus Conquistados</h3>
              <div className="space-y-2">
                {entry.trophies.map((t, i) => (
                  <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Trophy className="h-4 w-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">{t.description}</p>
                    </div>
                    <span className="text-xs font-black text-amber-400 tabular-nums">{t.year}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Career Timeline */}
          {entry.career_timeline && entry.career_timeline.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Linha do Tempo da Carreira</h3>
              <div className="relative pl-5 space-y-3">
                <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border/40" />
                {entry.career_timeline.map((t, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-5 top-1.5 h-3 w-3 rounded-full bg-primary/40 border-2 border-background ring-2 ring-primary/20" />
                    <div className="glass rounded-xl p-2.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-black text-primary tabular-nums">{t.year}</span>
                        <span className="text-xs font-bold">{t.event}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Records */}
          {entry.career_records && entry.career_records.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Award className="h-3.5 w-3.5" /> Recordes</h3>
              <div className="space-y-1.5">
                {entry.career_records.map((r, i) => (
                  <div key={i} className="flex items-center justify-between glass rounded-lg p-2.5">
                    <span className="text-xs font-medium">{r.record}</span>
                    <span className="text-xs font-black text-primary tabular-nums">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Videos */}
          {entry.videos && entry.videos.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Vídeos</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {entry.videos.map((v, i) => (
                  <div key={i} className="glass rounded-xl overflow-hidden group cursor-pointer">
                    <div className="relative h-28 bg-secondary/40 overflow-hidden">
                      <img src={v.thumbnail_url} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="h-10 w-10 rounded-full bg-primary/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Play className="h-5 w-5 text-primary-foreground ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                      <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold bg-black/70 px-1.5 py-0.5 rounded">{v.duration}</span>
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-bold leading-tight mb-0.5">{v.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{v.description}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">{Number(v.views).toLocaleString('pt-BR')} visualizações</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Highlights */}
          {entry.highlights && entry.highlights.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Destaques</h3>
              <div className="space-y-1.5">
                {entry.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-primary mt-0.5">◆</span>
                    <span className="text-foreground/80">{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}