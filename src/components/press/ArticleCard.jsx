import React from 'react';
import { Newspaper, Mic, Flame, TrendingUp, Eye, AlertCircle, ThumbsUp, Sparkles } from 'lucide-react';
import { toneEmoji } from '@/lib/pressData';

const TYPE_ICONS = {
  entrevista: Mic,
  coletiva: Mic,
  manchete: Newspaper,
  rumor: Flame,
  critica: AlertCircle,
  elogio: ThumbsUp,
  previsao: TrendingUp,
  especulacao: Sparkles,
  repercussao: Eye,
};

const TYPE_LABELS = {
  entrevista: 'Entrevista',
  coletiva: 'Coletiva',
  manchete: 'Manchete',
  rumor: 'Rumor',
  critica: 'Crítica',
  elogio: 'Elogio',
  previsao: 'Previsão',
  especulacao: 'Especulação',
  repercussao: 'Repercussão',
};

const TONE_COLORS = {
  positivo: 'border-green-500/30 bg-green-500/5',
  neutro: 'border-border/40',
  negativo: 'border-red-500/30 bg-red-500/5',
  controverso: 'border-purple-500/30 bg-purple-500/5',
};

export default function ArticleCard({ article, onClick }) {
  const Icon = TYPE_ICONS[article.article_type] || Newspaper;
  const toneClass = TONE_COLORS[article.tone] || TONE_COLORS.neutro;

  return (
    <div
      onClick={onClick}
      className={`glass rounded-2xl p-4 border ${toneClass} hover-lift cursor-pointer ${article.is_read ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3 mb-2">
        <div className="h-9 w-9 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{TYPE_LABELS[article.article_type] || 'Notícia'}</span>
            <span className="text-base">{toneEmoji(article.tone)}</span>
            {!article.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
          </div>
          <p className="font-bold text-sm leading-tight line-clamp-2">{article.title}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-2">{article.content}</p>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground/70">{article.journalist_name}</span>
        <span>·</span>
        <span>{article.outlet}</span>
        {article.reputation_change !== 0 && (
          <>
            <span>·</span>
            <span className={`font-bold ${article.reputation_change > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {article.reputation_change > 0 ? '+' : ''}{article.reputation_change} rep
            </span>
          </>
        )}
      </div>
    </div>
  );
}