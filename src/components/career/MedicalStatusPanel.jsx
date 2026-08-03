import React from 'react';
import { Activity, HeartPulse, ShieldCheck, CalendarDays, FastForward } from 'lucide-react';
import { formatDate } from '@/lib/padel';

export default function MedicalStatusPanel({ profile, onSkipRecovery, skipping, skipError, skipSummary }) {
  const legacyDays = profile?.injured_until && profile?.career_date
    ? Math.max(0, Math.ceil((new Date(`${profile.injured_until}T00:00:00`).getTime() - new Date(`${profile.career_date}T00:00:00`).getTime()) / 86400000))
    : 0;
  const days = Math.max(legacyDays, Number(profile?.injury_days_remaining) || 0);
  const injured = days > 0 && (profile?.injury_status === 'lesionado' || legacyDays > 0);

  if (!injured) {
    return (
      <div className="glass rounded-2xl p-4 border border-emerald-500/20 space-y-3">
        <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Condição médica: apto</p>
          <p className="text-xs text-muted-foreground">Sem restrições para treinar ou competir.</p>
        </div>
        </div>
        {skipSummary && <div className="rounded-xl bg-emerald-500/10 p-3 text-xs"><p className="font-bold text-emerald-300">Recuperação concluída</p><p className="text-muted-foreground mt-1">Dias avançados: {skipSummary.daysAdvanced} · Energia: {skipSummary.energy} · Fadiga: {skipSummary.fatigue} · Treinos cancelados: {skipSummary.trainingsCancelled || 0} · Eventos processados: {skipSummary.eventsProcessed || 0} · Torneios perdidos: {skipSummary.tournamentsMissed || 0}</p></div>}
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
          <div><p className="text-muted-foreground">Retorno previsto</p><p className="font-semibold">{formatDate(profile.injury_return_date)}</p></div>
        </div>
      </div>
      {skipError && <p className="text-xs text-rose-300">{skipError}</p>}
      {onSkipRecovery && <button onClick={onSkipRecovery} disabled={skipping} className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50 flex items-center justify-center gap-2"><FastForward className="h-4 w-4" />{skipping ? 'Processando recuperação...' : `Avançar até a recuperação (${days}d)`}</button>}
      <p className="text-[10px] text-muted-foreground">Cada dia será processado normalmente. O avanço para se houver uma decisão obrigatória.</p>
    </div>
  );
}
