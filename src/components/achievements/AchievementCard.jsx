import React from 'react';
import {
  Lock, HelpCircle, Check, Star, Coins, Award, Gift, Crown,
  Footprints, Play, Trophy, Shield, Activity, Infinity as InfinityIcon,
  Flame, Swords, Zap, Medal, Sparkles, RotateCcw, Target, Clock,
  Crosshair, Dices, Brain, Flag, Calendar, Route, Globe, Compass,
  Castle, Dumbbell, Wind, Snowflake, Rocket, Feather, Users, Heart,
  Handshake, GraduationCap, HeartCrack, Skull, Bird, Megaphone,
  Wallet, Gem, Landmark, Home, Building2, TrendingUp, BarChart3,
  LineChart, ShoppingBag, Package, Boxes, Diamond, Disc, Shirt,
  BookOpen, ScrollText, User, Battery, Trash2, Rainbow, Baby, Scale,
} from 'lucide-react';
import { DIFFICULTY_META } from '@/lib/achievementsData';

const ICON_MAP = {
  Footprints, Play, Trophy, Shield, Activity, Crown, Infinity: InfinityIcon,
  Flame, Swords, Zap, Award, Medal, Star, Sparkles, RotateCcw, Target, Clock,
  Crosshair, Dices, Brain, Flag, Calendar, Route, Globe, Compass, Castle,
  Dumbbell, Wind, Snowflake, Rocket, Feather, Users, Heart, Handshake,
  GraduationCap, HeartCrack, Skull, Dove: Bird, Megaphone, Wallet, Gem,
  Landmark, Home, Building2, TrendingUp, BarChart3, LineChart, ShoppingBag,
  Package, Boxes, Diamond, Disc, Shirt, BookOpen, ScrollText, User, Battery,
  Trash2, Rainbow, Baby, Scale, Lock, HelpCircle,
};

const RARITY_BADGE = {
  comum: 'border-muted-foreground/40 bg-muted/30 text-muted-foreground',
  incomum: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-400',
  raro: 'border-blue-500/40 bg-blue-500/15 text-blue-400',
  'épico': 'border-purple-500/40 bg-purple-500/15 text-purple-400',
  'lendário': 'border-amber-500/40 bg-amber-500/15 text-amber-400',
  mitico: 'border-red-500/40 bg-red-500/15 text-red-400',
  exclusivo: 'border-primary/40 bg-primary/15 text-primary',
};

export default function AchievementCard({ achievement, unlocked, onClick }) {
  const difficulty = DIFFICULTY_META[achievement.difficulty] || DIFFICULTY_META.facil;
  const rarityStyle = RARITY_BADGE[achievement.rarity] || RARITY_BADGE.comum;
  const isSecret = achievement.visibility === 'secreto' && !unlocked;
  const isHidden = achievement.visibility === 'oculto' && !unlocked;

  if (isSecret) {
    return (
      <div className="glass rounded-2xl p-4 flex flex-col items-center justify-center gap-2 min-h-[140px] border border-red-500/10 opacity-60">
        <HelpCircle className="h-8 w-8 text-red-400/50" />
        <p className="text-[10px] text-red-400/50 font-bold uppercase tracking-wider">Secreto</p>
        {achievement.hint && achievement.is_revealed_hint && (
          <p className="text-[9px] text-muted-foreground/50 text-center italic px-2">{achievement.hint}</p>
        )}
      </div>
    );
  }

  const iconName = unlocked ? (achievement.icon || 'Award') : (isHidden ? (achievement.mystery_icon || 'Lock') : (achievement.icon || 'Lock'));
  const LucideIcon = ICON_MAP[iconName] || Award;
  const displayName = isHidden ? (achievement.mystery_description ? achievement.name : '???') : achievement.name;
  const displayDesc = isHidden ? (achievement.mystery_description || '???') : achievement.description;

  return (
    <button
      onClick={onClick}
      className={`glass rounded-2xl p-4 flex flex-col gap-2 text-left transition-all hover:border-primary/40 hover:scale-[1.02] ${unlocked ? 'border-primary/30' : isHidden ? 'opacity-80' : 'opacity-60'} relative overflow-hidden`}
    >
      {/* Unlock glow */}
      {unlocked && <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />}

      {/* Top row */}
      <div className="flex items-start justify-between relative">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${unlocked ? 'bg-primary/20' : 'bg-secondary/60'}`}>
          {unlocked ? (
            <LucideIcon className="h-5 w-5 text-primary" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[7px] font-bold uppercase ${rarityStyle}`}>
            {achievement.rarity}
          </span>
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[7px] font-bold uppercase ${difficulty.bg} ${difficulty.border} ${difficulty.color}`}>
            {difficulty.label}
          </span>
        </div>
      </div>

      {/* Name & description */}
      <div className="relative">
        <h3 className={`font-bold text-xs leading-tight ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
          {displayName}
        </h3>
        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-3">
          {displayDesc}
        </p>
      </div>

      {/* Rewards */}
      <div className="flex flex-wrap gap-1 mt-auto pt-1 relative">
        {(achievement.xp_reward > 0 || unlocked) && achievement.xp_reward > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-md text-[8px] font-bold px-1 py-0.5 bg-primary/10 text-primary">
            <Star className="h-2.5 w-2.5" /> {achievement.xp_reward.toLocaleString('pt-BR')} XP
          </span>
        )}
        {(achievement.coins_reward > 0 || unlocked) && achievement.coins_reward > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-md text-[8px] font-bold px-1 py-0.5 bg-yellow-500/10 text-yellow-400">
            <Coins className="h-2.5 w-2.5" /> {achievement.coins_reward.toLocaleString('pt-BR')}
          </span>
        )}
        {unlocked && achievement.medal_reward && (
          <span className="inline-flex items-center gap-0.5 rounded-md text-[8px] font-bold px-1 py-0.5 bg-amber-500/10 text-amber-400">
            <Award className="h-2.5 w-2.5" /> Medalha
          </span>
        )}
        {unlocked && achievement.title_reward && (
          <span className="inline-flex items-center gap-0.5 rounded-md text-[8px] font-bold px-1 py-0.5 bg-purple-500/10 text-purple-400">
            <Crown className="h-2.5 w-2.5" /> Título
          </span>
        )}
        {unlocked && achievement.exclusive_item && (
          <span className="inline-flex items-center gap-0.5 rounded-md text-[8px] font-bold px-1 py-0.5 bg-cyan-500/10 text-cyan-400">
            <Gift className="h-2.5 w-2.5" /> Item Exclusivo
          </span>
        )}
        {unlocked && (
          <span className="inline-flex items-center gap-0.5 rounded-md text-[8px] font-bold px-1 py-0.5 bg-green-500/10 text-green-400">
            <Check className="h-2.5 w-2.5" /> +{achievement.points || 10} pts
          </span>
        )}
      </div>
    </button>
  );
}