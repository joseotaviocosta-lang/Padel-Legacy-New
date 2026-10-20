import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Brain, Calendar, ChevronLeft, ChevronRight, Crown, Flame, Gauge, Handshake, Heart, Medal, Shield, Sparkles, Star, Swords,
  Target, TrendingDown, TrendingUp, Trophy, UserRound, Users, Waves, Zap, Eye,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { getPersonalityMeta, getCoachMeta } from '@/lib/athleteBehavior';
import { TraitList } from '@/components/athletes/TraitBadge';
import { getInterviewStyle, generateInterviewQuote } from '@/lib/personalityTraits';
import { AttributeBar } from '@/components/padel/Shared';
import { CountryFlag, ModalShell, PlayerAvatar, Tabs } from '@/components/design-system';
import { deriveRecentForm } from '@/game-core/livingCircuitRules.js';
import {
  ageOf, bestRankingOf, buildCareerSummary, buildPartnershipHistory, buildResultHistory, isRetiredAthlete,
  overallOf, recordedNumber, resolveCurrentPartner, retirementInfo, sideLabel, styleLabel, summarizeBySeason, titlesByTier,
} from '@/lib/athleteProfileDisplay.js';

// Fase 5.32-C — Perfil de atleta: "uma pessoa com uma carreira esportiva,
// não uma linha de banco de dados".
//   cabeçalho esportivo (nome, país, idade, lado, posição Mundial ATUAL, OVR,
//   status, parceiro atual) → seções sob demanda: Resumo, Resultados,
//   Parcerias, Jogo.
// A posição vem pronta de quem abre o perfil (`standing`, autoridade do
// Ranking — buildStandingIndex/standingOf); o perfil nunca exibe o campo
// `ranking_position` gravado pelo circuito. Ao abrir, só LÊ (resultados,
// parcerias, legado de aposentadoria, registro do parceiro): nada é gravado.
// Valor ausente é "não registrado", nunca 0; autoridade que falhou é
// "indisponível".

const PERSONALITY_ICONS = { Star, Eye, Flame, Waves, Zap, Crown, Target };
const ATTR_LABELS = {
  serve: 'Saque', forehand: 'Forehand', backhand: 'Backhand', volley: 'Voleio',
  bandeja: 'Bandeja', smash: 'Smash', defense: 'Defesa', agility: 'Agilidade',
  strategy: 'Estratégia', emotional_control: 'Controle Emocional',
};
const ATTR_ICONS = {
  serve: Zap, forehand: TrendingUp, backhand: TrendingDown, volley: Waves,
  bandeja: Target, smash: Flame, defense: Shield, agility: Activity,
  strategy: Brain, emotional_control: Heart,
};
const SECTIONS = [
  { key: 'summary', label: 'Resumo' },
  { key: 'results', label: 'Resultados' },
  { key: 'partners', label: 'Parcerias' },
  { key: 'game', label: 'Jogo' },
];
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('pt-BR');
const NOT_RECORDED = 'não registrado';

async function readOrNull(task) {
  try { return await task(); } catch { return null; }
}

