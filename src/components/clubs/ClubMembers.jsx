import React from 'react';
import { Users, Crown, UserPlus, UserMinus } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';

const ROLE_STYLES = {
  presidente: 'bg-amber-500/15 text-amber-300',
  diretor: 'bg-purple-500/15 text-purple-300',
  treinador: 'bg-cyan-500/15 text-cyan-300',
  membro: 'bg-secondary/40 text-muted-foreground',
};

export default function ClubMembers({ members, isMember, isOwner, onJoin, onLeave, busy }) {
  const sorted = [...(members || [])].sort((a, b) => (b.ranking_points || 0) - (a.ranking_points || 0));

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Ranking Interno</h2>
          {!isMember ? (
            <button
              onClick={onJoin}
              disabled={busy === 'join'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 disabled:opacity-40"
            >
              <UserPlus className="h-3.5 w-3.5" /> Associar-se
            </button>
          ) : (
            <button
              onClick={onLeave}
              disabled={busy === 'leave' || isOwner}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 text-red-400 font-semibold text-xs hover:bg-red-500/25 disabled:opacity-40"
              title={isOwner ? 'Presidentes não podem sair' : ''}
            >
              <UserMinus className="h-3.5 w-3.5" /> Sair
            </button>
          )}
        </div>
        {sorted.length === 0 ? (
          <EmptyStateCard icon={Users} message="Nenhum associado ainda." />
        ) : (
          <div className="space-y-1.5">
            {sorted.map((m, i) => (
              <div key={m.id || i} className="flex items-center gap-3 rounded-xl bg-secondary/30 p-2.5">
                <div className="text-center w-7 shrink-0">
                  {i < 3 ? (
                    <Crown className={`h-4 w-4 mx-auto ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : 'text-orange-400'}`} />
                  ) : null}
                  <span className="text-[10px] font-black text-muted-foreground tabular-nums">{i + 1}º</span>
                </div>
                <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-black text-primary">{(m.member_name || '?')[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold truncate">{m.member_name}</p>
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${ROLE_STYLES[m.role] || ROLE_STYLES.membro}`}>{m.role}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black text-primary tabular-nums">{m.ranking_points || 0}</p>
                  <p className="text-[8px] text-muted-foreground uppercase">pts</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}