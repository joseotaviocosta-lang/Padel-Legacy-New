import React from 'react';
import { Users, TrendingUp, Heart, Star, Eye, Zap } from 'lucide-react';
import { BEHAVIOR_TYPES, getFanBaseStatus, getTrendIcon } from '@/lib/fanBase';

function MetricBar({ icon: Icon, label, value, color }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Icon className={`h-3 w-3 ${color}`} /> {label}
        </span>
        <span className="font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary/50 overflow-hidden">
        <div className={`h-full rounded-full ${color.replace('text-', 'bg-')}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function FanBaseCard({ fanBase, onClick }) {
  const behavior = BEHAVIOR_TYPES[fanBase.behavior] || BEHAVIOR_TYPES.apaixonado;
  const status = getFanBaseStatus(fanBase);
  const trend = getTrendIcon(fanBase.trend);
  const entityTypeLabel = fanBase.entity_type === 'clube' ? 'Clube' : fanBase.entity_type === 'atleta' ? 'Atleta' : 'Jogador';

  return (
    <div
      onClick={onClick}
      className={`glass rounded-2xl p-4 ${onClick ? 'cursor-pointer hover:border-primary/40 transition-all' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-11 w-11 rounded-xl ${behavior.bg} flex items-center justify-center shrink-0`}>
          <span className="text-xl">{behavior.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{fanBase.entity_name}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">{entityTypeLabel}</span>
            <span className="text-[9px] text-muted-foreground">·</span>
            <span className={`text-[9px] font-bold ${behavior.color}`}>{behavior.label}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-bold tabular-nums">{(fanBase.total_fans || 0).toLocaleString('pt-BR')}</span>
          </div>
          <span className={`text-[9px] font-bold ${trend.color}`}>{trend.icon} {fanBase.trend}</span>
        </div>
      </div>

      {/* Status + Morale */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${status.bg} ${status.color}`}>
          Torcida {status.label}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-secondary/50 overflow-hidden">
          <div
            className={`h-full rounded-full ${status.color.replace('text-', 'bg-')}`}
            style={{ width: `${fanBase.morale || 50}%` }}
          />
        </div>
        <span className="text-[10px] font-bold tabular-nums">{fanBase.morale || 50}</span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <MetricBar icon={Star} label="Popularidade" value={fanBase.popularity || 50} color="text-primary" />
        <MetricBar icon={Heart} label="Fidelidade" value={fanBase.loyalty || 50} color="text-red-400" />
        <MetricBar icon={Eye} label="Exigência" value={fanBase.expectation || 50} color="text-purple-400" />
        <MetricBar icon={Zap} label="Influência" value={fanBase.influence || 50} color="text-amber-400" />
      </div>

      {/* Last reaction */}
      {fanBase.last_reaction && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Última reação</p>
          <p className="text-xs text-foreground/80 italic">"{fanBase.last_reaction}"</p>
        </div>
      )}
    </div>
  );
}