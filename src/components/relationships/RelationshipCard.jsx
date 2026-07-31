import React from 'react';
import { Skull, Swords, Minus, Handshake, Heart, Users, GraduationCap } from 'lucide-react';
import { getRelTypeMeta } from '@/lib/relationships';

const TYPE_ICONS = { inimigo: Skull, rival: Swords, neutro: Minus, respeito: Handshake, amigo: Heart, parceiro: Users, mentor: GraduationCap };

export default function RelationshipCard({ relationship, onClick }) {
  if (!relationship) return null;
  const meta = getRelTypeMeta(relationship.relationship_type);
  const Icon = TYPE_ICONS[relationship.relationship_type] || Minus;
  const score = relationship.score || 0;
  const scorePct = ((score + 100) / 200) * 100;
  const scoreColor = score >= 40 ? 'text-green-400' : score >= 20 ? 'text-cyan-400' : score >= -19 ? 'text-slate-400' : score >= -49 ? 'text-orange-400' : 'text-red-400';

  return (
    <button onClick={onClick} className="glass glass-hover rounded-2xl p-3 text-left w-full hover-lift">
      <div className="flex items-center gap-3 mb-2">
        <div className={`h-10 w-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0 border ${meta.border}`}>
          <Icon className={`h-5 w-5 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{relationship.target_name}</p>
          <p className="text-[10px] text-muted-foreground">{relationship.target_country || '—'} · {meta.label}</p>
        </div>
        <span className={`text-sm font-black tabular-nums ${scoreColor}`}>{score > 0 ? '+' : ''}{score}</span>
      </div>
      <div className="flex items-center gap-1 mb-1.5">
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${score >= 0 ? 'bg-green-400' : 'bg-red-400'}`}
            style={{ width: `${scorePct}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        <span>{relationship.shared_matches || 0} partidas</span>
        {relationship.shared_wins > 0 && <span className="text-green-400">{relationship.shared_wins} vitórias</span>}
        {relationship.shared_losses > 0 && <span className="text-red-400">{relationship.shared_losses} derrotas</span>}
        {relationship.chemistry > 0 && <span className="text-primary">{relationship.chemistry} química</span>}
      </div>
    </button>
  );
}