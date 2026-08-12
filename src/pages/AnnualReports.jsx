import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, ArrowRight, Award, BarChart3, CalendarRange, Coins, Crown,
  Dumbbell, Globe2, HeartPulse, Medal, Newspaper, ShieldCheck, Sparkles,
  Star, Target, TrendingDown, TrendingUp, Trophy, Users, Zap,
} from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel.js';
import { getAnnualCareerReport, listAnnualCareerReports } from '@/game-core/annualCareerReportLifecycle.js';
import { Page, PageContent, PageHeader, StatCard, StatusBadge } from '@/components/design-system';
import { LoadingScreen } from '@/components/padel/ui';

const number = (value) => Number(value || 0).toLocaleString('pt-BR');
const money = (value) => `${Number(value || 0) < 0 ? '-' : ''}R$ ${Math.abs(Number(value || 0)).toLocaleString('pt-BR')}`;
const signed = (value) => value == null ? '—' : `${Number(value) > 0 ? '+' : ''}${number(value)}`;
const rank = (value) => value ? `#${number(value)}` : '—';
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const resultLabel = { champion: 'Campeão', runner_up: 'Vice', semifinal: 'Semifinal', quarterfinal: 'Quartas', round_of_16: 'Oitavas', early_exit: 'Eliminação precoce' };

function Surface({ id = undefined, title, description, icon: Icon, children, className = '' }) {
  return (
    <section id={id} className={`scroll-mt-24 rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4.5 w-4.5" /></span>
        <div><h2 className="font-black">{title}</h2>{description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function Metric({ label: metricLabel, value, detail = null, tone = '' }) {
  return <div className="flex items-center justify-between gap-3 border-b border-border/45 py-2.5 last:border-0"><span className="text-xs text-muted-foreground">{metricLabel}</span><span className={`text-right text-sm font-black ${tone}`}>{value}{detail && <small className="ml-1 font-semibold text-muted-foreground">{detail}</small>}</span></div>;
}

function RankingList({ items = [], mode = 'ranking', limit = 10 }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Dados insuficientes nesta temporada.</p>;
  return <div className="space-y-1.5">{items.slice(0, limit).map((item, index) => (
    <div key={item.id || item.teamKey || `${item.name}-${index}`} className="flex items-center gap-3 rounded-xl bg-secondary/35 px-3 py-2.5">
      <span className="w-7 text-center text-xs font-black text-primary">{index + 1}</span>
      <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.name}</strong><span className="text-[10px] text-muted-foreground">{item.country || `${item.matches || 0} partidas`}</span></div>
      {mode === 'ranking' && <div className="text-right"><strong className="text-sm">{rank(item.endRanking)}</strong><small className={`block ${item.positionChange > 0 ? 'text-success' : item.positionChange < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{item.positionChange > 0 ? '▲' : item.positionChange < 0 ? '▼' : '•'}{number(Math.abs(item.positionChange || 0))}</small></div>}
      {mode === 'overall' && <div className="text-right"><strong className="text-sm">{item.startOverall} → {item.endOverall}</strong><small className="block text-success">+{number(item.technicalDelta)}</small></div>}
      {mode === 'wins' && <div className="text-right"><strong className="text-sm">{item.wins}V</strong><small className="block text-muted-foreground">{item.winRate}%</small></div>}
      {mode === 'titles' && <div className="text-right"><strong className="text-sm">{item.titles} tít.</strong><small className="block text-muted-foreground">{item.wins}V</small></div>}
    </div>
  ))}</div>;
}

function MiniTrend({ items = [], invert = false, formatter = number }) {
  const valid = items.filter((item) => item.value != null && Number.isFinite(Number(item.value)));
  if (!valid.length) return <p className="text-sm text-muted-foreground">Série mensal indisponível.</p>;
  const values = valid.map((item) => Number(item.value));
  const low = Math.min(...values); const high = Math.max(...values); const range = Math.max(1, high - low);
  return <div className="flex h-32 items-end gap-1.5" aria-label="Evolução mensal">{valid.map((item) => {
    const ratio = invert ? (high - Number(item.value)) / range : (Number(item.value) - low) / range;
    return <div key={item.month} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="invisible text-[9px] font-bold group-hover:visible">{formatter(item.value)}</span><div className="w-full rounded-t bg-gradient-to-t from-primary/45 to-primary" style={{ height: `${22 + ratio * 70}px` }} /><span className="text-[8px] uppercase text-muted-foreground">{String(item.month).slice(5)}</span></div>;
  })}</div>;
}

