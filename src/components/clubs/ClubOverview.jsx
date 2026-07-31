import React from 'react';
import { Building2, Star, Users, Coins, TrendingUp, Dumbbell, Waves, UtensilsCrossed, ShoppingBag, Sparkles, Plus } from 'lucide-react';
import { GlassCard } from '@/components/padel/ui';
import { FACILITIES } from '@/lib/clubs';

const FACILITY_ICONS = { Building2, Dumbbell, Waves, UtensilsCrossed, ShoppingBag, Sparkles };

export default function ClubOverview({ club, profile, isOwner, onAddCourt, onBuildFacility, busy }) {
  const repColor = club.reputation >= 70 ? 'text-green-400' : club.reputation >= 40 ? 'text-amber-400' : 'text-red-400';
  const repBar = club.reputation >= 70 ? 'from-green-500/70 to-green-500' : club.reputation >= 40 ? 'from-amber-500/70 to-amber-500' : 'from-red-500/70 to-red-500';
  const courtCost = 25000 + (club.court_count || 2) * 10000;

  const stats = [
    { icon: Users, label: 'Associados', value: club.member_count || 0, color: 'text-primary' },
    { icon: Building2, label: 'Quadras', value: club.court_count || 0, color: 'text-cyan-400' },
    { icon: Coins, label: 'Mensalidade', value: (club.monthly_fee || 0).toLocaleString('pt-BR'), color: 'text-yellow-400' },
    { icon: TrendingUp, label: 'Nível', value: club.level || 1, color: 'text-purple-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Reputation + Stats */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm flex items-center gap-2"><Star className="h-4 w-4 text-amber-400" /> Reputação</h2>
          <span className={`text-2xl font-black tabular-nums ${repColor}`}>{club.reputation || 50}</span>
        </div>
        <div className="h-2.5 rounded-full bg-secondary overflow-hidden mb-4">
          <div className={`h-full rounded-full bg-gradient-to-r ${repBar} transition-all duration-500`} style={{ width: `${club.reputation || 50}%` }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="text-center rounded-xl bg-secondary/30 p-2.5">
                <Icon className={`h-4 w-4 mx-auto mb-1 ${s.color}`} />
                <p className="text-sm font-black tabular-nums">{s.value}</p>
                <p className="text-[9px] text-muted-foreground uppercase">{s.label}</p>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Courts */}
      {isOwner && (
        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Building2 className="h-4 w-4 text-cyan-400" /> Quadras</h2>
          <div className="flex items-center justify-between rounded-xl bg-secondary/30 p-3">
            <div>
              <p className="text-sm font-bold">{club.court_count || 0} quadra(s)</p>
              <p className="text-[10px] text-muted-foreground">Cada quadra permite mais eventos simultâneos</p>
            </div>
            <button
              onClick={onAddCourt}
              disabled={busy === 'court' || (profile?.coins || 0) < courtCost}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/15 text-cyan-400 font-semibold text-xs hover:bg-cyan-500/25 transition-colors disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> {courtCost.toLocaleString('pt-BR')}
            </button>
          </div>
        </GlassCard>
      )}

      {/* Facilities */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-primary" /> Estrutura</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {FACILITIES.map((f, i) => {
            const Icon = FACILITY_ICONS[f.icon] || Building2;
            const owned = (club.facilities || []).includes(f.id);
            return (
              <div key={i} className={`rounded-xl border p-3 ${owned ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-secondary/20'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-8 w-8 rounded-lg bg-secondary/40 flex items-center justify-center">
                    <Icon className={`h-4 w-4 ${owned ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <span className="text-sm font-bold">{f.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">{f.description}</p>
                {owned ? (
                  <span className="text-[10px] font-bold text-primary">✓ Construído</span>
                ) : isOwner ? (
                  <button
                    onClick={() => onBuildFacility(f)}
                    disabled={busy === 'facility' || (profile?.coins || 0) < f.cost}
                    className="w-full py-1.5 rounded-lg bg-primary/15 text-primary font-semibold text-[10px] hover:bg-primary/25 transition-colors disabled:opacity-40"
                  >
                    Construir · {f.cost.toLocaleString('pt-BR')}
                  </button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Não disponível</span>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}