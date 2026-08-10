import React, { useState } from 'react';
import { Trophy, MapPin, Coins, Zap, Star, Calendar, Lock, CheckCircle, AlertCircle, Award, Shield } from 'lucide-react';
import { formatDate } from '@/lib/padel';
import { daysBetween } from '@/lib/career';
import { SURFACE_META, PHASE_LABELS, checkTournamentRequirements, getRegistrationDeadline, isRegistrationOpen } from '@/lib/calendarSystem';
import { useToast } from '@/components/ui/use-toast';
import { getEntryPathLabel } from '@/gameplay/worldTour/EntryManager.js';
import { ModalShell } from '@/components/design-system';

const TIER_STYLES = {
  Crown:{badge:'bg-amber-500/15 text-amber-300 border-amber-500/40',icon:Trophy,label:'Legacy Crown'},
  Elite:{badge:'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',icon:Trophy,label:'Legacy Elite'},
  Masters:{badge:'bg-purple-500/15 text-purple-300 border-purple-500/30',icon:Award,label:'Legacy Masters'},
  Platinum:{badge:'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',icon:Award,label:'Legacy Platinum'},
  Gold:{badge:'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',icon:Award,label:'Legacy Gold'},
  Silver:{badge:'bg-slate-500/15 text-slate-300 border-slate-500/30',icon:Shield,label:'Legacy Silver'},
};

