import React, { useEffect, useState } from 'react';
import { Activity, Dumbbell, Target, TrendingUp } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import AttributeEvolution from '@/components/training/AttributeEvolution.jsx';
import DevelopmentGoals from '@/components/training/DevelopmentGoals.jsx';
import { EmptyState, Section, StatusBadge, Tabs } from '@/components/design-system';
import { formatAttributeGain } from '@/lib/numberFormat.js';
import { TRAINING_CATEGORIES } from '@/lib/trainingSystemV2.js';

const SECTIONS = [
  { key: 'overview', label: 'Evolução', icon: TrendingUp },
  { key: 'goals', label: 'Metas', icon: Target },
  { key: 'history', label: 'Histórico', icon: Activity },
];

export default function TrainingProgressView({ profile, onProfileUpdate, initialSection = 'overview' }) {
  const entities = /** @type {any} */ (localGame.entities);
  const [activeSection, setActiveSection] = useState(SECTIONS.some((item) => item.key === initialSection) ? initialSection : 'overview');
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    if (activeSection !== 'history' || historyLoaded) return;
    let cancelled = false;
    entities.TrainingSession.filter({ profile_id: profile.id })
      .then((sessions) => {
        if (cancelled) return;
        setHistory((sessions || []).sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '')));
        setHistoryLoaded(true);
      })
      .catch(() => { if (!cancelled) setHistoryLoaded(true); });
    return () => { cancelled = true; };
  }, [activeSection, entities.TrainingSession, historyLoaded, profile.id]);

  return (
    <div className="space-y-3" data-training-center-view="progress">
      <Tabs tabs={SECTIONS} activeTab={activeSection} onTabChange={setActiveSection} variant="buttons" className="" />
      {activeSection === 'overview' && <AttributeEvolution profile={profile} />}
      {activeSection === 'goals' && <DevelopmentGoals profile={profile} onProfileUpdate={(updated) => onProfileUpdate(updated, 'training-center:goals')} />}
      {activeSection === 'history' && (
        <Section title="Histórico de treinos" description={null} icon={Activity} action={null} className="">
          {!historyLoaded ? <p className="text-xs text-muted-foreground">Carregando histórico...</p> : history.length === 0 ? (
            <EmptyState compact icon={Dumbbell} eyebrow={null} title="Nenhum treino registrado" description="Seus treinos concluídos aparecerão aqui." action={null} secondaryAction={null} className="" />
          ) : (
            <div className="space-y-1">
              {history.slice(0, 20).map((training) => (
                <div key={training.id} className="flex min-h-11 items-center gap-3 border-b border-border/40 py-2 last:border-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15"><Dumbbell className="h-4 w-4 text-primary" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{training.training_label}</p>
                    <p className="text-[10px] text-muted-foreground">+{formatAttributeGain(training.attribute_gain)} {training.attribute_target} · +{training.xp_reward} XP{training.category ? ` · ${TRAINING_CATEGORIES[training.category]?.label || training.category}` : ''}</p>
                  </div>
                  <StatusBadge tone={Number(training.coins_cost || 0) > 0 ? 'neutral' : 'premium'} icon={null} className="">
                    {Number(training.coins_cost || 0) > 0 ? `-${Number(training.coins_cost).toLocaleString('pt-BR')}` : `+${Number(training.coins_reward || 0).toLocaleString('pt-BR')}`}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