/** Leituras do perfil (somente leitura). `null` em cada campo = indisponível. */
export async function loadAthleteProfileExtras(athlete) {
  if (!athlete?.id) return null;
  const E = localGame.entities;
  const id = athlete.id;
  const partnerId = athlete.ai_partner_id || athlete.partner_athlete_id || null;
  const [partnerAthlete, playerPartnership, partnershipsA, partnershipsB, partnershipsPlayer, legaciesA, legaciesB, careerLegacy, results] = await Promise.all([
    partnerId ? readOrNull(() => E.AthleteProfile.get(partnerId)) : null,
    readOrNull(() => E.Partnership.filter({ partner_bot_id: id, status: 'ativa' }, null, 1)),
    readOrNull(() => E.Partnership.filter({ athlete_a_id: id })),
    readOrNull(() => E.Partnership.filter({ athlete_b_id: id })),
    readOrNull(() => E.Partnership.filter({ partner_bot_id: id })),
    readOrNull(() => E.PartnershipLegacy.filter({ athlete_a_id: id })),
    readOrNull(() => E.PartnershipLegacy.filter({ athlete_b_id: id })),
    isRetiredAthlete(athlete) ? readOrNull(() => E.AthleteCareerLegacy.filter({ athlete_id: id }, null, 1)) : [],
    readOrNull(() => E.AthleteRankingResult.filter({ athlete_id: id }, '-date', 40)),
  ]);
  const activeWithPlayer = Array.isArray(playerPartnership) ? playerPartnership.find((p) => p.profile_id) || null : null;
  const player = activeWithPlayer ? await readOrNull(() => E.PlayerProfile.get(activeWithPlayer.profile_id)) : null;
  const merge = (...lists) => (lists.some(Array.isArray) ? [...new Map(lists.filter(Array.isArray).flat().map((row) => [row.id, row])).values()] : null);
  return {
    partnerAthlete,
    playerPartnership: activeWithPlayer,
    player,
    partnerships: merge(partnershipsA, partnershipsB, partnershipsPlayer),
    legacies: merge(legaciesA, legaciesB),
    careerLegacy: Array.isArray(careerLegacy) ? careerLegacy[0] || null : null,
    results,
  };
}

/** Modelo de exibição do perfil (puro, a partir do atleta + extras + posição). */
export function buildAthleteProfileModel(athlete, extras = null, standing = null) {
  const retired = isRetiredAthlete(athlete);
  const legacy = extras?.careerLegacy || null;
  const current = extras
    ? resolveCurrentPartner({ athlete, partnerAthlete: extras.partnerAthlete, playerPartnership: extras.playerPartnership, player: extras.player })
    : null;
  const worldRank = retired ? null : standing?.world?.rank || null;
  return {
    retired,
    worldRank,
    worldPoints: retired ? null : (standing?.world?.points ?? recordedNumber(athlete?.world_ranking_points ?? athlete?.ranking_points)),
    raceRank: retired ? null : standing?.race?.rank || null,
    racePoints: retired ? null : (standing?.race?.points ?? recordedNumber(athlete?.race_points)),
    standingAvailable: standing?.available !== false,
    overall: overallOf(athlete),
    maxOverall: recordedNumber(athlete?.max_overall_rating),
    age: ageOf(athlete),
    side: sideLabel(athlete),
    style: styleLabel(athlete),
    best: bestRankingOf(athlete, worldRank, legacy),
    summary: buildCareerSummary(athlete, legacy),
    titlesByTier: titlesByTier(athlete, legacy),
    retirement: retirementInfo(athlete, legacy),
    current,
    partnerships: extras?.partnerships === null ? null : buildPartnershipHistory(athlete?.id, {
      partnerships: extras?.partnerships || [], legacies: extras?.legacies || [], current,
    }),
    results: extras?.results === null ? null : buildResultHistory(extras?.results || [], athlete?.recent_results || [], { selfName: athlete?.name || null }),
    injured: Boolean(athlete?.current_injury),
    // Quantas parcerias o circuito contou na carreira (pode ser maior que as
    // linhas guardadas: parcerias antigas são podadas do save).
    partnershipCount: recordedNumber(athlete?.partnership_history_count),
  };
}