export default function TournamentRegistrationModal({ tournament, profile, teamRank = 0, onClose, onRegistered }) {
  const [registering, setRegistering] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const { toast } = useToast();

  const tierStyle = TIER_STYLES[tournament.tier] || TIER_STYLES.Silver;
  const TierIcon = tierStyle.icon;
  const surface = SURFACE_META[tournament.surface] || SURFACE_META.vidro;
  const deadline = getRegistrationDeadline(tournament);
  const careerDate = profile?.career_date || '2026-01-01';
  const regOpen = isRegistrationOpen(tournament, careerDate);
  const validation = checkTournamentRequirements(profile, tournament, teamRank);
  const entry = validation.entry;
  const daysUntilTournament = tournament.start_date ? daysBetween(careerDate, tournament.start_date) : 0;
  const daysUntilDeadline = deadline ? daysBetween(careerDate, deadline) : 0;

  async function handleRegister(replaceConflicts = false) {
    if (!validation.canRegister) return;
    setRegistering(true);
    try {
      const { registerForTournament } = await import('@/lib/calendarSystem');
      const result = await registerForTournament(profile, tournament, teamRank, { replaceConflicts });
      if (result.success) {
        toast({ title: 'Inscrição confirmada!', description: `${getEntryPathLabel(result.entry?.path)} em ${tournament.name}.` });
        onRegistered?.(result.profile);
        onClose();
      } else if (result.requiresConfirmation) {
        setConflicts(result.conflicts || []);
      } else {
        toast({ title: 'Não foi possível inscrever', description: (result.reasons || []).map(item => item.message || item).join(' '), variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Erro', description: 'Falha na inscrição.', variant: 'destructive' });
    } finally {
      setRegistering(false);
    }
  }

  return (
    <ModalShell
      open={Boolean(tournament)}
      onClose={onClose}
      title="Inscrição no torneio"
      description={tournament.name}
      size="sm"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:bg-secondary">Cancelar</button>
          <button
            type="button"
            onClick={() => handleRegister(conflicts.length > 0)}
            disabled={!validation.canRegister || registering || !regOpen}
            className="inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {registering ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> Inscrevendo...</>
              : !regOpen ? <><Lock className="h-4 w-4" /> Inscrições encerradas</>
                : !validation.canRegister ? <><Lock className="h-4 w-4" /> Requisitos não atendidos</>
                  : <><CheckCircle className="h-4 w-4" /> {conflicts.length ? 'Substituir e confirmar' : 'Confirmar inscrição'}</>}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-secondary/25 p-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <TierIcon className={`h-5 w-5 ${
                tierStyle.badge.includes('amber') ? 'text-amber-400'
                  : tierStyle.badge.includes('purple') ? 'text-purple-400'
                    : tierStyle.badge.includes('emerald') ? 'text-emerald-400'
                      : tierStyle.badge.includes('slate') ? 'text-slate-300'
                        : 'text-cyan-400'
              }`} />
            </div>
            <div>
              <h2 className="text-base font-black leading-tight">{tournament.name}</h2>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${tierStyle.badge}`}>
                {tierStyle.label}
              </span>
            </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <InfoCard icon={Calendar} label="Data" value={tournament.start_date ? formatDate(tournament.start_date) : '—'} sub={daysUntilTournament > 0 ? `em ${daysUntilTournament} dias` : daysUntilTournament === 0 ? 'Hoje!' : 'passado'} />
          <InfoCard icon={MapPin} label="Local" value={tournament.location?.split(',')[0] || '—'} sub={tournament.location?.split(',')[1]?.trim() || ''} />
          <InfoCard icon={Coins} label="Premiação" value={`${(tournament.prize_coins || 0).toLocaleString('pt-BR')}`} sub="moedas" />
          <InfoCard icon={Star} label="Pontos Ranking" value={`${tournament.rank_points || 0}`} sub="pontos" />
          <InfoCard icon={Zap} label="XP" value={`${tournament.xp_reward || 0}`} sub="experiência" />
          <InfoCard icon={Trophy} label="Superfície" value={surface.label} sub={surface.desc} />
        </div>

        <div className="glass rounded-xl p-3 mb-4 border border-primary/20 bg-primary/5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Caminho de entrada</p>
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm font-black ${entry?.eligible ? 'text-primary' : 'text-red-400'}`}>{getEntryPathLabel(entry?.path)}</p>
            <span className="text-[10px] text-muted-foreground text-right">{entry?.reason}</span>
          </div>
        </div>

        {/* Entry requirements */}
        <div className="glass rounded-xl p-3 mb-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Requisitos de Entrada</p>
          <div className="space-y-1.5">
            <RequirementRow label="Nível mínimo" value={tournament.min_level || 'Iniciante'} met={validation.canRegister || !tournament.min_level} />
            <RequirementRow label="Entrada esportiva" value={getEntryPathLabel(entry?.path)} met={!!entry?.eligible} />
            <RequirementRow label="Taxa de inscrição" value={tournament.entry_fee ? `${tournament.entry_fee} moedas` : 'Gratuito'} met={(profile?.coins || 0) >= (tournament.entry_fee || 0)} />
            <RequirementRow label="Parceiro" value={profile?.partner_id ? 'Definido' : 'Necessário'} met={!!profile?.partner_id} />
            <RequirementRow label="Inscrições" value={regOpen ? (daysUntilDeadline >= 0 ? `Fecha em ${daysUntilDeadline}d` : 'Aberta') : 'Encerrada'} met={regOpen} />
          </div>
        </div>

        <div className="glass rounded-xl p-3 mb-4 border border-cyan-500/20">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Caminho de entrada</p>
          <p className="text-sm font-bold text-cyan-300 mt-1">{entryPathLabel(validation.entry?.path)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{validation.entry?.reason}</p>
        </div>

        {conflicts.length > 0 && (
          <div className="glass rounded-xl p-3 mb-4 border border-amber-500/30 bg-amber-500/5">
            <p className="text-xs font-bold text-amber-300">Conflito de calendário</p>
            <p className="text-[11px] text-muted-foreground mt-1">Para disputar este torneio, sua inscrição em <strong>{conflicts[0].title}</strong> será cancelada.</p>
          </div>
        )}

        {/* Blocking reasons */}
        {!validation.canRegister && (
          <div className="glass rounded-xl p-3 mb-4 border border-red-500/30 bg-red-500/5">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <p className="text-xs font-bold text-red-400">Não é possível inscrever</p>
            </div>
            <ul className="text-[11px] text-red-300 space-y-0.5 list-disc list-inside">
              {validation.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

        {/* Status badge */}
        <div className="glass rounded-xl p-3 mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Fase atual</p>
            <p className="text-sm font-bold">{PHASE_LABELS[tournament.current_phase] || 'Inscrições Abertas'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Vagas</p>
            <p className="text-sm font-bold">{(tournament.participants || []).length}/{tournament.max_participants || 16}</p>
          </div>
        </div>

      </div>
    </ModalShell>
  );
}

function InfoCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">{label}</p>
      </div>
      <p className="text-sm font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>}
    </div>
  );
}

function RequirementRow({ label, value, met }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold flex items-center gap-1 ${met ? 'text-primary' : 'text-red-400'}`}>
        {met ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
        {value}
      </span>
    </div>
  );
}
function entryPathLabel(path) {
  return ({
    direct: 'Chave principal — entrada direta',
    qualifying: 'Qualifying — precisa se classificar',
    wildcard: 'Wildcard',
    protected_ranking: 'Ranking protegido',
    special_exempt: 'Special Exempt',
    junior_invite: 'Convite juvenil',
    national_invite: 'Convite nacional',
    ineligible: 'Sem vaga disponível',
  })[path] || 'Entrada a confirmar';
}
