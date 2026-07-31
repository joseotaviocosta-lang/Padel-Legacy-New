import React from 'react';
import { TrendingUp, Flame, Hash } from 'lucide-react';
import { TRENDING_TOPICS } from '@/lib/socialNetwork';

export default function TrendPanel({ activeTrend, onTrendClick }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="font-bold text-sm">Em Alta</h2>
      </div>
      <div className="space-y-1.5">
        {TRENDING_TOPICS.slice(0, 8).map((trend, i) => {
          const isActive = activeTrend === trend.tag;
          return (
            <button
              key={trend.tag}
              onClick={() => onTrendClick(isActive ? null : trend.tag)}
              className={`w-full text-left flex items-center gap-2 p-2 rounded-xl transition-all ${
                isActive ? 'bg-primary/15 text-primary' : 'hover:bg-secondary/50'
              }`}
            >
              <span className="text-[10px] font-black text-muted-foreground/50 tabular-nums w-4">{i + 1}</span>
              {i < 2 ? <Flame className="h-3 w-3 text-amber-400 shrink-0" /> : <Hash className="h-3 w-3 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold truncate ${isActive ? 'text-primary' : ''}`}>{trend.tag}</p>
                <p className="text-[9px] text-muted-foreground">{trend.posts.toLocaleString('pt-BR')} posts · {trend.category}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}