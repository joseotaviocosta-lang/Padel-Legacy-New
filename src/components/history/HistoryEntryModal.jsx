import React from 'react';
import { X, Calendar, Building2, Crown, Trophy, Award, Swords, FileText, Star, Cpu, Sparkles, Link2 } from 'lucide-react';
import { IMPORTANCE_CONFIG, CATEGORY_CONFIG } from '@/lib/historyData';

const CATEGORY_ICONS = { fundacao: Sparkles, decada: Calendar, campeao: Crown, clube_lendario: Building2, torneio_historico: Trophy, recorde: Award, rivalidade: Swords, regra: FileText, momento: Star, tecnologia: Cpu };

export default function HistoryEntryModal({ entry, relatedEntries, onSelectRelated, onClose }) {
  if (!entry) return null;
  const Icon = CATEGORY_ICONS[entry.category] || Star;
  const imp = IMPORTANCE_CONFIG[entry.importance] || IMPORTANCE_CONFIG.normal;
  const cat = CATEGORY_CONFIG[entry.category] || { label: entry.category };

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg glass-premium rounded-t-3xl md:rounded-3xl p-5 md:p-6 max-h-[85vh] overflow-y-auto scrollbar-none animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 mb-4">
          <div className={`h-14 w-14 rounded-2xl ${imp.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`h-7 w-7 ${imp.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-black text-primary tabular-nums">{entry.year}</span>
              <span className={`text-[9px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ${imp.bg} ${imp.color} border ${imp.border}`}>{imp.label}</span>
            </div>
            <h2 className="text-lg font-black leading-tight">{entry.title}</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{cat.label} · Década de {entry.decade}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <p className="text-sm text-foreground/90 leading-relaxed mb-4">{entry.description}</p>

        {entry.tags && entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {entry.tags.map(tag => (
              <span key={tag} className="text-[10px] px-2 py-1 rounded-md bg-secondary/60 text-muted-foreground font-medium">#{tag}</span>
            ))}
          </div>
        )}

        {relatedEntries && relatedEntries.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2 flex items-center gap-1.5">
              <Link2 className="h-3 w-3" /> Entradas Relacionadas
            </p>
            <div className="space-y-1.5">
              {relatedEntries.map(rel => (
                <button
                  key={rel.title}
                  onClick={() => onSelectRelated(rel)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl glass hover:border-primary/40 transition-all text-left"
                >
                  <span className="text-xs font-black text-primary tabular-nums w-10 shrink-0">{rel.year}</span>
                  <span className="text-xs font-semibold truncate">{rel.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}