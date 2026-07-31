import React from 'react';
import { Briefcase, GraduationCap, HeartPulse, UserCheck, Wrench, Plus, Check } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { CLUB_STAFF_TYPES } from '@/lib/clubs';

const ICON_MAP = { Briefcase, GraduationCap, HeartPulse, UserCheck, Wrench };

export default function ClubStaffPanel({ staff, isOwner, onHire, onFire, busy }) {
  const hiredTypes = (staff || []).map(s => s.staff_type);

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Briefcase className="h-4 w-4 text-primary" /> Funcionários do Clube</h2>
        {(!staff || staff.length === 0) ? (
          <EmptyStateCard icon={Briefcase} message="Nenhum funcionário contratado." />
        ) : (
          <div className="space-y-2">
            {staff.map((s, i) => {
              const Icon = ICON_MAP[CLUB_STAFF_TYPES.find(t => t.id === s.staff_type)?.icon] || Briefcase;
              return (
                <div key={s.id || i} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{s.staff_name}</p>
                    <p className="text-[10px] text-muted-foreground">{s.bonus_description}</p>
                  </div>
                  <span className="text-[10px] text-red-400 font-bold">{(s.monthly_cost || 0).toLocaleString('pt-BR')}/mês</span>
                  {isOwner && (
                    <button onClick={() => onFire(s)} disabled={busy === 'fire'} className="text-[10px] text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded-lg hover:bg-red-500/10">
                      Demitir
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {isOwner && (
        <GlassCard>
          <h2 className="font-bold text-sm flex items-center gap-2 mb-3"><Plus className="h-4 w-4 text-primary" /> Contratar</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {CLUB_STAFF_TYPES.map((st, i) => {
              const Icon = ICON_MAP[st.icon] || Briefcase;
              const isHired = hiredTypes.includes(st.id);
              return (
                <div key={i} className={`rounded-xl border p-3 ${isHired ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-secondary/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-lg bg-secondary/40 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-bold">{st.name}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">{st.bonus}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-red-400 font-bold">{st.monthly_cost.toLocaleString('pt-BR')}/mês</span>
                    {isHired ? (
                      <span className="text-[10px] font-bold text-primary flex items-center gap-1"><Check className="h-3 w-3" /> Ativo</span>
                    ) : (
                      <button onClick={() => onHire(st)} disabled={busy === 'hire'} className="py-1.5 px-3 rounded-lg bg-primary/15 text-primary font-semibold text-[10px] hover:bg-primary/25 disabled:opacity-40">
                        Contratar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}