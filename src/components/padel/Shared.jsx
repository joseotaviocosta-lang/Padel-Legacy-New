import React from 'react';
import { Trophy, Zap, ArrowUpRight, ArrowUpLeft, Waves, Circle, Hammer, Shield, Gauge, Brain, Flame } from 'lucide-react';
import { careerExperienceSummary, overallRating } from '@/lib/padel';

const ATTRIBUTE_ICONS = { Zap, ArrowUpRight, ArrowUpLeft, Waves, Circle, Hammer, Shield, Gauge, Brain, Flame };

export function getAttributeIcon(name) {
  return ATTRIBUTE_ICONS[name] || Circle;
}

const RARITY_COLORS = {
  comum: 'from-slate-500/20 to-slate-600/10 text-slate-300 border-slate-500/30',
  raro: 'from-blue-500/20 to-cyan-600/10 text-cyan-300 border-cyan-500/30',
  'épico': 'from-purple-500/20 to-fuchsia-600/10 text-purple-300 border-purple-500/30',
  'lendário': 'from-amber-500/20 to-orange-600/10 text-amber-300 border-amber-500/40',
};

export function LevelBadge({ level, size = 'sm' }) {
  const sizes = { sm: 'text-[10px] px-2 py-0.5', md: 'text-xs px-2.5 py-1', lg: 'text-sm px-3 py-1.5' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary font-bold ${sizes[size]}`}>
      {level}
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="glass rounded-2xl p-3 flex flex-col items-center gap-1">
      <Icon className={`h-4 w-4 ${accent || 'text-primary'}`} />
      <span className="text-xl font-black text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

export function AttributeBar({ label, value, icon: Icon }) {
  const pct = Math.min(100, value);
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs font-medium text-foreground/90">{label}</span>
          <span className="text-xs font-black text-primary tabular-nums">{value}</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function ProfileMini({ profile, rank }) {
  const careerExperience = careerExperienceSummary(profile?.xp || 0);
  return (
    <div className="flex items-center gap-3">
      {rank && (
        <div className="text-2xl font-black text-muted-foreground/50 w-6 text-center tabular-nums">{rank}</div>
      )}
      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/30 to-secondary overflow-hidden shrink-0 flex items-center justify-center">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-black text-primary text-lg">
            {(profile?.sport_name || '?')[0]?.toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{profile?.sport_name || 'Jogador'}</p>
        <div className="flex items-center gap-2">
          <LevelBadge level={`Exp. ${careerExperience.level}`} size="sm" />
          <span className="text-[10px] text-muted-foreground">{profile?.country || '—'}</span>
        </div>
      </div>
      <div className="text-right">
        <p className="font-black text-primary tabular-nums">{overallRating(profile)}</p>
        <p className="text-[9px] text-muted-foreground uppercase">Overall</p>
      </div>
    </div>
  );
}

export function AchievementBadge({ achievement }) {
  const color = RARITY_COLORS[achievement?.rarity || 'comum'] || RARITY_COLORS.comum;
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${color} p-3 flex flex-col items-center gap-1 text-center`}>
      <div className="h-9 w-9 rounded-full bg-background/40 flex items-center justify-center">
        <Trophy className="h-4 w-4" />
      </div>
      <span className="text-[10px] font-bold leading-tight">{achievement?.name}</span>
      <span className="text-[8px] uppercase tracking-wide opacity-60">{achievement?.rarity}</span>
    </div>
  );
}