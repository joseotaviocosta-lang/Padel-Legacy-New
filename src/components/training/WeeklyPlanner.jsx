import React, { useState, useEffect } from 'react';
import { Calendar, Trash2, Activity, Zap, AlertTriangle, Save, Play, Pause, Sparkles } from 'lucide-react';
import { TRAINING_ACTIVITIES, TRAINING_CATEGORIES, INTENSITY_LEVELS, WEEKDAYS, getPlanSummary, saveWeeklyPlan } from '@/lib/trainingSystemV2';
import { getAttributeIcon } from '@/components/padel/Shared';

// ── Weekly Planner ─────────────────────────────────────────────────────────
// Lets the player assign an activity + intensity to each day of the week.
// Shows a summary of total fatigue, energy, and attribute focus.
export default function WeeklyPlanner({ profile, onPlanSaved }) {
  const [plan, setPlan] = useState(profile?.weekly_training_plan || {});
  const [saving, setSaving] = useState(false);
  const [editingDay, setEditingDay] = useState(null);
  const [enabled, setEnabled] = useState(Boolean(profile?.weekly_training_enabled));

  useEffect(() => {
    setPlan(profile?.weekly_training_plan || {});
    setEnabled(Boolean(profile?.weekly_training_enabled));
  }, [profile?.id, profile?.weekly_training_enabled]);

  const summary = getPlanSummary(plan);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await saveWeeklyPlan(profile, plan, enabled);
      onPlanSaved?.(updated);
    } catch (e) {
      console.error('saveWeeklyPlan', e);
    } finally {
      setSaving(false);
    }
  }

  function assignActivity(dayId, activityId, intensity) {
    setPlan(prev => ({ ...prev, [dayId]: { activity_id: activityId, intensity } }));
  }

  function clearDay(dayId) {
    setPlan(prev => {
      const next = { ...prev };
      delete next[dayId];
      return next;
    });
  }


  const PRESETS = {
    equilibrado: {
      seg: { activity_id: 'court-groundstrokes', intensity: 'moderado' },
      ter: { activity_id: 'physical-conditioning', intensity: 'moderado' },
      qua: { activity_id: 'court-net-control', intensity: 'moderado' },
      sex: { activity_id: 'tactical-strategy', intensity: 'leve' },
      sab: { activity_id: 'mental-concentration', intensity: 'leve' },
    },
    evolucao: {
      seg: { activity_id: 'court-groundstrokes', intensity: 'intenso' },
      ter: { activity_id: 'physical-agility', intensity: 'moderado' },
      qua: { activity_id: 'court-aerials', intensity: 'moderado' },
      sex: { activity_id: 'court-defense-transition', intensity: 'moderado' },
      sab: { activity_id: 'tactical-strategy', intensity: 'leve' },
    },
    torneio: {
      seg: { activity_id: 'court-groundstrokes', intensity: 'moderado' },
      ter: { activity_id: 'tactical-strategy', intensity: 'moderado' },
      qua: { activity_id: 'court-net-control', intensity: 'leve' },
      sex: { activity_id: 'mental-pressure', intensity: 'leve' },
    },
    recuperacao: {
      ter: { activity_id: 'mental-concentration', intensity: 'leve' },
      qui: { activity_id: 'tactical-strategy', intensity: 'leve' },
      sab: { activity_id: 'court-groundstrokes', intensity: 'leve' },
    },
  };

  function applyPreset(id) {
    setPlan(PRESETS[id] || {});
    setEnabled(true);
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="glass rounded-2xl p-4 grid-bg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Resumo da Semana
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Planeje seus treinos para maximizar ganhos e evitar sobrecarga</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-all disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando...' : 'Salvar Plano'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <SummaryStat icon={Activity} label="Atividades" value={summary.totalActivities} color="text-primary" />
          <SummaryStat icon={Zap} label="Energia Total" value={summary.totalEnergy} color={summary.totalEnergy > 80 ? 'text-red-400' : 'text-amber-400'} />
          <SummaryStat icon={AlertTriangle} label="Fadiga Total" value={summary.totalFatigue} color={summary.totalFatigue > 120 ? 'text-red-400' : 'text-amber-400'} />
        </div>
        {summary.totalFatigue > 120 && (
          <div className="mt-3 flex items-center gap-2 text-[10px] text-red-400">
            <AlertTriangle className="h-3 w-3" />
            <span>Carga de fadiga muito alta! Considere dias de descanso.</span>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl border border-primary/20 p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Treino automático</p>
            <p className="text-[10px] text-muted-foreground">Ao avançar os dias, o jogo executa o plano. Dias vazios viram descanso automático.</p>
          </div>
          <button onClick={() => setEnabled(value => !value)} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${enabled ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
            {enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {enabled ? 'Automação ativa' : 'Ativar automação'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PresetButton label="Equilibrado" onClick={() => applyPreset('equilibrado')} />
          <PresetButton label="Evolução" onClick={() => applyPreset('evolucao')} />
          <PresetButton label="Pré-torneio" onClick={() => applyPreset('torneio')} />
          <PresetButton label="Recuperação" onClick={() => applyPreset('recuperacao')} />
        </div>
      </div>

      {/* Week grid */}
      <div className="space-y-2">
        {WEEKDAYS.map(day => {
          const entry = plan[day.id];
          const activity = entry?.activity_id ? TRAINING_ACTIVITIES.find(a => a.id === entry.activity_id) : null;
          const intensity = INTENSITY_LEVELS.find(i => i.id === entry?.intensity) || INTENSITY_LEVELS[1];
          const isEditing = editingDay === day.id;
          const category = activity ? TRAINING_CATEGORIES[activity.category] : null;
          const Icon = activity ? getAttributeIcon(activity.icon) : null;

          return (
            <div key={day.id} className={`glass rounded-xl p-3 border ${isEditing ? 'border-primary/40' : 'border-border/40'}`}>
              <div className="flex items-center gap-3">
                {/* Day label */}
                <div className="w-10 text-center shrink-0">
                  <p className="text-xs font-black">{day.label}</p>
                </div>

                {/* Activity or empty */}
                {activity ? (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <div className={`h-8 w-8 rounded-lg ${category?.dot || 'bg-primary/15'} flex items-center justify-center shrink-0`}>
                      {Icon && <Icon className={`h-4 w-4 ${category?.color || 'text-primary'}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{activity.label}</p>
                      <p className={`text-[9px] ${intensity.color} font-bold`}>{intensity.label} · {intensity.fatigueCost} fadiga</p>
                    </div>
                    <button onClick={() => setEditingDay(isEditing ? null : day.id)} className="text-[10px] text-primary font-bold px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">
                      {isEditing ? 'Fechar' : 'Alterar'}
                    </button>
                    <button onClick={() => clearDay(day.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1">Descanso / Livre</p>
                    <button onClick={() => setEditingDay(isEditing ? null : day.id)} className="text-[10px] text-primary font-bold px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">
                      {isEditing ? 'Fechar' : '+ Adicionar'}
                    </button>
                  </div>
                )}
              </div>

              {/* Activity selector */}
              {isEditing && (
                <div className="mt-3 pt-3 border-t border-border/40 animate-fade-in">
                  <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto scrollbar-none">
                    {TRAINING_ACTIVITIES.map(act => {
                      const cat = TRAINING_CATEGORIES[act.category];
                      const ActIcon = getAttributeIcon(act.icon);
                      const isSelected = entry?.activity_id === act.id;
                      return (
                        <button
                          key={act.id}
                          onClick={() => assignActivity(day.id, act.id, entry?.intensity || 'moderado')}
                          className={`flex items-center gap-2 p-2 rounded-lg text-left transition-all ${isSelected ? 'bg-primary/15 border border-primary/30' : 'bg-secondary/30 hover:bg-secondary/50 border border-transparent'}`}
                        >
                          <ActIcon className={`h-4 w-4 ${cat?.color}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold truncate">{act.label}</p>
                            <p className="text-[9px] text-muted-foreground">{cat?.label} · {act.duration}min · +{act.baseGain} {act.attribute}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Intensity selector */}
                  {entry?.activity_id && (
                    <div className="mt-2">
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Intensidade</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {INTENSITY_LEVELS.map(int => (
                          <button
                            key={int.id}
                            onClick={() => assignActivity(day.id, entry.activity_id, int.id)}
                            className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                              entry.intensity === int.id
                                ? `bg-primary/20 ${int.color} border border-primary/40`
                                : 'bg-secondary/40 text-muted-foreground border border-transparent'
                            }`}
                          >
                            {int.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Attribute focus */}
      {Object.keys(summary.attributesFocused).length > 0 && (
        <div className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Foco da Semana</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.attributesFocused).map(([attr, count]) => (
              <span key={attr} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold">
                {attr} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PresetButton({ label, onClick }) {
  return <button onClick={onClick} className="rounded-xl border border-border/50 bg-secondary/25 px-2 py-2 text-[10px] font-bold hover:border-primary/40 hover:text-primary transition-colors">{label}</button>;
}

function SummaryStat({ icon: Icon, label, value, color }) {
  return (
    <div className="text-center">
      <Icon className={`h-4 w-4 ${color} mx-auto mb-1`} />
      <p className="text-lg font-black tabular-nums">{value}</p>
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}
