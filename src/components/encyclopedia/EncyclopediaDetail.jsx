import React, { useMemo } from 'react';
import { X, Clock, Globe, Calendar, Tag, Link2 } from 'lucide-react';
import { ENCYCLOPEDIA_CATEGORIES } from '@/lib/encyclopediaData';

export default function EncyclopediaDetail({ entry, onRelated, onClose }) {
  const cat = ENCYCLOPEDIA_CATEGORIES[entry.category] || ENCYCLOPEDIA_CATEGORIES.historia;

  const metadataEntries = useMemo(() => {
    if (!entry.metadata) return [];
    return Object.entries(entry.metadata).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]);
  }, [entry.metadata]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-0 md:p-4" onClick={onClose}>
      <div
        className="bg-card w-full md:max-w-2xl max-h-[90vh] md:max-h-[85vh] rounded-t-3xl md:rounded-3xl border border-border overflow-hidden flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`relative p-5 ${cat.bg} border-b border-border/40`}>
          <button onClick={onClose} className="absolute top-4 right-4 h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>{cat.label}</span>
            {entry.is_featured && <span className="text-[10px] font-bold text-amber-400">★ Destaque</span>}
            {entry.source === 'universo_legacy' && <span className="text-[10px] font-bold text-purple-400">🎮 Legacy</span>}
          </div>
          <h2 className="text-xl font-black leading-tight pr-8">{entry.name}</h2>
          {entry.subcategory && <p className="text-xs text-muted-foreground capitalize mt-0.5">{entry.subcategory}</p>}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-premium p-5 space-y-4">
          {entry.summary && (
            <div className="glass rounded-xl p-3 border-l-2 border-primary/40">
              <p className="text-sm font-semibold text-primary">{entry.summary}</p>
            </div>
          )}

          <div>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{entry.content}</p>
          </div>

          {/* Metadata */}
          {metadataEntries.length > 0 && (
            <div className="glass rounded-xl p-3 space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Dados</h4>
              {metadataEntries.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}:</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Info badges */}
          <div className="flex flex-wrap gap-2">
            {entry.country && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-secondary/50">
                <Globe className="h-3 w-3 text-primary" /> {entry.country}
              </span>
            )}
            {entry.year && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-secondary/50">
                <Calendar className="h-3 w-3 text-cyan-400" /> {entry.year}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-secondary/50">
              <Clock className="h-3 w-3 text-amber-400" /> {entry.reading_time_min || 2} min de leitura
            </span>
          </div>

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                    <Tag className="h-2.5 w-2.5" /> {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Related entries */}
          {entry.related_entries && entry.related_entries.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Ver também
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {entry.related_entries.map(rel => (
                  <button
                    key={rel}
                    onClick={() => onRelated(rel)}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-secondary/50 text-cyan-400 hover:bg-secondary/80 transition-colors"
                  >
                    {rel} →
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}