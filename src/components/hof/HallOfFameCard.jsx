import React from 'react';
import { Crown, Building2, Handshake, Star, Trophy } from 'lucide-react';
import { HOF_CATEGORY_CONFIG } from '@/lib/hallOfFameData';

const TYPE_ICONS = { atleta: Crown, treinador: Star, dupla: Handshake, clube: Building2 };
const TYPE_COLORS = { atleta: 'amber', treinador: 'primary', dupla: 'cyan', clube: 'green' };
const ACCENT_BG = { primary: 'bg-primary/15', amber: 'bg-amber-500/15', cyan: 'bg-cyan-500/15', green: 'bg-green-500/15' };
const ACCENT_TEXT = { primary: 'text-primary', amber: 'text-amber-400', cyan: 'text-cyan-400', green: 'text-green-400' };

export default function HallOfFameCard({ entry, onClick }) {
  const Icon = TYPE_ICONS[entry.entity_type] || Star;
  const typeColor = TYPE_COLORS[entry.entity_type] || 'primary';
  const cat = HOF_CATEGORY_CONFIG[entry.category] || HOF_CATEGORY_CONFIG.lendario;
  const stats = entry.comparison_stats || {};
  const isDupla = entry.entity_type === 'dupla';

  return (
    <button
      onClick={onClick}
      className="glass glass-hover rounded-2xl p-4 text-left w-full hover-lift relative overflow-hidden"
    >
      <div className={`absolute -top-8 -right-8 h-24 w-24 ${ACCENT_BG[typeColor]} rounded-full blur-2xl opacity-50`} />
      <div className="relative flex items-start gap-3 mb-3">
        <div className={`h-12 w-12 rounded-2xl ${ACCENT_BG[typeColor]} flex items-center justify-center shrink-0`}>
          <Icon className={`h-6 w-6 ${ACCENT_TEXT[typeColor]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full ${cat.bg} ${cat.color} border ${cat.border}`}>{cat.label}</span>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{entry.entity_type}</span>
          </div>
          <h3 className="font-black text-sm leading-tight truncate">{entry.name}</h3>
          <p className="text-[10px] text-muted-foreground">{entry.nationality} · Indução {entry.induction_year}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-lg font-black tabular-nums ${ACCENT_TEXT[typeColor]}`}>{entry.rating}</p>
          <p className="text-[8px] text-muted-foreground uppercase">Rating</p>
        </div>
      </div>
      <div className="relative grid grid-cols-3 gap-2">
        <StatPill label={isDupla ? 'Títulos' : 'Títulos'} value={stats.titles || 0} />
        <StatPill label={isDupla ? 'Anos' : 'Vitórias%'} value={isDupla ? stats.yearsPro : `${stats.winRate || 0}%`} />
        <StatPill label={isDupla ? 'Majors' : 'Majors'} value={stats.majors || 0} />
      </div>
    </button>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="bg-secondary/40 rounded-lg p-1.5 text-center">
      <p className="text-sm font-black tabular-nums text-foreground">{value}</p>
      <p className="text-[8px] text-muted-foreground uppercase tracking-wide">{label}</p>
    </div>
  );
}