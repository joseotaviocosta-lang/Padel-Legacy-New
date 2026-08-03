import React from 'react';
import { Sun, CloudSun, Cloud, CloudRain, Wind, CloudLightning, CloudFog, ThermometerSun, Snowflake, Droplets, Eye, AlertTriangle } from 'lucide-react';
import { WEATHER_META, COURT_META, computeWeatherImpact } from '@/lib/weather';

const ICON_MAP = {
  Sun, CloudSun, Cloud, CloudRain, Wind, CloudLightning, CloudFog, ThermometerSun, Snowflake,
};

export default function WeatherCard({ weather, tournament, compact = false }) {
  if (!weather && !tournament) return null;

  const w = weather || (tournament ? {
    temperature: tournament.temperature,
    humidity: tournament.humidity,
    wind_speed: tournament.wind_speed,
    wind_direction: tournament.wind_direction,
    weather_condition: tournament.weather_condition,
    court_condition: tournament.court_condition,
    uv_index: tournament.uv_index,
    visibility_km: tournament.visibility_km,
  } : null);

  if (!w) return null;

  const meta = WEATHER_META[w.weather_condition] || WEATHER_META.ensolarado;
  const Icon = ICON_MAP[meta.icon] || Sun;
  const court = COURT_META[w.court_condition] || COURT_META.seca;
  const impact = computeWeatherImpact(w);

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl ${meta.bg} border border-border/40`}>
        <span className="text-base">{meta.emoji}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-bold ${meta.color}`}>{Math.round(w.temperature || 20)}°C</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground flex items-center gap-0.5"><Droplets className="h-3 w-3" />{w.humidity || 50}%</span>
          <span className="text-muted-foreground flex items-center gap-0.5"><Wind className="h-3 w-3" />{w.wind_speed || 0}km/h</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass rounded-2xl p-5 border ${meta.border} ${meta.bg} space-y-4`}>
      {/* Main weather */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-secondary/40 flex items-center justify-center shrink-0">
          <Icon className={`h-7 w-7 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black tabular-nums">{Math.round(w.temperature || 20)}°</span>
            <span className="text-sm text-muted-foreground">C</span>
            <span className={`text-xs font-bold ${meta.color} ml-1`}>{meta.label}</span>
          </div>
          {tournament?.name && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{tournament.name} · {tournament.location}</p>
          )}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-2">
        <Metric icon={Droplets} label="Umidade" value={`${w.humidity || 50}%`} />
        <Metric icon={Wind} label="Vento" value={`${w.wind_speed || 0}km/h`} sub={w.wind_direction} />
        <Metric icon={Sun} label="UV" value={`${w.uv_index || 0}`} />
        <Metric icon={Eye} label="Visib." value={`${w.visibility_km || 10}km`} />
      </div>

      {/* Court condition */}
      <div className={`flex items-center gap-2 p-2.5 rounded-xl ${court.bg}`}>
        <span className="text-xs font-bold text-muted-foreground">Quadra:</span>
        <span className={`text-xs font-bold ${court.color}`}>{court.label}</span>
        <span className="text-[10px] text-muted-foreground truncate flex-1">{court.desc}</span>
      </div>

      {/* Impact on performance */}
      {impact.effects.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Impacto no Jogo</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {impact.energy_cost_modifier !== 1 && (
              <ImpactChip label="Energia" value={`${impact.energy_cost_modifier > 1 ? '+' : ''}${Math.round((impact.energy_cost_modifier - 1) * 100)}%`} positive={impact.energy_cost_modifier < 1} />
            )}
            {impact.accuracy_modifier !== 1 && (
              <ImpactChip label="Precisão" value={`${impact.accuracy_modifier > 1 ? '+' : ''}${Math.round((impact.accuracy_modifier - 1) * 100)}%`} positive={impact.accuracy_modifier > 1} />
            )}
            {impact.injury_risk_modifier !== 0 && (
              <ImpactChip label="Lesão" value={`+${impact.injury_risk_modifier}%`} positive={false} />
            )}
            {impact.tactic_bonus > 0 && (
              <ImpactChip label="Tática" value={`+${impact.tactic_bonus}`} positive />
            )}
            {impact.defense_bonus > 0 && (
              <ImpactChip label="Defesa" value={`+${impact.defense_bonus}`} positive />
            )}
            {impact.speed_modifier !== 1 && (
              <ImpactChip label="Velocidade" value={`${impact.speed_modifier > 1 ? '+' : ''}${Math.round((impact.speed_modifier - 1) * 100)}%`} positive={impact.speed_modifier > 1} />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{impact.description}</p>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-2 rounded-xl bg-secondary/30">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-bold tabular-nums">{value}</span>
      <span className="text-[8px] text-muted-foreground uppercase tracking-wide">{label}</span>
      {sub && <span className="text-[8px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function ImpactChip({ label, value, positive }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${positive ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
      {value} {label}
    </span>
  );
}