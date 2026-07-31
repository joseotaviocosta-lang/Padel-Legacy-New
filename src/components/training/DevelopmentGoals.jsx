import React, { useState } from 'react';
import { Target, Plus, Trash2, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { ATTRIBUTES } from '@/lib/padel';
import { createGoal, deleteGoal } from '@/lib/trainingSystem';
import { useToast } from '@/components/ui/use-toast';

// ── Development Goals ────────────────────────────────────────────────────
// Players can set attribute targets with deadlines. The component shows
// progress toward each goal and highlights completed ones.
export default function DevelopmentGoals({ profile, onProfileUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [newAttr, setNewAttr] = useState(ATTRIBUTES[0].key);
  const [newTarget, setNewTarget] = useState(50);
  const [newDeadline, setNewDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const goals = profile?.development_goals || [];

  async function handleCreate() {
    const currentVal = Number(profile?.[newAttr]) || 0;
    if (newTarget <= currentVal) {
      toast({ title: 'Meta inválida', description: 'O alvo deve ser maior que o valor atual.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const updated = await createGoal(profile, newAttr, newTarget, newDeadline || null);
      onProfileUpdate?.(updated);
      setShowForm(false);
      toast({ title: 'Meta criada!', description: `Alcançar ${newTarget} em ${ATTRIBUTES.find(a => a.key === newAttr)?.label}.` });
    } catch (e) {
      toast({ title: 'Erro', description: 'Falha ao criar meta.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(goalId) {
    setBusy(true);
    try {
      const updated = await deleteGoal(profile, goalId);
      onProfileUpdate?.(updated);
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass rounded-2xl p-4 grid-bg flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Metas de Desenvolvimento
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Defina objetivos de atributos para acompanhar sua evolução</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-all"
        >
          <Plus className="h-3.5 w-3.5" /> Nova Meta
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="glass rounded-2xl p-4 border border-primary/30 animate-fade-in">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Atributo</label>
              <select
                value={newAttr}
                onChange={e => {
                  setNewAttr(e.target.value);
                  const current = Number(profile?.[e.target.value]) || 0;
                  setNewTarget(Math.min(100, current + 10));
                }}
                className="w-full mt-1 bg-secondary/60 rounded-xl px-3 py-2 text-sm border border-border/40 focus:border-primary/40 outline-none"
              >
                {ATTRIBUTES.map(a => (
                  <option key={a.key} value={a.key}>{a.label} (atual: {Number(profile?.[a.key]) || 0})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Alvo: {newTarget}/100</label>
              <input
                type="range"
                min={Math.min(100, (Number(profile?.[newAttr]) || 0) + 1)}
                max={100}
                value={newTarget}
                onChange={e => setNewTarget(Number(e.target.value))}
                className="w-full mt-1 accent-primary"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Prazo (opcional)</label>
              <input
                type="date"
                value={newDeadline}
                onChange={e => setNewDeadline(e.target.value)}
                className="w-full mt-1 bg-secondary/60 rounded-xl px-3 py-2 text-sm border border-border/40 focus:border-primary/40 outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all disabled:opacity-40"
              >
                {busy ? 'Criando...' : 'Criar Meta'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 rounded-xl glass text-muted-foreground font-semibold text-sm hover:text-foreground transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goals list */}
      {goals.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <Target className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma meta definida. Crie objetivos para acompanhar sua evolução!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map(goal => {
            const attr = ATTRIBUTES.find(a => a.key === goal.attribute);
            const current = Number(profile?.[goal.attribute]) || 0;
            const target = goal.target || 100;
            const pct = Math.min(100, (current / target) * 100);
            const completed = current >= target || goal.completed;
            const isOverdue = goal.deadline && !completed && profile?.career_date && goal.deadline < profile.career_date;

            return (
              <div key={goal.id} className={`glass rounded-2xl p-4 border ${completed ? 'border-green-500/40' : isOverdue ? 'border-red-500/40' : 'border-border/40'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {completed ? (
                      <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />
                    ) : (
                      <Target className="h-5 w-5 text-primary shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-sm">{attr?.label || goal.attribute}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {completed ? 'Meta concluída!' : isOverdue ? 'Prazo expirado' : `Alvo: ${target}/100`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(goal.id)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="mb-2">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-bold tabular-nums">{current}/{target}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-secondary/60 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${completed ? 'bg-green-500' : isOverdue ? 'bg-red-500' : 'bg-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Deadline */}
                {goal.deadline && !completed && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Prazo: {new Date(goal.deadline + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>
                )}

                {/* Remaining */}
                {!completed && !isOverdue && (
                  <div className="flex items-center gap-1 text-[10px] text-primary">
                    <TrendingUp className="h-3 w-3" />
                    <span>Faltam {Math.max(0, target - current)} pontos</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}