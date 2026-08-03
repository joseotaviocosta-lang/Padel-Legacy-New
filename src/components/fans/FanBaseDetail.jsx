import React, { useState } from 'react';
import { X, Users, Heart, Star, Eye, Zap, Calendar, Activity } from 'lucide-react';
import { BEHAVIOR_TYPES, getFanBaseStatus, getTrendIcon, FAN_EVENTS, reactToEvent } from '@/lib/fanBase';
import { localGame } from '@/api/localGameClient.js';
import { formatDate } from '@/lib/padel';

function MetricRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-xs text-muted-foreground flex-1">{label}</span>
      <div className="w-24 h-2 rounded-full bg-secondary/50 overflow-hidden">
        <div className={`h-full rounded-full ${color.replace('text-', 'bg-')}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-8 text-right">{value}</span>
    </div>
  );
}

export default function FanBaseDetail({ fanBase, onClose, onUpdate }) {
  const [reacting, setReacting] = useState(null);
  const behavior = BEHAVIOR_TYPES[fanBase.behavior] || BEHAVIOR_TYPES.apaixonado;
  const status = getFanBaseStatus(fanBase);
  const trend = getTrendIcon(fanBase.trend);

  async function triggerReaction(eventType) {
    setReacting(eventType);
    try {
      const updated = reactToEvent(fanBase, eventType);
      const saved = await localGame.entities.FanBase.update(fanBase.id, {
        morale: updated.morale,
        popularity: updated.popularity,
        loyalty: updated.loyalty,
        influence: updated.influence,
        total_fans: updated.total_fans,
        trend: updated.trend,
        last_event: updated.last_event,
        last_reaction: updated.last_reaction,
        last_reaction_date: updated.last_reaction_date,
        reaction_history: updated.reaction_history,
      });
      onUpdate(saved);
    } catch (e) { console.error(e); }
    setReacting(null);
  }

  const quickEvents = ['match_win', 'match_loss', 'title_win', 'injury', 'good_interview', 'bad_interview', 'ranking_up', 'good_performance'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass rounded-3xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-premium">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`h-14 w-14 rounded-2xl ${behavior.bg} flex items-center justify-center`}>
              <span className="text-2xl">{behavior.emoji}</span>
            </div>
            <div>
              <h2 className="font-black text-lg">{fanBase.entity_name}</h2>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold ${behavior.color}`}>{behavior.label}</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className={`text-[10px] font-bold ${trend.color}`}>{trend.icon} {fanBase.trend}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar detalhes da torcida" title="Fechar" className="p-1.5 rounded-lg hover:bg-secondary/50">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground mb-4 italic">{behavior.desc}</p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="glass rounded-xl p-3 text-center">
            <Users className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-black tabular-nums">{(fanBase.total_fans || 0).toLocaleString('pt-BR')}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Torcedores</p>
          </div>
          <div className={`glass rounded-xl p-3 text-center`}>
            <Activity className={`h-4 w-4 ${status.color} mx-auto mb-1`} />
            <p className={`text-lg font-black ${status.color}`}>{status.label}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Moral: {fanBase.morale}/100</p>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-2.5 mb-4">
          <MetricRow icon={Star} label="Popularidade" value={fanBase.popularity || 50} color="text-primary" />
          <MetricRow icon={Heart} label="Fidelidade" value={fanBase.loyalty || 50} color="text-red-400" />
          <MetricRow icon={Eye} label="Exigência" value={fanBase.expectation || 50} color="text-purple-400" />
          <MetricRow icon={Zap} label="Influência" value={fanBase.influence || 50} color="text-amber-400" />
        </div>

        {/* Last reaction */}
        {fanBase.last_reaction && (
          <div className="glass rounded-xl p-3 mb-4 border border-primary/20">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Última reação · {fanBase.last_event}</p>
            <p className="text-sm italic">"{fanBase.last_reaction}"</p>
          </div>
        )}

        {/* Trigger reactions */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Disparar reação</p>
          <div className="grid grid-cols-2 gap-2">
            {quickEvents.map(evt => {
              const def = FAN_EVENTS[evt];
              return (
                <button
                  key={evt}
                  onClick={() => triggerReaction(evt)}
                  disabled={reacting !== null}
                  className="px-3 py-2 rounded-xl glass text-xs font-semibold hover:border-primary/40 hover:text-primary transition-all disabled:opacity-40"
                >
                  {reacting === evt ? '...' : def.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* History */}
        {fanBase.reaction_history && fanBase.reaction_history.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Histórico de reações
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-premium">
              {fanBase.reaction_history.slice(0, 8).map((h, i) => (
                <div key={i} className="glass rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-bold">{h.event}</span>
                    <span className={`text-[9px] font-bold tabular-nums ${h.morale_change >= 0 ? 'text-green-400' : 'text-destructive'}`}>
                      {h.morale_change >= 0 ? '+' : ''}{h.morale_change} moral
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">"{h.reaction}"</p>
                  <p className="text-[8px] text-muted-foreground/60 mt-0.5">{formatDate(h.date)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
