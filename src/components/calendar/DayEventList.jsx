import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trophy, Dumbbell, Moon, Plane, Mic, Swords, Clock, Coins } from 'lucide-react';
import { EVENT_TYPES } from '@/lib/calendarSystem';
import { formatAttributeGain, formatCurrency, formatGameNumber } from '@/lib/numberFormat.js';

const EVENT_ICON = {
  tournament: Trophy,
  travel: Plane,
  rest: Moon,
  training_camp: Dumbbell,
  press: Mic,
  sponsor_event: Mic,
  medical: Clock,
  personal: Clock,
};

export default function DayEventList({ day, dayData, onResolve, onPlayTournament }) {
  if (!day) return null;

  const allItems = [
    ...dayData.events.map(e => ({ ...e, _kind: 'event' })),
    ...dayData.matches.map(m => ({ ...m, _kind: 'match' })),
    ...dayData.trainings.map(t => ({ ...t, _kind: 'training' })),
  ];

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            {format(day, 'EEEE', { locale: ptBR })}
          </p>
          <p className="font-black text-lg">{format(day, 'dd MMMM', { locale: ptBR })}</p>
        </div>
        <span className="text-xs text-muted-foreground">{allItems.length} compromisso{allItems.length !== 1 ? 's' : ''}</span>
      </div>

      {allItems.length === 0 ? (
        <div className="text-center py-6">
          <Moon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Dia livre — nenhum compromisso agendado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {allItems.map((item, i) => {
            if (item._kind === 'event') {
              const meta = EVENT_TYPES[item.event_type] || EVENT_TYPES.personal;
              const Icon = EVENT_ICON[item.event_type] || Clock;
              return (
                <div key={item.id || i} className="rounded-xl bg-secondary/30 p-3 border border-border/40">
                  <div className="flex items-start gap-2">
                    <div className={`h-8 w-8 rounded-lg ${meta.dot} bg-opacity-20 flex items-center justify-center shrink-0`}>
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{item.description || item.location || ''}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {item.energy_cost > 0 && <span className="text-[9px] text-amber-400">-{formatGameNumber(item.energy_cost)} energia</span>}
                        {item.coin_cost > 0 && <span className="text-[9px] text-red-400">-{formatCurrency(item.coin_cost)} moedas</span>}
                        {item.coin_reward > 0 && <span className="text-[9px] text-green-400">+{formatCurrency(item.coin_reward)} moedas</span>}
                        {item.metadata?.failure_reason && <span className="text-[9px] text-red-400">Não realizado: {item.metadata.failure_reason}</span>}
                        {item.requires_decision && (
                          <span className="text-[9px] text-amber-400 font-bold">⚠ Decisão obrigatória</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {item.requires_decision && item.decision_type === 'play_tournament' && (
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => onPlayTournament?.(item)}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-green-500/20 text-green-400 font-bold text-[10px] hover:bg-green-500/30 transition-colors"
                      >
                        Jogar Torneio
                      </button>
                      <button
                        onClick={() => onResolve?.(item, 'skip')}
                        className="px-2 py-1.5 rounded-lg bg-red-500/15 text-red-400 font-bold text-[10px] hover:bg-red-500/25 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            if (item._kind === 'match') {
              const won = item.winner === 'A';
              return (
                <div key={item.id || i} className="rounded-xl bg-secondary/30 p-3 border border-border/40 flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${won ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    <Swords className={`h-4 w-4 ${won ? 'text-green-400' : 'text-red-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs truncate">{item.tournament_name || 'Partida'}</p>
                    <p className="text-[10px] text-muted-foreground">{item.team_a?.join(' & ')} vs {item.team_b?.join(' & ')}</p>
                  </div>
                  <span className={`text-xs font-black ${won ? 'text-green-400' : 'text-red-400'}`}>{item.score_a}-{item.score_b}</span>
                </div>
              );
            }

            if (item._kind === 'training') {
              return (
                <div key={item.id || i} className="rounded-xl bg-secondary/30 p-3 border border-border/40 flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
                    <Dumbbell className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs truncate">{item.training_label}</p>
                    <p className="text-[10px] text-muted-foreground">+{formatAttributeGain(item.attribute_gain)} {item.attribute_target} · +{formatGameNumber(item.xp_reward, { maximumFractionDigits: 0 })} XP</p>
                  </div>
                  <Coins className="h-3 w-3 text-yellow-400" />
                  <span className="text-[10px] font-bold text-yellow-400">{formatCurrency(item.coins_reward)}</span>
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}
