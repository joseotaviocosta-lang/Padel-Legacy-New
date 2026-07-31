import React from 'react';
import { Activity, HeartPulse, ShieldCheck, CalendarDays } from 'lucide-react';

export default function MedicalStatusPanel({ profile }) {
  const days = Math.max(0, Number(profile?.injury_days_remaining) || 0);
  const injured = profile?.injury_status === 'lesionado' && days > 0;

  if (!injured) {
    return (
      <div className="glass rounded-2xl p-4 border border-emerald-500/20 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Condição médica: apto</p>
          <p className="text-xs text-muted-foreground">Sem restrições para treinar ou competir.</p>
        </div>
      </div>
    );
  }

  const severityLabel = { leve: 'Leve', moderada: 'Moderada', grave: 'Grave' }[profile.injury_severity] || 'Em avaliação';
  return (
    <div className="glass rounded-2xl p-4 border border-rose-500/30 bg-rose-500/5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
          <HeartPulse className="h-5 w-5 text-rose-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{profile.injury_type || 'Lesão em recuperação'}</p>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300">{severityLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Treinos intensos e partidas devem ser evitados durante a recuperação.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-background/40 p-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-rose-400" />
          <div><p className="text-muted-foreground">Recuperação</p><p className="font-semibold">{days} dia{days === 1 ? '' : 's'}</p></div>
        </div>
        <div className="rounded-xl bg-background/40 p-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-cyan-400" />
          <div><p className="text-muted-foreground">Retorno previsto</p><p className="font-semibold">{profile.injury_return_date || '—'}</p></div>
        </div>
      </div>
    </div>
  );
}
