import React from 'react';
import { Newspaper, Mic, Swords, Share2, HelpCircle, ArrowRightLeft, Clock, Sparkles, Activity, AlertTriangle, TrendingUp, BookOpen, Heart, Scale, TrendingDown, Cpu, Star, Globe, HeartHandshake, Crown, Calendar, Zap, Shield, Coins, Award, Brain, Trophy, UserRound } from 'lucide-react';
import { EVENT_TYPE_META } from '@/lib/world';
import { MACRO_EVENT_META, IMPACT_META } from '@/lib/worldEvents';
import { PlayerAvatar } from '@/components/design-system';
import { formatWorldDate } from '@/lib/worldTime';

const ICON_MAP = {
  Newspaper, Mic, Swords, Share2, HelpCircle, ArrowRightLeft, Clock,
  Sparkles, Activity, AlertTriangle, TrendingUp, BookOpen,
  Scale, TrendingDown, Cpu, Star, Globe, HeartHandshake, Crown,
};

const TIER_STYLES = {
  breaking: { border: 'border-red-500/40', dot: 'bg-red-500', label: 'URGENTE' },
  destaque: { border: 'border-primary/30', dot: 'bg-primary', label: 'DESTAQUE' },
  normal: { border: 'border-transparent', dot: 'bg-muted-foreground', label: null },
};

const EFFECT_LABELS = {
  training_bonus: { label: 'Treino', icon: Brain, color: 'text-primary' },
  coin_modifier: { label: 'Moedas', icon: Coins, color: 'text-yellow-400' },
  xp_modifier: { label: 'XP', icon: Zap, color: 'text-primary' },
  market_modifier: { label: 'Mercado', icon: TrendingUp, color: 'text-cyan-400' },
  injury_risk_modifier: { label: 'Lesão', icon: Shield, color: 'text-red-400' },
  fan_appeal_bonus: { label: 'Torcida', icon: Heart, color: 'text-pink-400' },
  sponsor_appeal_bonus: { label: 'Patrocin.', icon: Award, color: 'text-green-400' },
  energy_cost_modifier: { label: 'Energia', icon: Activity, color: 'text-amber-400' },
  match_reward_modifier: { label: 'Recomp.', icon: Trophy, color: 'text-purple-400' },
};

function formatEffect(key, value) {
  if (key.includes('modifier')) {
    const pct = Math.round((value - 1) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
  }
  if (key.includes('bonus') || key.includes('risk')) {
    return `${value >= 0 ? '+' : ''}${value}`;
  }
  return `${value}`;
}

export default function WorldEventCard({ event, profile, variant = 'default' }) {
  const isMacro = event.is_macro;
  const isHero = variant === 'hero';
  const meta = isMacro
    ? (MACRO_EVENT_META[event.event_type] || Object.values(MACRO_EVENT_META)[0])
    : (EVENT_TYPE_META[event.event_type] || EVENT_TYPE_META.noticia);
  const Icon = ICON_MAP[meta.icon] || (isMacro ? Globe : Newspaper);
  const tier = TIER_STYLES[event.tier] || TIER_STYLES.normal;
  const dateStr = formatWorldDate(event.event_date, profile?.career_date);

  const impact = isMacro ? (IMPACT_META[event.impact_level] || IMPACT_META.baixo) : null;
  const effects = isMacro ? (event.effects || {}) : {};
  const hasEffects = isMacro && Object.keys(effects).length > 0;
  const isActive = isMacro && event.is_active !== false;

  const playerName = (profile?.sport_name || profile?.display_name || '').trim().toLowerCase();
  const relatedToPlayer = Boolean(playerName) && (event.related_players || []).some(
    (name) => String(name || '').trim().toLowerCase() === playerName,
  );

  return (
    <div className={`glass rounded-2xl border transition-all hover:scale-[1.01] ${isHero ? 'p-5 sm:p-6' : 'p-4'} ${isMacro ? meta.border : tier.border} ${isMacro && isActive ? 'ring-1 ring-primary/10' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`rounded-lg ${meta.bg} flex items-center justify-center shrink-0 ${isHero ? 'h-9 w-9' : 'h-7 w-7'}`}>
          <Icon className={`${meta.color} ${isHero ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5'}`} />
        </div>
        <span className={`font-bold uppercase tracking-wide ${meta.color} ${isHero ? 'text-[10px]' : 'text-[9px]'}`}>
          {isHero ? 'Destaque' : meta.label}
        </span>
        {isMacro && impact && (
          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${impact.bg} ${impact.color}`}>
            {impact.label}
          </span>
        )}
        {tier.label && !isMacro && !isHero && (
          <span className="inline-flex items-center gap-1 ml-auto text-[8px] font-black uppercase tracking-wider text-red-400">
            <span className={`h-1.5 w-1.5 rounded-full ${tier.dot} animate-pulse`} /> {tier.label}
          </span>
        )}
        {isMacro && isActive && (
          <span className="inline-flex items-center gap-1 ml-auto text-[8px] font-black uppercase tracking-wider text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> ATIVO
          </span>
        )}
        {isMacro && !isActive && (
          <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground ml-auto">EXPIRADO</span>
        )}
        <span className="text-[9px] text-muted-foreground shrink-0 ml-auto">{dateStr}</span>
      </div>

      {relatedToPlayer && (
        <span className="inline-flex items-center gap-1 mb-2 rounded-full bg-primary/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-primary">
          <UserRound className="h-2.5 w-2.5" /> Relacionado a você
        </span>
      )}

      {/* Title */}
      <h3 className={`font-bold leading-tight mb-1.5 ${isHero ? 'text-lg sm:text-xl' : 'text-sm'}`}>{event.title}</h3>

      {/* Content */}
      <p className={`text-muted-foreground leading-relaxed mb-2 ${isHero ? 'text-sm' : 'text-xs line-clamp-3'}`}>{event.content}</p>

      {/* Effects (macro only) */}
      {hasEffects && isActive && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {Object.entries(effects).slice(0, 4).map(([key, val]) => {
            const eff = EFFECT_LABELS[key];
            if (!eff) return null;
            const EffIcon = eff.icon;
            return (
              <span key={key} className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground">
                <EffIcon className={`h-2.5 w-2.5 ${eff.color}`} />
                {formatEffect(key, val)} {eff.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Duration (macro only) */}
      {isMacro && event.duration_days > 0 && (
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mb-2">
          <Calendar className="h-3 w-3" />
          {event.duration_days} {event.duration_days === 1 ? 'dia' : 'dias'}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 pt-2 border-t border-border/40">
        <span className="text-[9px] text-muted-foreground truncate flex-1">{event.author_name}</span>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Heart className="h-3 w-3" /> {(event.likes || 0).toLocaleString('pt-BR')}
        </div>
        {event.related_players?.length > 0 && (
          <div className="flex items-center gap-1.5">
            {event.related_players.slice(0, 2).map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary/50 py-0.5 pl-0.5 pr-2 text-[8px] font-semibold text-muted-foreground">
                <PlayerAvatar name={p} size="sm" shape="circle" className="h-4 w-4 text-[8px]" />
                <span className="max-w-[70px] truncate">{p}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}