function AwardCard({ eyebrow, item, children }) {
  return <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-card p-4"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-400">{eyebrow}</p><h3 className="mt-1 text-lg font-black">{item?.name || 'Não definido'}</h3>{item && children}</div>;
}

function AnnualReportDetail({ report }) {
  const attributes = [...(report.attributes?.items || [])].sort((a, b) => b.delta - a.delta);
  const top10 = report.circuitSummary?.finalTop10 || [];
  return (
    <div className="min-w-0 space-y-4">
      <section className="overflow-hidden rounded-3xl border border-amber-400/35 bg-gradient-to-br from-amber-500/20 via-card to-primary/15 p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-400">Temporada {report.year}</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">Seu ano em números</h1><p className="mt-2 text-xs text-muted-foreground">01/01/{report.year} a 31/12/{report.year} · snapshot imutável</p></div>
          <StatusBadge tone="premium" icon={Sparkles} className="">{report.playerSummary.badge}</StatusBadge>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
          <StatCard label="Ranking" value={`${rank(report.playerSummary.rankingStart)} → ${rank(report.playerSummary.rankingEnd)}`} detail={`${signed(report.playerSummary.rankingPositionsGained)} posições`} icon={TrendingUp} tone="success" trend={null} className="" valueFormatter={null} />
          <StatCard label="OVR" value={`${report.playerSummary.overallStart} → ${report.playerSummary.overallEnd}`} detail={`${signed(report.playerSummary.overallGained)} no ano`} icon={Zap} tone="premium" trend={null} className="" valueFormatter={null} />
          <StatCard label="Títulos" value={report.playerSummary.titles} detail={`${report.sportingResults.wins} vitórias`} icon={Trophy} tone="premium" trend={null} className="" valueFormatter={null} />
          <StatCard label="Fãs" value={number(report.playerSummary.fansEnd)} detail={`${signed(report.playerSummary.fansGained)} no ano`} icon={Users} tone="brand" trend={null} className="" valueFormatter={null} />
          <StatCard label="Patrimônio" value={money(report.playerSummary.balanceEnd)} detail={`${signed(report.playerSummary.balanceDelta)} no ano`} icon={Coins} tone={report.playerSummary.balanceDelta >= 0 ? 'success' : 'warning'} trend={null} className="" valueFormatter={null} />
          <StatCard label="Aproveitamento" value={`${report.sportingResults.winRate}%`} detail={`${report.sportingResults.wins}V · ${report.sportingResults.losses}D`} icon={Target} tone="brand" trend={null} className="" valueFormatter={null} />
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-border/60 bg-card/60 p-2 text-[10px] font-black uppercase tracking-wide">
        {[['results', 'Sua temporada'], ['evolution', 'Evolução'], ['finances', 'Finanças'], ['circuit', 'Circuito mundial'], ['awards', 'Prêmios'], ['timeline', 'Retrospectiva']].map(([id, text]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-lg px-3 py-2 text-muted-foreground hover:bg-primary/10 hover:text-primary">{text}</a>)}
      </nav>

      <div id="results" className="grid scroll-mt-24 gap-4 xl:grid-cols-2">
        <Surface title="Resumo esportivo" description="Resultados oficiais da temporada" icon={Trophy}>
          <Metric label="Partidas" value={report.sportingResults.matches} />
          <Metric label="Campanha" value={`${report.sportingResults.wins}V · ${report.sportingResults.losses}D`} detail={`${report.sportingResults.winRate}%`} />
          <Metric label="Sets" value={`${report.sportingResults.setsWon} ganhos · ${report.sportingResults.setsLost} perdidos`} />
          <Metric label="Games" value={`${report.sportingResults.gamesWon} ganhos · ${report.sportingResults.gamesLost} perdidos`} />
          <Metric label="Pódios" value={`${report.sportingResults.titles} títulos · ${report.sportingResults.runnerUps} vices`} />
          <Metric label="Melhor sequência" value={`${report.sportingResults.bestWinStreak} vitórias`} tone="text-success" />
          <Metric label="Maior sequência negativa" value={`${report.sportingResults.worstLossStreak} derrotas`} />
        </Surface>
        <Surface title="Grandes momentos" description="Campanha e partida que marcaram o ano" icon={Award}>
          {report.bestTournament ? <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-amber-400">Melhor campanha</p><h3 className="mt-1 font-black">{report.bestTournament.name}</h3><p className="mt-1 text-xs text-muted-foreground">{resultLabel[report.bestTournament.result] || 'Destaque'} · {money(report.bestTournament.prize)} · +{number(report.bestTournament.rankingPoints)} pts</p></div> : <p className="text-sm text-muted-foreground">Nenhum torneio registrado.</p>}
          {report.bestMatch && <div className="mt-3 rounded-xl bg-secondary/35 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-primary">Partida do ano</p><h3 className="mt-1 font-black">{report.bestMatch.tournament || 'Partida oficial'}</h3><p className="mt-1 text-xs text-muted-foreground">{report.bestMatch.round || 'Fase não informada'} · vs {report.bestMatch.opponents || 'adversários'} · {report.bestMatch.score || 'placar preservado no histórico'}</p></div>}
          {report.difficultMoment && <div className="mt-3 rounded-xl border border-orange-500/20 bg-orange-500/5 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-orange-400">Ponto de atenção</p><p className="mt-1 text-xs text-muted-foreground">{report.difficultMoment.text}</p></div>}
        </Surface>
      </div>

      <Surface title="Torneios disputados" description="Linha do tempo completa de campanhas, parceiros e recompensas" icon={CalendarRange}>
        {report.tournaments?.length ? <div className="grid gap-2 md:grid-cols-2">{report.tournaments.map((item) => <div key={item.id} className="rounded-xl bg-secondary/35 p-3"><div className="flex items-start justify-between gap-2"><div><strong className="text-sm">{item.name}</strong><p className="mt-0.5 text-[10px] text-muted-foreground">{item.date} · {item.category || 'Categoria não registrada'} · {item.partner || 'Parceiro não registrado'}</p></div><StatusBadge tone={item.result === 'champion' ? 'premium' : item.result === 'runner_up' ? 'brand' : 'neutral'} icon={null} className="">{resultLabel[item.result] || `${item.wins}/${item.matches}V`}</StatusBadge></div><p className="mt-2 text-[10px] text-muted-foreground">{item.opponent ? `Decisão vs ${item.opponent}` : 'Adversário decisivo não registrado'} · {money(item.prize)} · +{number(item.rankingPoints)} pts</p></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum torneio concluído nesta temporada.</p>}
      </Surface>

      <div id="evolution" className="grid scroll-mt-24 gap-4 xl:grid-cols-2">
        <Surface title="Evolução no ranking" description={`${rank(report.ranking.startPosition)} → ${rank(report.ranking.endPosition)} · melhor ${rank(report.ranking.bestPosition)}`} icon={BarChart3}>
          <MiniTrend items={report.ranking.progression} invert formatter={rank} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl bg-success/10 p-3"><p className="text-[9px] uppercase text-muted-foreground">Posições ganhas</p><strong className="text-success">{signed(report.ranking.positionsGained)}</strong></div><div className="rounded-xl bg-primary/10 p-3"><p className="text-[9px] uppercase text-muted-foreground">Pontos</p><strong>{signed(report.ranking.pointsDelta)}</strong></div></div>
        </Surface>
        <Surface title="Evolução de atributos" description={`OVR ${report.attributes.startOverall} → ${report.attributes.endOverall}`} icon={Zap}>
          <div className="grid grid-cols-2 gap-x-4">{attributes.map((item) => <Metric key={item.key} label={label(item.key)} value={`${item.start} → ${item.end}`} detail={`(${signed(item.delta)})`} tone={item.delta > 0 ? 'text-success' : ''} />)}</div>
          {report.attributes.biggestGain && <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-primary">Maior evolução</p><strong>{label(report.attributes.biggestGain.key)} · +{report.attributes.biggestGain.delta}</strong></div>}
        </Surface>
        <Surface title="Experiência e treinos" description="Rotina de desenvolvimento no ano" icon={Dumbbell}>
          <Metric label="XP" value={`${number(report.careerExperience.xpStart)} → ${number(report.careerExperience.xpEnd)}`} detail={`(${signed(report.careerExperience.xpGained)})`} />
          <Metric label="Missões concluídas" value={report.careerExperience.missionsCompleted} />
          <Metric label="Conquistas" value={report.careerExperience.achievementsUnlocked} />
          <Metric label="Sessões de treino" value={report.training.sessions} detail={`${report.training.monthlyAverage}/mês`} />
          <Metric label="Tempo total" value={`${number(report.training.totalMinutes)} min`} />
          <Metric label="Treino mais usado" value={report.training.mostUsedType ? label(report.training.mostUsedType[0]) : '—'} />
          <Metric label="Atributo mais treinado" value={report.training.mostTrainedAttribute ? label(report.training.mostTrainedAttribute[0]) : '—'} />
        </Surface>
        <Surface title="Saúde física" description="Carga, recuperação e ocorrências" icon={HeartPulse}>
          <Metric label="Energia" value={`${report.health.energyStart} → ${report.health.energyEnd}`} detail={report.health.averageEnergy == null ? 'média indisponível' : `média ${report.health.averageEnergy}`} />
          <Metric label="Fadiga" value={`${report.health.fatigueStart} → ${report.health.fatigueEnd}`} detail={report.health.peakFatigue == null ? 'pico indisponível' : `pico ${report.health.peakFatigue}`} />
          <Metric label="Lesões" value={report.health.injuries} />
          <Metric label="Dias afastado" value={report.health.daysOut} />
          <Metric label="Estado ao fechar" value={report.health.endInjury ? report.health.endInjury.type || 'Em recuperação' : 'Disponível'} />
        </Surface>
      </div>

      <div id="finances" className="grid scroll-mt-24 gap-4 xl:grid-cols-2">
        <Surface title="Finanças anuais" description="Fluxo consolidado da temporada" icon={Coins}>
          <Metric label="Saldo inicial" value={money(report.finances.startBalance)} />
          <Metric label="Receitas" value={money(report.finances.income)} tone="text-success" />
          <Metric label="Despesas" value={money(report.finances.expenses)} />
          <Metric label="Resultado" value={money(report.finances.net)} tone={report.finances.net >= 0 ? 'text-success' : 'text-destructive'} />
          <Metric label="Saldo final" value={money(report.finances.endBalance)} />
          <Metric label="Maior fonte de receita" value={report.finances.largestIncomeSource ? label(report.finances.largestIncomeSource[0]) : '—'} detail={report.finances.largestIncomeSource ? money(report.finances.largestIncomeSource[1]) : ''} />
          <Metric label="Maior despesa" value={report.finances.largestExpense ? label(report.finances.largestExpense[0]) : '—'} detail={report.finances.largestExpense ? money(report.finances.largestExpense[1]) : ''} />
        </Surface>
        <Surface title="Torcida e imagem" description="Fãs, popularidade, reputação e imprensa" icon={Users}>
          <Metric label="Fãs" value={`${number(report.fans.start)} → ${number(report.fans.end)}`} detail={`(${signed(report.fans.gained)})`} />
          <Metric label="Popularidade" value={`${number(report.fans.popularityStart)} → ${number(report.fans.popularityEnd)}`} detail={`(${signed(report.fans.popularityDelta)})`} />
          <Metric label="Reputação" value={`${number(report.fans.reputationStart)} → ${number(report.fans.reputationEnd)}`} detail={`(${signed(report.fans.reputationDelta)})`} />
          <Metric label="Matérias / entrevistas" value={`${report.press.articles} / ${report.press.interviews}`} />
          <Metric label="Impacto de imprensa" value={`${report.press.positiveImpact} positivo · ${report.press.negativeImpact} negativo`} />
          <Metric label="Patrocinadores" value={`${report.sponsors.start} → ${report.sponsors.end}`} detail={`${report.sponsors.newSponsors.length} novo(s)`} />
        </Surface>
        <Surface title="Dupla e comissão" description="Relações profissionais que sustentaram a temporada" icon={Users} className="xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-2"><div><Metric label="Parceiro inicial" value={report.partnership.start?.name || 'Sem parceiro'} /><Metric label="Parceiro final" value={report.partnership.end?.name || 'Sem parceiro'} /><Metric label="Trocas no ano" value={report.partnership.changes} />{report.partnership.best && <div className="mt-3 rounded-xl bg-primary/5 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-primary">Sua melhor parceria</p><strong>{report.partnership.best.name}</strong><p className="mt-1 text-xs text-muted-foreground">{report.partnership.best.matches} partidas · {report.partnership.best.wins} vitórias · {report.partnership.best.titles} títulos · {report.partnership.best.chemistry}% entrosamento</p></div>}</div><div><Metric label="Treinador final" value={report.staff.finalCoach?.name || 'Sem treinador'} /><Metric label="Treinadores utilizados" value={report.staff.coachesUsed.length} /><Metric label="Membros da comissão" value={report.staff.members.length} /><Metric label="Custo registrado" value={money(report.staff.totalCost)} /></div></div>
        </Surface>
      </div>

      <section id="circuit" className="scroll-mt-24 space-y-4 rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Globe2 className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Parte 2</p><h2 className="text-xl font-black">Relatório global do circuito</h2><p className="text-xs text-muted-foreground">Como o mundo do padel terminou a temporada {report.year}</p></div></div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Surface title={`Top ${top10.length} do mundo`} description="Ranking final e variação anual" icon={Crown}><RankingList items={top10} /></Surface>
          <Surface title="Nº 1 do mundo" description="Líder ao final de 31 de dezembro" icon={Medal}>{report.circuitSummary.worldNumberOne ? <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-center"><Crown className="mx-auto h-8 w-8 text-amber-400" /><h3 className="mt-2 text-2xl font-black">{report.circuitSummary.worldNumberOne.name}</h3><p className="text-xs text-muted-foreground">{report.circuitSummary.worldNumberOne.country || 'País não informado'} · {report.circuitSummary.worldNumberOne.age || '—'} anos</p><div className="mt-3 flex justify-center gap-4 text-xs"><span>{report.circuitSummary.worldNumberOne.wins}V</span><span>{report.circuitSummary.worldNumberOne.titles} títulos</span><span>{report.circuitSummary.worldNumberOne.winRate}%</span></div></div> : <p className="text-sm text-muted-foreground">Ranking global indisponível.</p>}</Surface>
        </div>
      </section>

      <div id="awards" className="grid scroll-mt-24 gap-4 lg:grid-cols-3">
        <AwardCard eyebrow="Jogador do ano" item={report.circuitSummary.playerOfTheYear}>{<><p className="mt-2 text-xs text-muted-foreground">{report.circuitSummary.playerOfTheYear.reasons?.join(' · ')}</p><p className="mt-2 text-[9px] text-muted-foreground">{report.circuitSummary.playerOfTheYear.criteria}</p></>}</AwardCard>
        <AwardCard eyebrow="Maior evolução" item={report.circuitSummary.mostImproved?.[0]}>{report.circuitSummary.mostImproved?.[0] && <p className="mt-2 text-xs text-muted-foreground">OVR {report.circuitSummary.mostImproved[0].startOverall} → {report.circuitSummary.mostImproved[0].endOverall} · +{report.circuitSummary.mostImproved[0].technicalDelta}</p>}</AwardCard>
        <AwardCard eyebrow="Revelação do ano" item={report.circuitSummary.revelation}>{report.circuitSummary.revelation && <><p className="mt-2 text-xs text-muted-foreground">{report.circuitSummary.revelation.age} anos · {rank(report.circuitSummary.revelation.startRanking)} → {rank(report.circuitSummary.revelation.endRanking)} · OVR +{report.circuitSummary.revelation.technicalDelta}</p><p className="mt-2 text-[9px] text-muted-foreground">{report.circuitSummary.revelation.criteria}</p></>}</AwardCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Surface title="Maiores ascensões" description="Variação absoluta entre 01/01 e 31/12" icon={TrendingUp}><RankingList items={report.circuitSummary.biggestClimbers} /></Surface>
        <Surface title="Maiores quedas" description="Movimentos que mudaram o circuito" icon={TrendingDown}><RankingList items={report.circuitSummary.biggestFallers} /></Surface>
        <Surface title="Maiores evoluções técnicas" description="Diferença objetiva de OVR" icon={Zap}><RankingList items={report.circuitSummary.mostImproved} mode="overall" /></Surface>
        <Surface title="Mais vitórias" description={`Melhor aproveitamento exige ${report.circuitSummary.criteria.winRateMinimumMatches} partidas`} icon={Trophy}><RankingList items={report.circuitSummary.mostWins} mode="wins" /></Surface>
        <Surface title="Maiores campeões" description="Títulos conquistados durante a temporada" icon={Medal}><RankingList items={report.circuitSummary.mostTitles} mode="titles" /></Surface>
        <Surface title="Dupla do ano" description="Títulos, vitórias e pontos conquistados" icon={Users}>{report.circuitSummary.bestPair ? <><h3 className="text-xl font-black">{report.circuitSummary.bestPair.name}</h3><div className="mt-3"><Metric label="Campanha" value={`${report.circuitSummary.bestPair.wins}V · ${report.circuitSummary.bestPair.losses}D`} detail={`${report.circuitSummary.bestPair.winRate}%`} /><Metric label="Títulos" value={report.circuitSummary.bestPair.titles} /><Metric label="Ranking final" value={rank(report.circuitSummary.bestPair.endRanking)} /><Metric label="Pontos ganhos" value={signed(report.circuitSummary.bestPair.pointsGained)} /></div></> : <p className="text-sm text-muted-foreground">Parcerias globais insuficientes.</p>}</Surface>
        <Surface title="Jovens para ficar de olho" description="Atletas de até 23 anos" icon={Star}><RankingList items={report.circuitSummary.youngBreakouts} mode="overall" limit={5} /></Surface>
        <Surface title="Recordes da temporada" description="Marcas consolidadas no snapshot final" icon={Award}><div className="space-y-2">{report.circuitSummary.records.map((item) => <div key={item.label} className="flex justify-between rounded-xl bg-secondary/35 p-3 text-sm"><span><strong>{item.label}</strong><small className="ml-2 text-muted-foreground">{item.holder}</small></span><strong className="text-primary">{item.value}</strong></div>)}</div></Surface>
      </div>

      <Surface id="timeline" title="Retrospectiva mês a mês" description="Os acontecimentos que desenharam a temporada" icon={CalendarRange}>
        {report.monthlyTimeline?.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{report.monthlyTimeline.map((item) => <div key={item.month} className="rounded-xl bg-secondary/35 p-3"><div className="flex justify-between"><strong>{new Date(`${item.month}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase()}</strong><span className="text-xs font-black text-primary">{rank(item.ranking)}</span></div><p className="mt-2 text-xs">{item.highlight}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.wins}V · {item.losses}D · {item.titles} título(s)</p></div>)}</div> : <p className="text-sm text-muted-foreground">A retrospectiva será formada conforme os relatórios mensais forem concluídos.</p>}
      </Surface>

      {report.yearComparison && <Surface title={`${report.yearComparison.year} vs ${report.year}`} description="Comparação com a temporada anterior" icon={BarChart3}><div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(report.yearComparison).filter(([key]) => key !== 'year').map(([key, item]) => <Metric key={key} label={label(key)} value={`${number(item.previous)} → ${number(item.current)}`} detail={`(${signed(numericDelta(item))})`} />)}</div></Surface>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface title="Auditoria de consistência" description={`${report.audit.monthlyReports}/12 relatórios mensais · fonte: ${report.audit.source}`} icon={ShieldCheck}><div className="space-y-1">{report.audit.checks.map((item) => <Metric key={item.metric} label={label(item.metric)} value={item.applicable ? (item.difference === 0 ? 'Confere' : `Diferença ${signed(item.difference)}`) : 'Não aplicável'} tone={item.applicable && item.difference === 0 ? 'text-success' : ''} />)}</div></Surface>
        <Surface title="Disponibilidade dos dados" description="Métricas adaptadas sem inventar informação" icon={Activity}>{report.fallbacks?.length ? <ul className="space-y-2 text-xs text-muted-foreground">{report.fallbacks.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="text-sm text-success">Todos os blocos essenciais tiveram dados suficientes.</p>}</Surface>
      </div>
    </div>
  );
}

function numericDelta(item) { return Number(item?.current || 0) - Number(item?.previous || 0); }

export default function AnnualReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await ensureMyProfile(await localGame.auth.me());
        const rows = await listAnnualCareerReports(profile.id);
        const requestedId = searchParams.get('report');
        const requested = requestedId ? await getAnnualCareerReport(requestedId, profile.id) : null;
        if (active) { setReports(rows); setSelected(requested || rows[0] || null); }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [searchParams]);
  const summary = useMemo(() => reports.reduce((acc, report) => ({ seasons: acc.seasons + 1, titles: acc.titles + Number(report.sportingResults?.titles || 0), wins: acc.wins + Number(report.sportingResults?.wins || 0) }), { seasons: 0, titles: 0, wins: 0 }), [reports]);
  if (loading) return <LoadingScreen />;
  return <Page size="wide" className=""><PageContent className="">
    <PageHeader eyebrow="Carreira" title="Relatórios anuais" description="O fechamento imutável de cada temporada da sua carreira e do circuito mundial." icon={Globe2} action={<Link to="/game" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-black"><ArrowLeft className="h-4 w-4" /> Voltar à Home</Link>} stats={[<StatusBadge key="seasons" tone="brand" icon={null} className="">{summary.seasons} temporada(s)</StatusBadge>, <StatusBadge key="wins" tone="success" icon={null} className="">{summary.wins} vitórias</StatusBadge>, <StatusBadge key="titles" tone="premium" icon={null} className="">{summary.titles} títulos</StatusBadge>]} breadcrumb={[]} className="" />
    {!reports.length ? <div className="rounded-3xl border border-dashed border-border p-10 text-center"><Newspaper className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-3 font-black">Nenhuma temporada encerrada ainda</h2><p className="mt-1 text-sm text-muted-foreground">O primeiro relatório será criado automaticamente na transição de 31/12 para 01/01.</p></div> : <div className="grid min-w-0 gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]"><aside className="space-y-2 xl:sticky xl:top-4 xl:self-start"><p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Relatórios anuais</p>{reports.map((report) => <button type="button" key={report.id} aria-current={selected?.id === report.id ? 'true' : undefined} onClick={() => { setSelected(report); setSearchParams({ report: report.id }); }} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === report.id ? 'border-amber-400/45 bg-amber-500/10' : 'border-border/65 bg-card/65 hover:border-primary/25'}`}><div className="flex items-center justify-between"><strong>Temporada {report.year}</strong><Crown className="h-4 w-4 text-amber-400" /></div><p className="mt-2 text-xs text-muted-foreground">Ranking final {rank(report.ranking?.endPosition)} · {report.sportingResults?.titles || 0} títulos</p><p className="mt-1 text-[10px] text-muted-foreground">{report.sportingResults?.wins || 0}V · {money(report.finances?.net)} · {signed(report.fans?.gained)} fãs</p><span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-primary">Abrir relatório <ArrowRight className="h-3 w-3" /></span></button>)}</aside>{selected && <AnnualReportDetail report={selected} />}</div>}
  </PageContent></Page>;
}
