import React from 'react';
import { Calendar, Building2, Crown, Trophy, Award, Swords, FileText, Star, Cpu, Sparkles } from 'lucide-react';
import { IMPORTANCE_CONFIG } from '@/lib/historyData';

const CATEGORY_ICONS = { fundacao: Sparkles, decada: Calendar, campeao: Crown, clube_lendario: Building2, torneio_historico: Trophy, recorde: Award, rivalidade: Swords, regra: FileText, momento: Star, tecnologia: Cpu };

const ACCENT_BG = { primary: 'bg-primary/15', amber: 'bg-amber-500/15', cyan: 'bg-cyan-500/15', purple: 'bg-purple-500/15', green: 'bg-green-500/15', rose: 'bg-rose-500/15' };
const ACCENT_TEXT = { primary: 'text-primary', amber: 'text-amber-400', cyan: 'text-cyan-400', purple: 'text-purple-400', green: 'text-green-400', rose: 'text-rose-400' };

export default function HistoryEntryCard({ entry, onClick }) {
  const Icon = CATEGORY_ICONS[entry.category] || Star;
  const accentColor = entry.importance === 'lendario' ? 'amber' : entry.importance === 'epico' ? 'purple' : entry.importance === 'destaque' ? 'cyan' : 'primary';
  const imp = IMPORTANCE_CONFIG[entry.importance] || IMPORTANCE_CONFIG.normal;

  return (
    <button
      onClick={onClick}
      className="glass glass-hover rounded-2xl p-4 text-left w-full hover-lift"
    >
      <div className="flex items-start gap-3 mb-2">
        <div className={`h-10 w-10 rounded-xl ${ACCENT_BG[accentColor] || ACCENT_BG.primary} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${ACCENT_TEXT[accentColor] || ACCENT_TEXT.primary}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black text-primary tabular-nums">{entry.year}</span>
            <span className={`text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full ${imp.bg} ${imp.color} border ${imp.border}`}>{imp.label}</span>
          </div>
          <h3 className="font-bold text-sm leading-tight mb-1">{entry.title}</h3>
        </div>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{entry.description}</p>
      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {entry.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md bg-secondary/60 text-muted-foreground">#{tag}</span>
          ))}
        </div>
      )}
    </button>
  );
}