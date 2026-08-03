import React from 'react';
import { BookOpen } from 'lucide-react';
import { ENCYCLOPEDIA_CATEGORIES } from '@/lib/encyclopediaData';
import { Clock } from 'lucide-react';

export default function EncyclopediaCard({ entry, onClick }) {
  const cat = ENCYCLOPEDIA_CATEGORIES[entry.category] || ENCYCLOPEDIA_CATEGORIES.historia;

  return (
    <button
      onClick={() => onClick(entry)}
      className="glass rounded-2xl p-4 text-left hover:border-primary/40 hover:scale-[1.02] transition-all press-scale group w-full"
    >
      <div className="flex items-start gap-3 mb-2">
        <div className={`h-10 w-10 rounded-xl ${cat.bg} flex items-center justify-center shrink-0`}>
          <BookOpen className={`h-5 w-5 ${cat.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-[9px] font-bold uppercase tracking-wide ${cat.color}`}>{cat.label}</span>
          <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">{entry.name}</h3>
        </div>
        {entry.is_featured && (
          <span className="shrink-0 text-amber-400 text-xs">★</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{entry.summary}</p>
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        {entry.country && <span>🌍 {entry.country}</span>}
        {entry.year && <span>📅 {entry.year}</span>}
        <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{entry.reading_time_min || 2}min</span>
      </div>
    </button>
  );
}