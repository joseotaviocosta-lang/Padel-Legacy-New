import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrainCircuit, ChevronDown, ChevronUp, ClipboardCheck, HeartPulse, Save, Users } from 'lucide-react';
import { Surface, SurfaceHeader, StatusBadge, ProgressBar } from '@/components/design-system';
import { saveWeeklyPlan } from '@/lib/trainingSystemV2.js';

const tone = (value) => value >= 70 ? 'success' : value >= 45 ? 'warning' : 'danger';

export default function StrategicCareerPanel({ profile, state, onProfileUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!state) return null;
  async function acceptPlan() {
    setSaving(true);
    try {
      const updated = await saveWeeklyPlan(profile, state.weeklyPlan.plan, true);
      onProfileUpdate?.(updated);
    } finally { setSaving(false); }
  }
  const statuses = [
    ['Momento', state.moment, state.score], ['Forma', state.form.label, state.form.rate], ['Equipe', state.teamStatus, state.staffSynergy],
    ['Dupla', state.partnerStatus, state.partnerTrust], ['Treinador', state.coachStatus, state.coachTrust], ['Torcida', state.fanStatus, state.fanMood],
  ];
  return <Surface variant="premium" className="overflow-hidden">
    <SurfaceHeader title="Como está sua carreira?" description="Leitura estratégica explicada a partir da condição, resultados e relacionamentos." icon={BrainCircuit} action={<StatusBadge tone={tone(state.score)}>{state.score}/100</StatusBadge>} />
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{statuses.map(([label, value, score]) => <div key={label} className="rounded-xl bg-secondary/25 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span><strong className="text-xs">{value}</strong></div><ProgressBar value={score} max={100} className="mt-2" /></div>)}</div>
    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black">Plano recomendado: {state.weeklyPlan.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{state.weeklyPlan.reason}</p></div><button onClick={acceptPlan} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"><Save className="h-3.5 w-3.5" />{saving ? 'Aplicando…' : 'Aceitar plano'}</button></div></div>
    <button onClick={() => setExpanded((v) => !v)} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-primary">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{expanded ? 'Ocultar análises' : 'Ver recomendações e motivos'}</button>
    {expanded && <div className="mt-3 grid gap-3 lg:grid-cols-3">{state.recommendations.map((item) => <Link key={item.id} to={item.route} className="rounded-xl border border-border/60 bg-card/50 p-3 transition hover:border-primary/30"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">{item.source === 'Parceiro' ? <Users className="h-4 w-4" /> : item.source === 'Treinador' ? <ClipboardCheck className="h-4 w-4" /> : <HeartPulse className="h-4 w-4" />}</span><div><p className="text-[10px] font-bold uppercase text-primary">{item.source}</p><p className="text-xs font-black">{item.title}</p></div></div><p className="mt-2 text-[10px] text-muted-foreground">{item.body}</p><div className="mt-2 space-y-1">{item.explain.map((reason) => <p key={reason} className="text-[9px] text-muted-foreground">• {reason}</p>)}</div></Link>)}</div>}
  </Surface>;
}
