import React, { useEffect, useState } from 'react';
import { Sun, TrendingUp, MapPin, BarChart3, CloudRain, Wind, Droplets } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, formatDate } from '@/lib/padel';
import { LoadingScreen, PageHeader, EmptyStateCard, GlassCard, FilterPills } from '@/components/padel/ui';
import { getWeatherForecast, getWeatherStats, WEATHER_META, enrichTournamentWeather } from '@/lib/weather';
import WeatherCard from '@/components/weather/WeatherCard';
import { loadModuleTasks } from '@/lib/moduleLoading';

const TABS = [
  { id: 'previsao', label: 'Previsão' },
  { id: 'historico', label: 'Histórico' },
  { id: 'impacto', label: 'Impacto' },
];

export default function Weather() {
  const [tab, setTab] = useState('previsao');
  const [profile, setProfile] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        const { fc, st } = await loadModuleTasks({
          fc: { task: () => getWeatherForecast(p?.career_date, 12), fallback: [], label: 'previsão do tempo' },
          st: { task: () => getWeatherStats(100), fallback: null, label: 'histórico climático' },
        });
        setForecast(fc);
        setStats(st);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={Sun} title="Centro Meteorológico" subtitle="Clima, previsões e impacto no padel" accent="cyan">
        <span className="text-xs text-muted-foreground">{formatDate(profile?.career_date)}</span>
      </PageHeader>

      <FilterPills filters={TABS} activeFilter={tab} onFilterChange={setTab} />

      {tab === 'previsao' && <ForecastTab forecast={forecast} />}
      {tab === 'historico' && <HistoryTab stats={stats} />}
      {tab === 'impacto' && <ImpactTab />}
    </div>
  );
}

// ── Forecast Tab ────────────────────────────────────────────────────────────

function ForecastTab({ forecast }) {
  if (!forecast || forecast.length === 0) {
    return <EmptyStateCard icon={Sun} title="Sem previsões" message="Nenhum torneio próximo no calendário." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="font-bold text-sm">Previsão para Próximos Torneios</h2>
      </div>
      <div className="grid md:grid-cols-2 gap-3 animate-stagger">
        {forecast.map(t => {
          const enriched = enrichTournamentWeather(t);
          return <WeatherCard key={t.id} tournament={enriched} weather={enriched} />;
        })}
      </div>
    </div>
  );
}

// ── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab({ stats }) {
  if (!stats || stats.total === 0) {
    return <EmptyStateCard icon={BarChart3} title="Sem dados históricos" message="Dados climáticos aparecerão conforme torneios forem finalizados." />;
  }

  const conditionEntries = Object.entries(stats.conditions || {}).sort((a, b) => b[1] - a[1]);
  const courtEntries = Object.entries(stats.courts || {}).sort((a, b) => b[1] - a[1]);
  const locationEntries = Object.entries(stats.locations || {}).sort((a, b) => b[1].count - a[1].count).slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <GlassCard>
        <div className="grid grid-cols-3 gap-3">
          <StatBox icon={Sun} label="Temp. Média" value={`${stats.avgTemp}°C`} color="text-yellow-400" />
          <StatBox icon={Droplets} label="Umidade Média" value={`${stats.avgHumidity}%`} color="text-blue-400" />
          <StatBox icon={Wind} label="Vento Médio" value={`${stats.avgWind}km/h`} color="text-cyan-400" />
        </div>
      </GlassCard>

      {/* Condition distribution */}
      <GlassCard>
        <h3 className="font-bold text-sm mb-3">Condições Climáticas</h3>
        <div className="space-y-2">
          {conditionEntries.map(([cond, count]) => {
            const meta = WEATHER_META[cond] || WEATHER_META.ensolarado;
            const pct = Math.round((count / stats.total) * 100);
            return (
              <div key={cond} className="flex items-center gap-3">
                <span className="text-base">{meta.emoji}</span>
                <span className={`text-xs font-bold w-32 ${meta.color}`}>{meta.label}</span>
                <div className="flex-1 h-2 rounded-full bg-secondary/40 overflow-hidden">
                  <div className={`h-full ${meta.bg.replace('/10', '/60')}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{count}x</span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Court conditions */}
      <GlassCard>
        <h3 className="font-bold text-sm mb-3">Condições de Quadra</h3>
        <div className="grid grid-cols-2 gap-2">
          {courtEntries.map(([court, count]) => {
            const pct = Math.round((count / stats.total) * 100);
            return (
              <div key={court} className="flex items-center justify-between p-2 rounded-xl bg-secondary/30">
                <span className="text-xs font-semibold capitalize">{court.replace(/_/g, ' ')}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Location breakdown */}
      <GlassCard>
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Clima por Local</h3>
        <div className="space-y-2">
          {locationEntries.map(([loc, data]) => (
            <div key={loc} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
              <span className="text-xs font-bold flex-1 truncate">{loc}</span>
              <span className="text-xs text-yellow-400 font-semibold tabular-nums">{Math.round(data.tempSum / data.count)}°C</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{data.count} torneio(s)</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

// ── Impact Tab ──────────────────────────────────────────────────────────────

const IMPACT_GUIDE = [
  { icon: Sun, color: 'text-red-400', bg: 'bg-red-500/10', title: 'Calor Extremo (35°C+)', effects: ['Fadiga acelerada +30%', 'Risco de lesão +8%', 'Desgaste energético severo', 'Necessita mais hidratação'] },
  { icon: Wind, color: 'text-cyan-400', bg: 'bg-cyan-500/10', title: 'Vento Forte (35+ km/h)', effects: ['Precisão reduzida -20%', 'Táticos ganham +5 bônus', 'Bola desvia em trajetória', 'Prefira jogo defensivo'] },
  { icon: CloudRain, color: 'text-blue-400', bg: 'bg-blue-500/10', title: 'Chuva / Quadra Molhada', effects: ['Velocidade da bola -15%', 'Risco de escorregão +15%', 'Defensores ganham +5 bônus', 'Jogo mais lento e tático'] },
  { icon: Droplets, color: 'text-teal-400', bg: 'bg-teal-500/10', title: 'Alta Umidade (80%+)', effects: ['Termorregulação prejudicada', 'Fadiga +12%', 'Transpiração excessiva', 'Menor resistência física'] },
  { icon: Sun, color: 'text-yellow-400', bg: 'bg-yellow-500/10', title: 'UV Extremo (9+)', effects: ['Desgaste adicional +5%', 'Necessita proteção solar', 'Pode afetar visibilidade', 'Risco de exaustão térmica'] },
  { icon: CloudRain, color: 'text-purple-400', bg: 'bg-purple-500/10', title: 'Tempestade', effects: ['Precisão -25%', 'Velocidade -10%', 'Risco de lesão +10%', 'Jogo altamente imprevisível'] },
];

function ImpactTab() {
  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">🌡️</span>
          <h3 className="font-bold text-sm">Como o Clima Afeta sua Preparação</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          As condições climáticas impactam diretamente o desempenho em quadra. Cada torneio possui clima próprio baseado na localização e época do ano. Adapte sua preparação física, tática e equipamentos para maximizar resultados.
        </p>
      </GlassCard>

      <div className="grid sm:grid-cols-2 gap-3 animate-stagger">
        {IMPACT_GUIDE.map((item, i) => (
          <div key={i} className="glass rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <h4 className="font-bold text-xs">{item.title}</h4>
            </div>
            <ul className="space-y-1">
              {item.effects.map((eff, j) => (
                <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <span className={`shrink-0 ${item.color}`}>•</span> {eff}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <GlassCard className="border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">🧠</span>
          <h4 className="font-bold text-xs text-primary">Dicas de Preparação</h4>
        </div>
        <ul className="space-y-1.5">
          <li className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-primary shrink-0">→</span> Em calor extremo, treine resistência e gerencie energia entre os pontos.</li>
          <li className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-primary shrink-0">→</span> Com vento forte, use táticas de precisão em vez de potência.</li>
          <li className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-primary shrink-0">→</span> Em quadras molhadas, priorize defesa e evite movimentos bruscos.</li>
          <li className="text-xs text-muted-foreground flex items-start gap-2"><span className="text-primary shrink-0">→</span> Consulte sempre a previsão antes de torneios para adaptar equipamentos.</li>
        </ul>
      </GlassCard>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-secondary/30">
      <Icon className={`h-5 w-5 ${color}`} />
      <span className="text-lg font-black tabular-nums">{value}</span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}