export default function AthleteDetail({ athlete, onClose, standing = null, onOpenAthlete = null, context = null, back = null }) {
  const [extras, setExtras] = useState(null);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [section, setSection] = useState('summary');
  const athleteId = athlete?.id;
  const isPlayer = Boolean(athlete?.is_player_profile);

  useEffect(() => {
    if (!athleteId || isPlayer) { setLoadingExtras(false); return undefined; }
    let active = true;
    setLoadingExtras(true);
    setSection('summary');
    loadAthleteProfileExtras(athlete).then((value) => { if (active) setExtras(value); }).finally(() => { if (active) setLoadingExtras(false); });
    return () => { active = false; };
    // A leitura depende só da identidade do atleta.
  }, [athleteId, isPlayer]);

  if (!athlete) return null;
  const model = buildAthleteProfileModel(athlete, loadingExtras ? null : extras, standing);

  return (
    <ModalShell open={Boolean(athlete)} onClose={onClose} title="Perfil de atleta" description={athlete.name} size="md" contentClassName="p-0 sm:p-0">
      <div data-athlete-profile={athlete.id} className="space-y-4 p-4 sm:p-5">
        {back && (
          <button type="button" onClick={back.onBack} className="inline-flex min-h-9 max-w-full items-center gap-1 text-xs font-bold text-primary" data-athlete-back>
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">Voltar para {back.name}</span>
          </button>
        )}
        <ProfileHeader athlete={athlete} model={model} loading={loadingExtras} onOpenAthlete={onOpenAthlete} isPlayer={isPlayer} />
        {isPlayer ? (
          <PlayerProfileNote />
        ) : (
          <>
            <Tabs tabs={SECTIONS} activeTab={section} onTabChange={setSection} />
            {section === 'summary' && <SummarySection athlete={athlete} model={model} context={context} />}
            {section === 'results' && <ResultsSection model={model} loading={loadingExtras} />}
            {section === 'partners' && <PartnersSection model={model} loading={loadingExtras} onOpenAthlete={onOpenAthlete} />}
            {section === 'game' && <GameSection athlete={athlete} model={model} />}
          </>
        )}
      </div>
    </ModalShell>
  );
}

// ── Cabeçalho esportivo ─────────────────────────────────────────────────
function StatusChip({ model, isPlayer }) {
  if (isPlayer) return <Chip tone="primary">Você</Chip>;
  if (model.retired) return <Chip tone="muted">Aposentado</Chip>;
  if (model.injured) return <Chip tone="danger">Lesionado</Chip>;
  return <Chip tone="success">Ativo</Chip>;
}

function Chip({ tone = 'muted', children }) {
  const tones = {
    primary: 'bg-primary/15 text-primary', success: 'bg-success/15 text-success',
    danger: 'bg-destructive/15 text-destructive', muted: 'bg-secondary/70 text-muted-foreground',
  };
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

function PartnerName({ partner, onOpenAthlete }) {
  if (partner.isPlayer) return <span className="font-bold">{partner.name} <span className="text-primary">(você)</span></span>;
  if (onOpenAthlete) {
    return (
      <button type="button" onClick={() => onOpenAthlete(partner.id)} className="inline-flex min-h-8 min-w-0 items-center gap-1 font-bold text-primary" data-athlete-partner-link={partner.id}>
        <span className="truncate">{partner.name}</span><ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
    );
  }
  return (
    <Link to={`/world/directory?tab=athletes&athlete=${encodeURIComponent(partner.id)}`} className="inline-flex min-h-8 min-w-0 items-center gap-1 font-bold text-primary" data-athlete-partner-link={partner.id}>
      <span className="truncate">{partner.name}</span><ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </Link>
  );
}

function CurrentPartnerLine({ model, loading, onOpenAthlete, isPlayer }) {
  let content;
  if (isPlayer) content = <span className="text-muted-foreground">Sua dupla e seu histórico ficam no seu perfil.</span>;
  else if (loading) content = <span className="text-muted-foreground">Carregando…</span>;
  else if (!model.current) content = <span className="text-muted-foreground">Indisponível no momento</span>;
  else if (model.current.status === 'current') content = <PartnerName partner={model.current.partner} onOpenAthlete={onOpenAthlete} />;
  else if (model.current.status === 'retired') content = <span className="text-muted-foreground">Encerrou a carreira</span>;
  else if (model.current.status === 'none') content = <span className="text-muted-foreground">Sem parceiro no momento</span>;
  else content = <span className="text-muted-foreground">Parceria não confirmada</span>;
  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-border/40 pt-3 text-xs" data-athlete-current-partner={model.current?.status || (loading ? 'loading' : 'unknown')}>
      <Users className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Parceiro atual</span>
      <span className="min-w-0 flex-1 truncate">{content}</span>
    </div>
  );
}

