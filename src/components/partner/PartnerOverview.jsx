import React from 'react';
import { Heart, TrendingUp, Trophy, Coins, Swords, Calendar, AlertTriangle } from 'lucide-react';
import { compatibilityLabel } from '@/lib/partnershipSystem';
import { daysBetween } from '@/lib/career';
import { formatDate } from '@/lib/padel';

export default function PartnerOverview({ partnership, profile, onEnd, onNegotiate, onConverse }) {
  if (!partnership) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <Heart className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-bold text-sm mb-1">Sem parceiro ativo</p>
        <p className="text-xs text-muted-foreground">Busque atletas na aba "Buscar" ou aceite uma proposta na "Caixa de Entrada".</p>
      </div>
    );
  }

  const chem = partnership.chemistry || 50;
  const chemLabel = compatibilityLabel(chem);
  const daysLeft = partnership.scheduled_end_date
    ? daysBetween(profile?.career_date, partnership.scheduled_end_date)
    : 0;

  return (
    <div className="space-y-4">
      {/* Partner card */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0">
            <span className="font-black text-primary text-2xl">{(partnership.partner_name || '?')[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-lg">{partnership.partner_name}</h3>
            <p className="text-xs text-muted-foreground">{partnership.partner_country} · {partnership.partner_level} · OVR {partnership.partner_overall}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chemLabel.bg} ${chemLabel.color}`}>
                Entrosamento {chem}
              </span>
              <span className="text-[10px] text-muted-foreground">{partnership.partner_position}</span>
            </div>
          </div>
        </div>

        {/* Chemistry bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Entrosamento</span>
            <span className={`font-bold tabular-nums ${chemLabel.color}`}>{chem}/100</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-500" style={{ width: `${chem}%` }} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <Stat icon={Swords} label="Partidas" value={partnership.shared_matches || 0} />
          <Stat icon={TrendingUp} label="Vitórias" value={partnership.shared_wins || 0} color="text-green-400" />
          <Stat icon={Trophy} label="Títulos" value={partnership.shared_titles || 0} color="text-amber-400" />
          <Stat icon={Coins} label="Divisão" value={`${partnership.prize_split_pct}%`} color="text-cyan-400" />
        </div>
      </div>

      {/* Contract info */}
      <div className="glass rounded-2xl p-4 flex items-center gap-3">
        <Calendar className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold">Contrato de parceria</p>
          <p className="text-[10px] text-muted-foreground">
            Início: {formatDate(partnership.started_career_date)} · Duração: {partnership.negotiated_duration_days || 0} dias
            {daysLeft > 0 ? ` · Expira em ${daysLeft} dias` : ' · Expirado'}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={onConverse} className="py-2.5 rounded-xl glass text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex flex-col items-center gap-1">
          <Heart className="h-4 w-4 text-pink-400" /> Conversar
        </button>
        <button onClick={onNegotiate} className="py-2.5 rounded-xl glass text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex flex-col items-center gap-1">
          <Coins className="h-4 w-4 text-cyan-400" /> Negociar
        </button>
        <button onClick={onEnd} className="py-2.5 rounded-xl bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors flex flex-col items-center gap-1">
          <AlertTriangle className="h-4 w-4" /> Encerrar
        </button>
      </div>

      {/* Compatibility breakdown */}
      {partnership.compatibility_breakdown && (
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-3">Compatibilidade Inicial</p>
          <div className="space-y-2">
            {Object.entries(partnership.compatibility_breakdown).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-24 capitalize">{factorLabel(key)}</span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${val}%` }} />
                </div>
                <span className="text-[10px] font-bold tabular-nums w-8 text-right">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared goals */}
      {(partnership.shared_goals || []).length > 0 && (
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-3">Objetivos Compartilhados</p>
          <div className="space-y-2">
            {partnership.shared_goals.map(g => (
              <div key={g.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <p className={`text-xs ${g.completed ? 'text-primary font-bold' : 'text-foreground/90'}`}>{g.title}</p>
                  <div className="h-1 rounded-full bg-secondary overflow-hidden mt-1">
                    <div className={`h-full rounded-full ${g.completed ? 'bg-primary' : 'bg-primary/50'}`} style={{ width: `${Math.min(100, (g.progress / g.target) * 100)}%` }} />
                  </div>
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{g.progress}/{g.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent conflicts */}
      {(partnership.conflicts || []).filter(c => !c.resolved).length > 0 && (
        <div className="glass rounded-2xl p-4 border border-amber-500/30 bg-amber-500/5">
          <p className="text-[10px] uppercase tracking-wide text-amber-400 font-bold mb-2">Conflitos Pendentes</p>
          <div className="space-y-1.5">
            {partnership.conflicts.filter(c => !c.resolved).slice(0, 3).map((c, i) => (
              <div key={i} className="text-xs">
                <p className="font-semibold">{c.title}</p>
                <p className="text-[10px] text-muted-foreground">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="glass rounded-xl p-2.5 text-center">
      <Icon className={`h-4 w-4 mx-auto mb-1 ${color || 'text-primary'}`} />
      <p className="text-sm font-black tabular-nums">{value}</p>
      <p className="text-[8px] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}

function factorLabel(key) {
  const map = { position: 'Posição', style: 'Estilo', personality: 'Personalidade', level: 'Nível', schedule: 'Agenda', chemistry: 'Química', overall: 'Overall' };
  return map[key] || key;
}
