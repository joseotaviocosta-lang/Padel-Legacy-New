import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { TRAINING_ACTIVITIES, INTENSITY_LEVELS } from '@/lib/trainingSystemV2';

export default function CalendarPlanner({ profile, selectedDate, events, onSchedule, onCancel, onEdit, busy }) {
  const minimumDate = useMemo(() => {
    const value = new Date(`${profile.career_date}T12:00:00`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
  }, [profile.career_date]);
  const [date, setDate] = useState(selectedDate > profile.career_date ? selectedDate : minimumDate);
  const [kind, setKind] = useState('training');
  const [activityId, setActivityId] = useState(TRAINING_ACTIVITIES[0]?.id || '');
  const [intensityId, setIntensityId] = useState('moderado');
  const [title, setTitle] = useState('');
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  useEffect(() => { if (selectedDate > profile.career_date) setDate(selectedDate); }, [selectedDate, profile.career_date]);
  const planned = (events || []).filter((event) => event.status === 'scheduled' && event.metadata?.planner_created && event.start_date > profile.career_date);
  const activity = TRAINING_ACTIVITIES.find((item) => item.id === activityId);
  const intensity = INTENSITY_LEVELS.find((item) => item.id === intensityId);

  async function submit(event) {
    event.preventDefault();
    await onSchedule({ date, kind, activityId, intensityId, title, repeatWeeks });
    setTitle('');
  }

  // M4.2: título/descrição agora vêm do CollapsibleSection que envolve este
  // componente em CalendarPage.jsx — evita cabeçalho duplicado (Parte 28).
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">O compromisso será executado automaticamente quando a data chegar.</p>
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-semibold">Data<input type="date" min={minimumDate} value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
      <label className="text-xs font-semibold">Atividade<select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="training">Treino</option><option value="rest">Dia de descanso</option><option value="personal">Atividade pessoal</option></select></label>
      {kind === 'training' ? <><label className="text-xs font-semibold">Treino<select value={activityId} onChange={(event) => setActivityId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">{TRAINING_ACTIVITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-xs font-semibold">Intensidade<select value={intensityId} onChange={(event) => setIntensityId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2">{INTENSITY_LEVELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></> : <label className="text-xs font-semibold md:col-span-2">Título<input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'rest' ? 'Dia de descanso' : 'Ex.: Sessão com patrocinador'} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>}
      <label className="text-xs font-semibold">Repetição<select value={repeatWeeks} onChange={(event) => setRepeatWeeks(Number(event.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option value={1}>Somente esta data</option><option value={2}>Semanal por 2 semanas</option><option value={4}>Semanal por 4 semanas</option><option value={8}>Semanal por 8 semanas</option></select></label>
      {kind === 'training' && activity && intensity && <div className="rounded-lg bg-secondary/30 p-2 text-[10px] text-muted-foreground"><p className="font-bold text-foreground">Impacto estimado</p><p>Energia: -{intensity.energyCost} · Fadiga: +{intensity.fatigueCost + (activity.fatigueExtra || 0) - (activity.fatigueReduction || 0)} · Risco: {(intensity.injuryRisk * 100).toFixed(0)}%</p><p>Evolução sujeita às regras reais.</p></div>}
      <button disabled={busy} className="md:col-span-2 rounded-xl bg-cyan-500/15 text-cyan-300 py-2.5 text-xs font-bold hover:bg-cyan-500/25 disabled:opacity-50">Adicionar ao calendário</button>
    </form>
    {planned.length > 0 && <div className="space-y-2 border-t border-border/40 pt-3"><p className="text-xs font-bold">Próximas atividades planejadas</p>{planned.sort((a, b) => a.start_date.localeCompare(b.start_date)).map((event) => <div key={event.id} className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2"><div className="flex-1"><p className="text-xs font-semibold">{event.title}</p><p className="text-[10px] text-muted-foreground">{event.start_date} · {event.description || 'Atividade planejada'}</p></div><button onClick={() => onEdit(event)} disabled={busy} className="p-2 text-cyan-300" title="Reagendar"><Pencil className="h-4 w-4" /></button><button onClick={() => onCancel(event)} disabled={busy} className="p-2 text-rose-300" title="Cancelar"><Trash2 className="h-4 w-4" /></button></div>)}</div>}
  </div>;
}