function ProfileHeader({ athlete, model, loading, onOpenAthlete, isPlayer }) {
  const facts = [model.age ? `${model.age} anos` : null, model.side].filter(Boolean);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/70 p-4 pl-5" data-athlete-header>
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${model.worldRank === 1 ? 'bg-amber-400' : model.retired ? 'bg-muted-foreground/40' : 'bg-primary'}`} />
      <div className="flex min-w-0 items-start gap-3">
        <PlayerAvatar name={athlete.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 text-lg font-black leading-tight sm:text-xl" data-athlete-name>{athlete.name}</h3>
            <StatusChip model={model} isPlayer={isPlayer} />
          </div>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {athlete.country && <CountryFlag country={athlete.country} showLabel />}
            {facts.map((fact) => <span key={fact}>· {fact}</span>)}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="min-w-0" data-athlete-world-rank={model.worldRank || ''}>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Mundial</p>
          {model.retired ? (
            <p className="text-lg font-black leading-tight text-muted-foreground">Aposentado</p>
          ) : model.worldRank ? (
            <p className="text-3xl font-black leading-none tabular-nums text-primary">#{model.worldRank}</p>
          ) : (
            <p className="text-lg font-black leading-tight text-muted-foreground">{model.standingAvailable ? 'Sem ranking' : 'Indisponível'}</p>
          )}
          {!model.retired && model.worldPoints !== null && <p className="mt-0.5 text-[11px] text-muted-foreground"><b className="tabular-nums text-foreground">{fmt(model.worldPoints)}</b> pts</p>}
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">OVR</p>
          <p className="text-3xl font-black leading-none tabular-nums">{model.overall ?? '—'}</p>
          {model.raceRank && <p className="mt-0.5 text-[11px] text-muted-foreground">Race <b className="tabular-nums text-foreground">#{model.raceRank}</b> · {fmt(model.racePoints)} pts</p>}
        </div>
      </div>
      <div className="mt-3">
        <CurrentPartnerLine model={model} loading={loading} onOpenAthlete={onOpenAthlete} isPlayer={isPlayer} />
      </div>
    </section>
  );
}

function PlayerProfileNote() {
  return (
    <Link to="/career/athlete" className="flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-primary/35 bg-primary/5 px-4 py-3 text-sm font-bold text-primary" data-athlete-player-link>
      <span className="flex items-center gap-2"><UserRound className="h-4 w-4" aria-hidden="true" />Abrir meu perfil completo</span>
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

// ── Seções ───────────────────────────────────────────────────────────────
function SectionTitle({ children, note = null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{children}</h4>
      {note && <span className="text-[10px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function Metric({ label, value, hint = null }) {
  const missing = value === null || value === undefined;
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-card/55 p-2.5" data-athlete-metric={label} data-missing={missing || undefined}>
      <p className="truncate text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-black tabular-nums ${missing ? 'text-xs text-muted-foreground' : 'text-lg leading-tight'}`}>{missing ? NOT_RECORDED : value}</p>
      {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SummarySection({ athlete, model, context }) {
  const summary = Object.fromEntries(model.summary.map((item) => [item.key, item.value]));
  const matches = summary.wins !== null && summary.losses !== null ? summary.wins + summary.losses : null;
  return (
    <div className="space-y-3" data-athlete-section="summary">
      {model.retirement && (
        <div className="rounded-2xl border border-border/50 bg-secondary/30 p-3 text-xs" data-athlete-retirement>
          <p className="font-bold">Carreira encerrada</p>
          <p className="mt-0.5 text-muted-foreground">
            {model.retirement.date ? `Aposentou-se em ${formatFullDate(model.retirement.date)}` : 'Data da aposentadoria não registrada'}
            {model.retirement.age ? `, aos ${model.retirement.age} anos` : ''}
            {model.retirement.yearsActive ? ` · ${model.retirement.yearsActive} anos no circuito` : ''}
            {model.retirement.mainPartner ? ` · principal parceiro: ${model.retirement.mainPartner}` : ''}
          </p>
        </div>
      )}
      <SectionTitle note="carreira registrada no save">Carreira</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Títulos" value={summary.titles} />
        <Metric label="Torneios" value={summary.tournaments} />
        <Metric label="Vitórias" value={summary.wins} hint={matches ? `${Math.round((summary.wins / Math.max(1, matches)) * 100)}% das partidas` : null} />
        <Metric label="Derrotas" value={summary.losses} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Melhor posição" value={model.best ? `#${model.best.rank}` : null} hint={model.best ? (model.best.source === 'atual' ? 'posição atual' : 'registro do circuito') : null} />
        {model.retired
          ? <Metric label="Anos no circuito" value={model.retirement?.yearsActive ?? null} hint="até a aposentadoria" />
          : <Metric label="Pontos Race" value={model.racePoints !== null ? fmt(model.racePoints) : null} hint="temporada atual" />}
      </div>
      {model.titlesByTier.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card/55 p-3" data-athlete-titles>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground"><Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />Títulos por categoria</p>
          <div className="flex flex-wrap gap-1.5">
            {model.titlesByTier.map((row) => (
              <span key={row.tier} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                {row.tier} <b className="tabular-nums text-foreground">{row.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      {!model.retired && model.worldRank && context !== 'ranking' && (
        <Link to={`/ranking?athlete=${encodeURIComponent(athlete.id)}`} className="flex min-h-11 items-center justify-between rounded-xl border border-border/50 px-3 text-xs font-bold text-primary" data-athlete-ranking-link>
          Ver no ranking mundial<ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function ResultsSection({ model, loading }) {
  const [limit, setLimit] = useState(10);
  if (loading) return <p className="px-1 text-xs text-muted-foreground">Carregando resultados…</p>;
  if (model.results === null) return <p className="px-1 text-xs text-muted-foreground" data-athlete-section="results">Resultados indisponíveis no momento.</p>;
  if (model.results.length === 0) {
    return <p className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground" data-athlete-section="results">Nenhum resultado registrado na janela do ranking.</p>;
  }
  const seasons = summarizeBySeason(model.results);
  return (
    <div className="space-y-3" data-athlete-section="results">
      <SectionTitle note="resultados que contam para o ranking">Por temporada</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {seasons.map((s) => (
          <div key={s.year} className="rounded-xl border border-border/50 bg-card/55 p-2.5 text-xs">
            <p className="font-black">{s.year}</p>
            <p className="text-muted-foreground">{s.events} {s.events === 1 ? 'torneio' : 'torneios'} · {s.titles} {s.titles === 1 ? 'título' : 'títulos'}</p>
          </div>
        ))}
      </div>
      <SectionTitle>Torneios</SectionTitle>
      <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-card/55">
        {model.results.slice(0, limit).map((row) => (
          <li key={row.tournamentId} className="flex min-w-0 items-center gap-3 px-3 py-2" data-athlete-result={row.tournamentId}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${row.won ? 'bg-amber-500/15' : 'bg-secondary/50'}`}>
              {row.won ? <Medal className="h-4 w-4 text-amber-400" aria-hidden="true" /> : <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{row.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {[row.tier, row.date ? formatFullDate(row.date) : null, row.partner?.name ? `com ${row.partner.name}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-xs font-black ${row.won ? 'text-amber-400' : ''}`}>{row.finish}</p>
              {row.points !== null && <p className="text-[10px] tabular-nums text-muted-foreground">{fmt(row.points)} pts</p>}
            </div>
          </li>
        ))}
      </ul>
      {model.results.length > limit && (
        <button type="button" onClick={() => setLimit((value) => value + 10)} className="min-h-11 w-full rounded-xl border border-border/60 text-xs font-bold text-primary">Mostrar mais ({model.results.length - limit})</button>
      )}
    </div>
  );
}

function PartnersSection({ model, loading, onOpenAthlete }) {
  if (loading) return <p className="px-1 text-xs text-muted-foreground">Carregando parcerias…</p>;
  if (model.partnerships === null) return <p className="px-1 text-xs text-muted-foreground" data-athlete-section="partners">Histórico de parcerias indisponível no momento.</p>;
  if (model.partnerships.length === 0) {
    return <p className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground" data-athlete-section="partners">Nenhuma parceria registrada para este atleta.</p>;
  }
  const untracked = model.partnershipCount !== null && model.partnershipCount > model.partnerships.length;
  return (
    <div className="space-y-2" data-athlete-section="partners">
      <SectionTitle note={`${model.partnerships.length} ${model.partnerships.length === 1 ? 'parceria' : 'parcerias'}`}>Parcerias</SectionTitle>
      {untracked && (
        <p className="px-1 text-[11px] text-muted-foreground" data-athlete-partnerships-partial>
          O circuito contou {model.partnershipCount} parcerias na carreira; {model.partnerships.length} {model.partnerships.length === 1 ? 'tem detalhes salvos' : 'têm detalhes salvos'}.
        </p>
      )}
      <ul className="divide-y divide-border/40 rounded-2xl border border-border/50 bg-card/55">
        {model.partnerships.map((row) => (
          <li key={row.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5" data-athlete-partnership={row.current ? 'current' : 'ended'}>
            <Handshake className={`h-4 w-4 shrink-0 ${row.current ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="min-w-0 truncate text-sm">
                {onOpenAthlete && row.partnerId ? (
                  <button type="button" onClick={() => onOpenAthlete(row.partnerId)} className="font-bold hover:text-primary">{row.partnerName}</button>
                ) : <span className="font-bold">{row.partnerName}</span>}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {row.unregistered ? 'Início não registrado' : `${row.start ? formatPeriodDate(row.start) : 'início não registrado'} → ${row.current ? 'hoje' : row.end ? formatPeriodDate(row.end) : 'fim não registrado'}`}
                {row.endReason && !row.current ? ` · ${row.endReason}` : ''}
                {row.titles !== null && row.titles > 0 ? ` · ${row.titles} ${row.titles === 1 ? 'título' : 'títulos'} juntos` : ''}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${row.current ? 'bg-primary/15 text-primary' : 'bg-secondary/70 text-muted-foreground'}`}>{row.current ? 'Atual' : 'Encerrada'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatFullDate(date) {
  const day = Number(String(date).slice(8, 10));
  const month = MONTHS[Number(String(date).slice(5, 7)) - 1];
  return day && month ? `${day} ${month} ${String(date).slice(0, 4)}` : String(date);
}
function formatPeriodDate(date) {
  const month = MONTHS[Number(String(date).slice(5, 7)) - 1];
  return month ? `${month} ${String(date).slice(0, 4)}` : String(date);
}

function GameSection({ athlete, model }) {
  const personality = getPersonalityMeta(athlete.personality);
  const PersonalityIcon = PERSONALITY_ICONS[personality.icon] || Star;
  const coach = getCoachMeta(athlete.coach_preference);
  const recentForm = deriveRecentForm(athlete);
  const axes = athlete.behavior_axes || null;
  const attributes = Object.entries(athlete.attributes || {}).filter(([, value]) => Number.isFinite(Number(value)));
  const AXES = [
    ['aggression', 'Agressividade', Swords], ['consistency', 'Consistência', Gauge], ['clutch', 'Decisões', Crown],
    ['teamwork', 'Jogo em dupla', Handshake], ['tactical_intelligence', 'Leitura tática', Brain], ['risk_tolerance', 'Tolerância ao risco', Zap],
  ];
  return (
    <div className="space-y-3" data-athlete-section="game">
      <SectionTitle>Nível</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="OVR" value={model.overall} />
        <Metric label="OVR máximo" value={model.maxOverall !== null ? Math.round(model.maxOverall) : null} hint="maior da carreira" />
        <Metric label="Estilo" value={model.style} />
        <Metric label="Forma" value={recentForm?.label || null} />
      </div>

      <SectionTitle note={attributes.length ? null : 'o desempenho deste atleta é medido pelo OVR'}>Atributos técnicos</SectionTitle>
      {attributes.length ? (
        <div className="space-y-2 rounded-2xl border border-border/50 bg-card/55 p-3" data-athlete-attributes>
          {attributes.map(([key, value]) => <AttributeBar key={key} label={ATTR_LABELS[key] || key} value={value} icon={ATTR_ICONS[key]} />)}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground" data-athlete-attributes="none">Atributos técnicos individuais não registrados para este atleta.</p>
      )}

      <SectionTitle>Comportamento em quadra</SectionTitle>
      {axes ? (
        <div className="grid grid-cols-2 gap-2" data-athlete-axes>
          {AXES.map(([key, label, Icon]) => <AxisBar key={key} icon={Icon} label={label} value={recordedNumber(axes[key])} />)}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground">Perfil competitivo ainda não avaliado.</p>
      )}
      {athlete.behavior_summary && <p className="px-1 text-xs leading-relaxed text-muted-foreground">{athlete.behavior_summary}</p>}
      {athlete.pressure_profile && <p className="px-1 text-xs text-muted-foreground"><b className="text-foreground">Sob pressão:</b> {athlete.pressure_profile}</p>}

      <SectionTitle>Personalidade</SectionTitle>
      <div className="space-y-2 rounded-2xl border border-border/50 bg-card/55 p-3">
        <p className="flex items-center gap-2 text-xs font-bold"><PersonalityIcon className={`h-4 w-4 ${personality.color}`} aria-hidden="true" />{personality.label}</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{personality.desc}</p>
        {athlete.personality_traits?.length > 0 && <TraitList traitIds={athlete.personality_traits} />}
        {athlete.personality_traits?.length > 0 && (
          <div className="border-l-2 border-primary/50 pl-2.5">
            <p className="text-[10px] italic text-muted-foreground">{getInterviewStyle(athlete.personality_traits)}</p>
            <p className="text-[11px] italic text-foreground/90">"{generateInterviewQuote(athlete.personality_traits, 'neutral')}"</p>
          </div>
        )}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Brain className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />Treinador preferido: <b className="text-foreground">{coach.label}</b></p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Torcida" value={recordedNumber(athlete.fan_appeal) !== null ? Math.round(athlete.fan_appeal) : null} />
        <Metric label="Patrocínio" value={recordedNumber(athlete.sponsor_appeal) !== null ? Math.round(athlete.sponsor_appeal) : null} />
        <Metric label="Treinador" value={recordedNumber(athlete.coach_relationship) !== null ? Math.round(athlete.coach_relationship) : null} />
      </div>

      {(athlete.relationships || []).length > 0 && (
        <>
          <SectionTitle>Relações no circuito</SectionTitle>
          <ul className="space-y-1.5 rounded-2xl border border-border/50 bg-card/55 p-3">
            {athlete.relationships.map((r) => (
              <li key={`${r.type}:${r.target_athlete_id || r.target_name}`} className="flex min-w-0 items-center gap-2 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${r.type === 'rival' ? 'bg-red-400' : r.type === 'amigo' ? 'bg-green-400' : 'bg-blue-400'}`} />
                <span className="min-w-0 flex-1 truncate font-semibold">{r.target_name}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">{r.type}{r.type === 'rival' && r.meetings ? ` · ${r.meetings} jogos` : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!athlete.personality_traits?.length && !axes && <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Mais detalhes aparecem conforme o atleta compete.</p>}
    </div>
  );
}

function AxisBar({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/55 p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-muted-foreground">{label}</span>
        <span className="text-[11px] font-black tabular-nums">{value === null ? '—' : Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${value === null ? 0 : Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
