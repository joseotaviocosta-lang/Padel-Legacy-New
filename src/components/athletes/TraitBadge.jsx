import React from 'react';
import { Target, Dumbbell, Moon, Crosshair, Flame, Heart, Snowflake, Cloud, Crown, Star, EyeOff, MessageCircleWarning, HeartHandshake, Swords, Zap, TrendingUp, Brain, Shield, Waves, BookOpen, Sparkles, Gem, Hammer, Handshake, User, Megaphone, Anchor, Lightbulb, Award, Sprout, Eye, ListChecks, Scale } from 'lucide-react';
import { getTraitMeta } from '@/lib/personalityTraits';

const TRAIT_ICONS = {
  disciplinado: Target, trabalhador: Dumbbell, preguicoso: Moon, perfeccionista: Crosshair,
  explosivo: Flame, emocional: Heart, frio: Snowflake, mercurial: Cloud,
  lider: Crown, carismatico: Star, introvertido: EyeOff, provocador: MessageCircleWarning,
  humilde: HeartHandshake, arrogante: Crown,
  competitivo: Swords, impulsivo: Zap, ambicioso: TrendingUp,
  estrategista: Brain, resiliente: Shield, calmado: Waves, sabio: BookOpen,
  showman: Sparkles, elegante: Gem, brutal: Hammer,
  leal: Handshake, solitario: User, motivador: Megaphone, teimoso: Anchor, criativo: Lightbulb,
  durao: Shield, talentoso: Star, guerreiro: Swords, novato_mentalidade: Sprout, veterano_mentalidade: Award,
  lenda_mentalidade: Crown, dark_horse: Eye, metodico: ListChecks, passional: Flame, calculista: Scale, misterioso: EyeOff,
};

const TRAIT_COLORS = {
  cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  red: 'bg-red-500/15 text-red-300 border-red-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  green: 'bg-green-500/15 text-green-300 border-green-500/30',
  pink: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  primary: 'bg-primary/15 text-primary border-primary/30',
};

export function TraitBadge({ traitId, size = 'md' }) {
  const trait = getTraitMeta(traitId);
  const Icon = TRAIT_ICONS[traitId] || Star;
  const colorClass = TRAIT_COLORS[trait.color] || TRAIT_COLORS.primary;
  const sizes = {
    sm: 'text-[9px] px-2 py-0.5 gap-1',
    md: 'text-[10px] px-2.5 py-1 gap-1',
    lg: 'text-xs px-3 py-1.5 gap-1.5',
  };

  return (
    <div className={`inline-flex items-center rounded-full border font-bold ${colorClass} ${sizes[size]}`}>
      <Icon className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {trait.label}
    </div>
  );
}

export function TraitList({ traitIds = [] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(traitIds || []).map(id => (
        <TraitBadge key={id} traitId={id} size="md" />
      ))}
    </div>
  );
}

export function TraitDetailedList({ traitIds = [] }) {
  return (
    <div className="space-y-2">
      {(traitIds || []).map(id => {
        const trait = getTraitMeta(id);
        const Icon = TRAIT_ICONS[id] || Star;
        const colorClass = TRAIT_COLORS[trait.color] || TRAIT_COLORS.primary;
        return (
          <div key={id} className={`glass rounded-xl p-2.5 border ${colorClass}`}>
            <div className="flex items-center gap-2 mb-0.5">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold">{trait.label}</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed pl-6">{trait.desc}</p>
          </div>
        );
      })}
    </div>
  );
}