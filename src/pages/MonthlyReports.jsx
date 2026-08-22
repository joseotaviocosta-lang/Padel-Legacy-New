import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, Award, BarChart3, CalendarRange, Coins, Dumbbell, HeartPulse,
  Lightbulb, Medal, Newspaper, Sparkles, Target, TrendingDown, TrendingUp, Trophy, Users, Zap,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel.js';
import { getMonthlyCareerReport, listMonthlyCareerReports } from '@/game-core/monthlyCareerReportLifecycle.js';
import { formatPercent } from '@/game-core/physicalStats.js';
import { Page, PageContent, PageHeader, StatCard, StatusBadge } from '@/components/design-system';
import { LoadingScreen } from '@/components/padel/ui';

const number = (value) => Number(value || 0).toLocaleString('pt-BR');
const signed = (value) => value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${number(value)}`;
const monthLabel = (key) => key ? new Date(`${key}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Mês';
const titleCase = (value) => value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

function Surface({ title, description, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4.5 w-4.5" /></span>
        <div><h2 className="font-black">{title}</h2>{description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function MetricRow({ label, value, detail }) {
  return <div className="flex items-center justify-between gap-3 border-b border-border/45 py-2.5 last:border-0"><span className="text-xs text-muted-foreground">{label}</span><span className="text-right text-sm font-black">{value}{detail && <small className="ml-1 font-semibold text-muted-foreground">{detail}</small>}</span></div>;
}

function ReportDetail({ report }) {
  const rankImproved = report.ranking.positionDelta !== null && report.ranking.positionDelta < 0;
  const topAttributes = [...(report.development.attributes || [])].sort((a, b) => b.delta - a.delta).slice(0, 5);
  return (
    <div className="min-w-0 space-y-4">
      <div className="overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-amber-500/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Relatório consolidado</p><h2 className="mt-1 text-2xl font-black capitalize">{monthLabel(report.periodKey)}</h2><p className="mt-1 text-xs text-muted-foreground">{report.periodStart} a {report.periodEnd} · snapshot imutável</p></div>
          <StatusBadge tone="success" icon={Sparkles}>Finalizado</StatusBadge>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Partidas" value={report.competition.matches} detail={`${report.competition.winRate}% de aproveitamento`} icon={Trophy} tone="brand" />
          <StatCard label="Ranking" value={report.ranking.endPosition ? `#${report.ranking.endPosition}` : '—'} detail={report.ranking.positionDelta === null ? 'sem comparação' : `${rankImproved ? 'subiu' : 'variou'} ${Math.abs(report.ranking.positionDelta)} posição(ões)`} icon={rankImproved ? TrendingUp : TrendingDown} tone={rankImproved ? 'success' : 'warning'} />
          <StatCard label="Evolução" value={`${signed(report.development.overallDelta)} OVR`} detail={`${number(report.development.xpGained)} XP`} icon={Zap} tone="premium" />
          <StatCard label="Fluxo financeiro" value={signed(report.finances.net)} detail={`${number(report.finances.endBalance)} moedas em caixa`} icon={Coins} tone={report.finances.net >= 0 ? 'success' : 'warning'} />
        </div>
      </div>

      {report.highlights?.length > 0 && <Surface title="Destaques do mês" description="Marcos que definiram o período" icon={Award}><div className="grid gap-2 sm:grid-cols-2">{report.highlights.map((item) => <div key={item} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm font-bold text-amber-100"><Medal className="mr-2 inline h-4 w-4 text-amber-400" />{item}</div>)}</div></Surface>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Surface title="Competição e torneios" description="Somente jogos realizados no mês encerrado" icon={Trophy}>
          <MetricRow label="Campanha" value={`${report.competition.wins}V · ${report.competition.losses}D`} />
          <MetricRow label="Torneios disputados" value={report.competition.tournamentsPlayed} />
          <MetricRow label="Títulos" value={report.competition.titles} />
          {report.competition.tournaments?.map((item) => <div key={item.id || item.name} className="mt-2 rounded-xl bg-secondary/35 p-3"><div className="flex items-center justify-between"><strong className="text-sm">{item.name}</strong><StatusBadge tone={item.result === 'champion' ? 'premium' : 'neutral'}>{item.result === 'champion' ? 'Campeão' : `${item.wins}/${item.matches} vitórias`}</StatusBadge></div></div>)}
        </Surface>
        <Surface title="Ranking e desenvolvimento" description="Comparação entre o início e o fim do mês" icon={BarChart3}>
          <MetricRow label="Posição" value={`${report.ranking.startPosition ? `#${report.ranking.startPosition}` : '—'} → ${report.ranking.endPosition ? `#${report.ranking.endPosition}` : '—'}`} />
          <MetricRow label="Pontos de ranking" value={`${number(report.ranking.startPoints)} → ${number(report.ranking.endPoints)}`} detail={`(${signed(report.ranking.pointsDelta)})`} />
          <MetricRow label="Overall" value={`${report.development.startOverall} → ${report.development.endOverall}`} detail={`(${signed(report.development.overallDelta)})`} />
          <MetricRow label="Missões concluídas" value={report.development.missionsCompleted} />
          <MetricRow label="Conquistas" value={report.development.achievementsUnlocked} />
          {topAttributes.map((item) => <MetricRow key={item.key} label={titleCase(item.key.replaceAll('_', ' '))} value={`${item.start} → ${item.end}`} detail={`(${signed(item.delta)})`} />)}
        </Surface>
        <Surface title="Treino e performance" description="Carga aplicada e dados disponíveis da Match Engine" icon={Dumbbell}>
          <MetricRow label="Sessões" value={report.training.sessions} />
          <MetricRow label="Tempo total" value={`${number(report.training.totalMinutes)} min`} />
          <MetricRow label="XP de treino" value={number(report.training.xpEarned)} />
          <MetricRow label="Winners" value={report.performance.winners ?? 'Não registrado'} />
          <MetricRow label="Erros não forçados" value={report.performance.errors ?? 'Não registrado'} />
          <MetricRow label="Aproveitamento na rede" value={report.performance.netSuccessRate === null ? 'Não registrado' : `${report.performance.netSuccessRate}%`} />
        </Surface>
        <Surface title="Saúde e condição" description="Energia, fadiga, lesões e recuperação" icon={HeartPulse}>
          <MetricRow label="Energia" value={`${formatPercent(report.health.startEnergy)} → ${formatPercent(report.health.endEnergy)}`} detail={`(${signed(report.health.energyDelta === null ? null : Math.round(report.health.energyDelta))})`} />
          <MetricRow label="Fadiga" value={`${report.health.startFatigue} → ${report.health.endFatigue}`} detail={`(${signed(report.health.fatigueDelta)})`} />
          <MetricRow label="Ocorrências de lesão" value={report.health.injuries} />
          <MetricRow label="Atendimentos médicos" value={report.health.medicalTreatments} />
          <MetricRow label="Situação ao fechar" value={report.health.endInjury ? report.health.endInjury.type || 'Em recuperação' : 'Sem lesão ativa'} />
        </Surface>
        <Surface title="Finanças e patrocinadores" description="Fluxo de caixa real registrado no período" icon={Coins}>
          <MetricRow label="Receitas" value={number(report.finances.income)} />
          <MetricRow label="Despesas" value={number(report.finances.expenses)} />
          <MetricRow label="Resultado" value={signed(report.finances.net)} />
          <MetricRow label="Variação do caixa" value={signed(report.finances.balanceDelta)} />
          <MetricRow label="Patrocinadores" value={report.sponsors.length} />
          {report.sponsors.map((item) => <div key={item.id} className="mt-2 flex items-center justify-between rounded-xl bg-secondary/35 p-3 text-sm"><strong>{item.name}</strong><span className="font-black text-success">{number(item.monthlyValue)}/mês</span></div>)}
        </Surface>
        <Surface title="Imagem e equipe" description="Imprensa, torcida, dupla e comissão" icon={Users}>
          <MetricRow label="Matérias publicadas" value={report.media.pressArticles} />
          <MetricRow label="Variação de fãs" value={signed(report.media.fansDelta)} />
          <MetricRow label="Popularidade" value={signed(report.media.popularityDelta)} />
          <MetricRow label="Parceiro ao fechar" value={report.relationships.partnerEnd?.name || 'Sem parceiro'} />
          <MetricRow label="Química da dupla" value={signed(report.relationships.chemistryDelta)} />
          <MetricRow label="Treinador" value={report.relationships.coachEnd?.name || 'Sem treinador'} />
          <MetricRow label="Comissão ativa" value={report.relationships.activeStaff.length} />
        </Surface>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface title="Leitura da equipe" description="Insights derivados dos dados persistidos" icon={Lightbulb}><div className="space-y-2">{report.insights?.length ? report.insights.map((item) => <div key={item.title} className="rounded-xl bg-secondary/35 p-3"><strong className="text-sm">{item.title}</strong><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.text}</p></div>) : <p className="text-sm text-muted-foreground">Ainda não há volume suficiente para insights específicos.</p>}</div></Surface>
        <Surface title="Foco para o próximo mês" description="Prioridades objetivas, sem alterar a jogabilidade" icon={Target}><ol className="space-y-2">{report.nextMonthFocus.map((item, index) => <li key={item} className="flex gap-3 rounded-xl bg-primary/5 p-3 text-sm"><span className="font-black text-primary">{index + 1}</span><span>{item}</span></li>)}</ol></Surface>
      </div>

      {report.fallbacks?.length > 0 && <Surface title="Disponibilidade dos dados" description="Transparência sobre métricas não registradas pelos sistemas atuais" icon={Activity}><ul className="space-y-2 text-xs text-muted-foreground">{report.fallbacks.map((item) => <li key={item}>• {item}</li>)}</ul></Surface>}
    </div>
  );
}

export default function MonthlyReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await ensureMyProfile(await localGame.auth.me());
        const rows = await listMonthlyCareerReports(p.id);
        const requestedId = searchParams.get('report');
        const requested = requestedId ? await getMonthlyCareerReport(requestedId, p.id) : null;
        if (!active) return;
        setProfile(p); setReports(rows); setSelected(requested || rows[0] || null);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [searchParams]);

  const selectedId = selected?.id;
  const summary = useMemo(() => reports.reduce((acc, report) => ({ months: acc.months + 1, wins: acc.wins + report.competition.wins, titles: acc.titles + report.competition.titles }), { months: 0, wins: 0, titles: 0 }), [reports]);
  if (loading) return <LoadingScreen />;
  return (
    <Page size="wide"><PageContent>
      <PageHeader eyebrow="Carreira" title="Relatórios mensais" description="Snapshots históricos e imutáveis de sua evolução esportiva, física, financeira e profissional." icon={CalendarRange} action={<Link to="/game" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black"><ArrowLeft className="h-4 w-4" /> Voltar à Home</Link>} stats={[<StatusBadge key="months" tone="brand">{summary.months} mês(es)</StatusBadge>, <StatusBadge key="wins" tone="success">{summary.wins} vitórias</StatusBadge>, <StatusBadge key="titles" tone="premium">{summary.titles} títulos</StatusBadge>]} />
      {!reports.length ? <div className="rounded-3xl border border-dashed border-border p-10 text-center"><Newspaper className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-3 font-black">Nenhum mês encerrado ainda</h2><p className="mt-1 text-sm text-muted-foreground">O primeiro relatório será criado automaticamente quando a carreira entrar em um novo mês.</p></div> : <div className="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]"><aside className="space-y-2 xl:sticky xl:top-4 xl:self-start"><p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Histórico</p>{reports.map((report) => <button type="button" key={report.id} aria-current={selectedId === report.id ? 'true' : undefined} onClick={() => { setSelected(report); setSearchParams({ report: report.id }); }} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === report.id ? 'border-primary/45 bg-primary/10' : 'border-border/65 bg-card/65 hover:border-primary/25'}`}><div className="flex items-center justify-between"><strong className="capitalize">{monthLabel(report.periodKey)}</strong><span className="text-xs font-black text-primary">{report.competition.winRate}%</span></div><p className="mt-2 text-xs text-muted-foreground">{report.competition.wins}V · {report.competition.losses}D · {report.training.sessions} treinos</p><p className="mt-1 text-[10px] text-muted-foreground">Ranking {report.ranking.endPosition ? `#${report.ranking.endPosition}` : '—'} · {signed(report.finances.net)} moedas</p></button>)}</aside>{selected && <ReportDetail report={selected} />}</div>}
    </PageContent></Page>
  );
}
