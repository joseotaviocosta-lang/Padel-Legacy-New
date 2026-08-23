import React from 'react';
import {
  CalendarDays, CheckCircle, Clock, Coins, ListTree, Lock, MapPin,
  Play, Star, Trophy, UserRoundCheck, Zap,
} from 'lucide-react';
import { Button, ModalShell, StatusBadge } from '@/components/design-system';
import { formatDate } from '@/lib/padel';
import {
  PHASE_LABELS, checkTournamentRequirements, getRegistrationDeadline, isRegistrationOpen,
} from '@/lib/calendarSystem';
import { getEntryPathLabel } from '@/gameplay/worldTour/EntryManager.js';

function Info({ icon: Icon, label, value, hint = null }) {
  return (
    <div className="rounded-xl border border-border/50 bg-secondary/25 p-3">
      <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{label}
      </div>
      <p className="mt-1 text-sm font-bold">{value || '—'}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function TournamentDetailsModal({
  tournament,
  profile,
  teamRank = 0,
  registration = null,
  activeRun = null,
  canRegister = false,
  onRegister,
  onContinue,
  onViewBracket,
  onClose,
}) {
  if (!tournament) return null;
  const careerDate = profile?.career_date || '2026-01-01';
  const deadline = getRegistrationDeadline(tournament);
  const registrationOpen = isRegistrationOpen(tournament, careerDate);
  const validation = checkTournamentRequirements(profile, tournament, teamRank);
  const run = activeRun?.metadata?.tournament_run || null;
  const activeMatch = run?.matches?.[run.currentRound || 0] || null;
  // Hotfix 15.6.2 (Parte 9): mesma condição já usada em Tournaments.jsx
  // (TournamentFocusMode.canPlayNow) — antes este botão dizia sempre
  // "Preparar partida" enquanto `activeRun` existisse, mesmo no dia exato
  // da partida já preparada, porque a condição nunca olhava data/prep. Não
  // é um cálculo novo: reaproveita a mesma fórmula, aplicada ao 3º
  // consumidor que faltava (TournamentModal e Tournaments.jsx já usam).
  const canPlayNow = Boolean(activeMatch) && activeMatch.date === careerDate && activeMatch.preparationCompleted;
  const ended = Boolean(tournament.end_date && tournament.end_date < careerDate)
    || ['concluido', 'completed', 'finished', 'finalizado'].includes(String(tournament.status || tournament.current_phase || '').toLowerCase());
  const status = activeRun
    ? 'Participação em andamento'
    : registration
      ? 'Inscrição confirmada'
      : ended
        ? 'Torneio encerrado'
        : registrationOpen
          ? 'Inscrições disponíveis'
          : 'Inscrições fechadas';

  return (
    <ModalShell
      open={Boolean(tournament)}
      onClose={onClose}
      title={tournament.name || 'Detalhes do torneio'}
      description="Informações oficiais do evento"
      size="md"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button level="ghost" size="touch" onClick={onClose}>Fechar</Button>
          <Button level="secondary" size="touch" onClick={onViewBracket}><ListTree className="h-4 w-4" />Ver chave</Button>
          {activeRun && <Button level="primary" size="touch" onClick={onContinue}><Play className="h-4 w-4" />{canPlayNow ? 'Jogar partida' : 'Preparar partida'}</Button>}
          {!activeRun && !registration && canRegister && validation.canRegister && registrationOpen && (
            <Button level="primary" size="touch" onClick={onRegister}><CheckCircle className="h-4 w-4" />Inscrever-se</Button>
          )}
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">{tournament.tier || tournament.category || 'Torneio oficial'}</p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">{tournament.description || 'Evento oficial do circuito Padel Legacy.'}</p>
          </div>
          <StatusBadge tone={activeRun ? 'premium' : registration ? 'success' : ended ? 'neutral' : registrationOpen ? 'info' : 'warning'} className="shrink-0">{status}</StatusBadge>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Info icon={CalendarDays} label="Data" value={tournament.start_date ? formatDate(tournament.start_date) : 'A definir'} hint={tournament.end_date && tournament.end_date !== tournament.start_date ? `até ${formatDate(tournament.end_date)}` : null} />
          <Info icon={MapPin} label="Local" value={tournament.location || tournament.city || 'A definir'} />
          <Info icon={Trophy} label="Categoria" value={tournament.tier || tournament.category || 'Oficial'} hint={PHASE_LABELS[tournament.current_phase] || tournament.current_phase || null} />
          <Info icon={Coins} label="Premiação" value={`${Number(tournament.prize_coins || 0).toLocaleString('pt-BR')} moedas`} />
          <Info icon={Star} label="Ranking" value={`${Number(tournament.rank_points || 0).toLocaleString('pt-BR')} pontos`} />
          <Info icon={Zap} label="Experiência" value={`${Number(tournament.xp_reward || 0).toLocaleString('pt-BR')} XP`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/50 p-3">
            <div className="flex items-center gap-2"><UserRoundCheck className="h-4 w-4 text-primary" /><p className="text-xs font-black">Sua dupla</p></div>
            <p className="mt-2 text-sm font-bold">{profile?.partner_name || (profile?.partner_id ? 'Parceiro definido' : 'Parceiro ainda não definido')}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Entrada: {getEntryPathLabel(validation.entry?.path)}</p>
          </div>
          <div className="rounded-xl border border-border/50 p-3">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /><p className="text-xs font-black">Inscrição</p></div>
            <p className="mt-2 text-sm font-bold">{status}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{deadline ? `Prazo: ${formatDate(deadline)}` : 'Prazo não informado'}</p>
          </div>
        </div>

        {activeMatch && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Próxima rodada</p>
            <p className="mt-1 text-sm font-bold">{activeMatch.round} · {formatDate(activeMatch.date)}</p>
          </div>
        )}
        {!activeRun && !registration && !canRegister && !ended && (
          <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-secondary/20 p-3 text-xs text-muted-foreground"><Lock className="h-4 w-4" />A inscrição não está disponível nesta data ou os requisitos ainda não foram atendidos.</div>
        )}
      </div>
    </ModalShell>
  );
}
