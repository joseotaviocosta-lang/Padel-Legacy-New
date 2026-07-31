import React, { useMemo } from 'react';
import { Users, Check, Calculator, Briefcase, HeartPulse, Apple, Brain, Wallet, Activity, Sparkles } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { STAFF_TYPES } from '@/lib/economy';

const ICON_MAP = { Calculator, Briefcase, HeartPulse, Apple, Brain };

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatCoins(value) {
  return safeNumber(value).toLocaleString('pt-BR');
}

export default function StaffPanel({ staff, onHire, onFire, busy }) {
  const validStaff = useMemo(() => (staff || []).filter(Boolean), [staff]);
  const hiredTypes = validStaff.map((member) => member.staff_type);
  const monthlyCost = validStaff.reduce((sum, member) => sum + Math.max(0, safeNumber(member.monthly_cost)), 0);

  const activeBonuses = STAFF_TYPES.filter((type) => hiredTypes.includes(type.id));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4 border border-border/40">
          <Users className="h-4 w-4 text-primary mb-2" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Profissionais</p>
          <p className="text-xl font-black">{validStaff.length}/5</p>
        </div>
        <div className="glass rounded-2xl p-4 border border-border/40">
          <Wallet className="h-4 w-4 text-amber-400 mb-2" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Folha mensal</p>
          <p className="text-xl font-black">{formatCoins(monthlyCost)}</p>
        </div>
        <div className="glass rounded-2xl p-4 border border-border/40">
          <Activity className="h-4 w-4 text-emerald-400 mb-2" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bônus ativos</p>
          <p className="text-xl font-black">{activeBonuses.length}</p>
        </div>
      </div>

      {activeBonuses.length > 0 && (
        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" /> Impacto na carreira
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeBonuses.map((bonus) => {
              const Icon = ICON_MAP[bonus.icon] || Users;
              return (
                <div key={bonus.id} className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex gap-3">
                  <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold">{bonus.name}</p>
                    <p className="text-[10px] text-muted-foreground">{bonus.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Check className="h-4 w-4 text-green-400" /> Equipe contratada
        </h2>
        {validStaff.length === 0 ? (
          <EmptyStateCard icon={Users} message="Nenhum profissional contratado ainda." />
        ) : (
          <div className="space-y-2">
            {validStaff.map((member, index) => {
              const catalog = STAFF_TYPES.find((type) => type.id === member.staff_type);
              const Icon = ICON_MAP[catalog?.icon] || Users;
              return (
                <div key={member.id || `${member.staff_type}-${index}`} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{member.staff_name || catalog?.name || 'Profissional'}</p>
                    <p className="text-[10px] text-muted-foreground">{formatCoins(member.monthly_cost || catalog?.monthly_cost)}/mês</p>
                    <p className="text-[10px] text-primary mt-0.5">{catalog?.description || 'Bônus ativo na carreira'}</p>
                  </div>
                  <button
                    onClick={() => onFire(member)}
                    disabled={busy === 'fire'}
                    className="text-[10px] text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    Demitir
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" /> Mercado de profissionais
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {STAFF_TYPES.map((type) => {
            const Icon = ICON_MAP[type.icon] || Users;
            const isHired = hiredTypes.includes(type.id);
            return (
              <div key={type.id} className={`rounded-xl border p-3 ${isHired ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-secondary/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-8 w-8 rounded-lg bg-secondary/40 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-bold">{type.name}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-3 min-h-[28px]">{type.description}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-amber-400 font-bold">{formatCoins(type.monthly_cost)}/mês</span>
                  {isHired ? (
                    <span className="text-[10px] font-bold text-primary flex items-center gap-1"><Check className="h-3 w-3" /> Contratado</span>
                  ) : (
                    <button
                      onClick={() => onHire(type)}
                      disabled={busy === 'hire'}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
                    >
                      Contratar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
