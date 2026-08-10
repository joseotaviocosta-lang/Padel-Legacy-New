import React from 'react';
import { Activity, ArrowUpRight, Brain, Flame, Shield, Sparkles, Star, Trophy, Zap } from 'lucide-react';
import { buildMatchRecap } from '@/lib/matchExperience.js';

const ICONS = { rally: Activity, smash: Zap, break: Shield, streak: Flame, comeback: ArrowUpRight, mvp: Star };

export default function MatchRecapPremium({ matchState, title, rewards = null, nextAction = null, onNextAction = null }) {
  const recap = buildMatchRecap(matchState);
  if (!recap) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background/95 via-background/90 to-primary/5 shadow-lg">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Resumo premium da partida</p>
          <h3 className="mt-0.5 text-base font-black">{title || (recap.wonByPlayer ? 'Vitória da sua dupla' : 'Fim da partida')}</h3>
          <p className="text-[10px] text-muted-foreground">Sets: {recap.score || `${matchState.setsA}-${matchState.setsB}`}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${recap.wonByPlayer ? 'bg-amber-500/15 text-amber-300' : 'bg-secondary text-muted-foreground'}`}>
          <Trophy className="h-5 w-5" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        {recap.highlights.map((item) => {
          const Icon = ICONS[item.icon] || Sparkles;
          return (
            <div key={`${item.title}-${item.value}`} className="rounded-xl border border-border/40 bg-secondary/25 p-3">
              <Icon className="mb-2 h-4 w-4 text-primary" />
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{item.title}</p>
              <p className="mt-0.5 text-xs font-black">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-border/40">
        <div className="grid grid-cols-[4rem_1fr_4rem] bg-secondary/35 px-3 py-2 text-center text-[8px] font-black uppercase tracking-wider text-muted-foreground">
          <span>Você</span><span>Partida</span><span>Rivais</span>
        </div>
        <RecapRow a={recap.stats.A.winners} label="Winners" b={recap.stats.B.winners} />
        <RecapRow a={recap.stats.A.forcedErrorsDrawn} label="Erros forçados conquistados" b={recap.stats.B.forcedErrorsDrawn} />
        <RecapRow a={recap.stats.A.unforcedErrors} label="Erros não forçados" b={recap.stats.B.unforcedErrors} />
        <RecapRow a={`${recap.stats.A.netPointWinShare}%`} label="Pontos ganhos na rede" b={`${recap.stats.B.netPointWinShare}%`} />
        <RecapRow a={`${recap.stats.A.breaks}/${recap.stats.A.breakChances}`} label="Break points" b={`${recap.stats.B.breaks}/${recap.stats.B.breakChances}`} />
        <RecapRow a={recap.stats.A.breakPointsSaved} label="Break points salvos" b={recap.stats.B.breakPointsSaved} />
        <RecapRow a={`${recap.stats.longestRally}`} label="Maior rally" b={`${recap.stats.averageRally} méd.`} />
      </div>

      <div className="mx-3 mb-3 grid grid-cols-2 gap-2">
        <MetricCard label="Mais winners" value={`${recap.topWinner?.name || '—'} · ${recap.topWinner?.winners || 0}`} />
        <MetricCard label="Mais erros não forçados" value={`${recap.topError?.name || '—'} · ${recap.topError?.unforcedErrors || 0}`} />
      </div>

      <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-border/40">
        <div className="bg-secondary/35 px-3 py-2 text-[8px] font-black uppercase tracking-wider text-muted-foreground">Golpes · tentativas / winners / erros forçados / erros</div>
        <div className="grid grid-cols-2 divide-x divide-border/30">
          <ShotImpactRows title="Você" rows={recap.shotImpact.A} />
          <ShotImpactRows title="Rivais" rows={recap.shotImpact.B} />
        </div>
      </div>

      <div className="mx-3 mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /><p className="text-[10px] font-black">Leitura da partida</p></div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          {recap.momentum?.swings > 1
            ? `Partida com ${recap.momentum.swings} mudanças de momentum.`
            : recap.momentum?.leader === 'A'
              ? 'Sua dupla terminou controlando o momento emocional.'
              : recap.momentum?.leader === 'B'
                ? 'Os rivais terminaram com maior domínio emocional; vale revisar os pontos decisivos.'
                : 'O equilíbrio emocional permaneceu alto até o fim.'}
        </p>
      </div>

      {recap.coachImpact && (
        <div className="mx-3 mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-[10px] font-black">Impacto da sugestão aceita</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Aproveitamento: {recap.coachImpact.before.pointWinRate}% → {recap.coachImpact.after.pointWinRate}% · Erros: {recap.coachImpact.before.errors} → {recap.coachImpact.after.errors}.
          </p>
        </div>
      )}

      {rewards && <div className="mx-3 mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(rewards).filter(([, value]) => value !== null && value !== undefined).map(([label, value]) => <MetricCard key={label} label={label} value={value} centered />)}</div>}
      {nextAction && onNextAction && <div className="border-t border-border/40 p-3"><button type="button" onClick={onNextAction} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground">{nextAction} <ArrowUpRight className="h-3.5 w-3.5" /></button></div>}
    </section>
  );
}

function RecapRow({ a, label, b }) {
  return <div className="grid grid-cols-[4rem_1fr_4rem] items-center border-t border-border/30 px-3 py-2 text-center"><strong className="text-xs tabular-nums text-primary">{a}</strong><span className="text-[9px] font-semibold text-muted-foreground">{label}</span><strong className="text-xs tabular-nums text-amber-400">{b}</strong></div>;
}

function MetricCard({ label, value, centered = false }) {
  return <div className={`rounded-xl border border-border/40 bg-secondary/25 p-3 ${centered ? 'text-center' : ''}`}><p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xs font-black">{value}</p></div>;
}

function ShotImpactRows({ title, rows }) {
  return <div className="p-2"><p className="mb-1 text-[8px] font-black uppercase text-muted-foreground">{title}</p>{rows.slice().sort((a, b) => b.attempts - a.attempts).slice(0, 5).map((row) => <div key={row.shot} className="flex items-center justify-between gap-2 py-1 text-[9px]"><span className="capitalize text-muted-foreground">{row.shot}</span><strong className="tabular-nums">{row.attempts}/{row.winners}/{row.forcedErrorsDrawn}/{row.errors}</strong></div>)}</div>;
}
