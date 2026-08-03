import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Target, Check, Coins, Zap, Award, Calendar, Flame, Trophy, Clock, RotateCcw, GraduationCap, ArrowRight, Lock } from 'lucide-react';
import { ensureMyProfile, ensureTutorialMissionCatalog, missionPeriodEndsAt, missionPeriodKey, syncMissionProgressPeriods } from '@/lib/padel';
import { SectionCard, EmptyState, ProgressBar, CoinBadge } from '@/components/padel/GameShared';
import { LoadingScreen } from '@/components/padel/ui';
import { safeModuleTask } from '@/lib/moduleLoading';
import { CAREER_STYLE_PROFILES, ATTRIBUTE_LABELS, buildInitialAttributes } from '@/lib/initialCareerProfiles';

const TABS = [
  { key: 'tutorial', label: 'Tutorial', icon: GraduationCap },
  { key: 'diaria', label: 'Diárias', icon: Calendar },
  { key: 'semanal', label: 'Semanais', icon: Flame },
  { key: 'mensal', label: 'Mensais', icon: Clock },
  { key: 'sazonal', label: 'Sazonais', icon: Trophy },
];

const EXTRA_MISSIONS = [
  { title: 'Rotina de atleta', description: 'Complete 12 sessões de treino no mês', mission_type: 'mensal', objective_type: 'complete_training', target_count: 12, xp_reward: 180, coins_reward: 120 },
  { title: 'Calendário competitivo', description: 'Dispute 8 partidas no mês', mission_type: 'mensal', objective_type: 'play_matches', target_count: 8, xp_reward: 220, coins_reward: 150 },
  { title: 'Caçador de troféus', description: 'Vença 2 torneios no mês', mission_type: 'mensal', objective_type: 'win_tournament', target_count: 2, xp_reward: 500, coins_reward: 350 },
  { title: 'Temporada consistente', description: 'Vença 25 partidas na temporada', mission_type: 'sazonal', objective_type: 'win_matches', target_count: 25, xp_reward: 1200, coins_reward: 900 },
  { title: 'Presença no circuito', description: 'Participe de 12 torneios na temporada', mission_type: 'sazonal', objective_type: 'join_tournament', target_count: 12, xp_reward: 1000, coins_reward: 750 },
  { title: 'Temporada de campeão', description: 'Conquiste 3 torneios na temporada', mission_type: 'sazonal', objective_type: 'win_tournament', target_count: 3, xp_reward: 2000, coins_reward: 1500, medal_reward: 'Temporada de Campeão' },
];

function daysRemaining(careerDate, endDate) {
  const start = new Date(`${careerDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return Math.max(0, Math.ceil((end - start) / 86400000));
}

async function ensureExtendedMissionCatalog() {
  await ensureTutorialMissionCatalog();
  const existing = await localGame.entities.Mission.list('-created_date', 300);
  const titles = new Set((existing || []).map(m => m.title));
  const missing = EXTRA_MISSIONS.filter(m => !titles.has(m.title));
  if (missing.length) {
    try { await localGame.entities.Mission.bulkCreate(missing.map(m => ({ ...m, is_active: true }))); }
    catch { for (const mission of missing) await localGame.entities.Mission.create({ ...mission, is_active: true }); }
  }
}

export default function Missions() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [missions, setMissions] = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tutorial');
  const [savingChoice, setSavingChoice] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const user = await localGame.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);
      await safeModuleTask(() => ensureExtendedMissionCatalog(), { label: 'catálogo de missões', fallback: null, timeoutMs: 10000 });
      const missionsData = await safeModuleTask(
        () => localGame.entities.Mission.filter({ is_active: true }),
        { label: 'missões ativas', fallback: [] },
      );
      let progData = p ? await safeModuleTask(
        () => localGame.entities.MissionProgress.filter({ profile_id: p.id }),
        { label: 'progresso das missões', fallback: [] },
      ) : [];
      await safeModuleTask(() => syncMissionProgressPeriods(p, missionsData, progData), { label: 'sincronização das missões', fallback: null });
      progData = p ? await safeModuleTask(
        () => localGame.entities.MissionProgress.filter({ profile_id: p.id }),
        { label: 'releitura do progresso das missões', fallback: progData },
      ) : [];
      setMissions(missionsData || []);
      setProgress(Object.fromEntries((progData || []).map(pr => [pr.mission_id, pr])));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }


  async function updateOnboarding(fields) {
    if (!profile?.id) return;
    setSavingChoice(true);
    try {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, fields);
      setProfile(updated);
    } finally {
      setSavingChoice(false);
    }
  }

  const onboardingStage = profile?.onboarding_completed
    ? 'completed'
    : (profile?.onboarding_stage || 'welcome');

  async function chooseSide(side) {
    await updateOnboarding({
      court_side: side,
      play_style: null,
      onboarding_stage: 'style',
    });
  }

  async function chooseStyle(style) {
    const side = profile?.court_side;
    const attributes = buildInitialAttributes(side, style);
    await updateOnboarding({
      ...attributes,
      play_style: style,
      unspent_attribute_points: 0,
      onboarding_completed: true,
      onboarding_stage: 'completed',
    });
  }

  const tutorialMissions = useMemo(() => missions.filter(m => m.mission_type === 'tutorial').sort((a, b) => Number(a.tutorial_order || 0) - Number(b.tutorial_order || 0)), [missions]);
  const nextTutorial = tutorialMissions.find(m => !progress[m.id]?.claimed);
  const tutorialDone = tutorialMissions.filter(m => progress[m.id]?.claimed).length;
  const filtered = tab === 'tutorial' ? tutorialMissions : missions.filter(m => m.mission_type === tab);
  const summary = useMemo(() => {
    const current = filtered;
    return { total: current.length, completed: current.filter(m => progress[m.id]?.claimed).length };
  }, [filtered, progress]);

  if (loading) return <LoadingScreen />;
  const careerDate = profile?.career_date || '2026-01-01';
  const remaining = tab === 'tutorial' ? null : daysRemaining(careerDate, missionPeriodEndsAt(tab, careerDate));

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-3xl glass p-5 md:p-6 grid-bg">
        <div className="relative flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0"><Target className="h-7 w-7 text-amber-400" /></div>
          <div className="flex-1"><h1 className="text-xl md:text-2xl font-black tracking-tight">Missões e Tutorial</h1><p className="text-sm text-muted-foreground">Aprenda o jogo passo a passo e receba recompensas automaticamente</p></div>
          <CoinBadge coins={profile?.coins || 0} size="md" />
        </div>
      </div>

      {onboardingStage !== 'completed' && <div className="glass rounded-3xl border border-primary/50 p-5 md:p-7 bg-primary/5 space-y-5">
        {onboardingStage === 'welcome' && <>
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Primeiros passos</p><h2 className="text-2xl font-black mt-2">Bem-vindo ao Padel Legacy</h2><p className="text-muted-foreground mt-2">Sua carreira já foi criada. Agora o treinador vai ajudar você a definir sua função em quadra e sua identidade tática.</p></div>
          <button disabled={savingChoice} onClick={() => updateOnboarding({ onboarding_stage: 'side' })} className="rounded-xl bg-primary text-primary-foreground px-5 py-3 font-bold">Começar tutorial <ArrowRight className="inline h-4 w-4 ml-1" /></button>
        </>}

        {onboardingStage === 'side' && <>
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Escolha seu lado</p><h2 className="text-2xl font-black mt-2">Onde você prefere jogar?</h2><p className="text-muted-foreground mt-2">Essa escolha define sua responsabilidade principal dentro da dupla.</p></div>
          <div className="grid md:grid-cols-2 gap-4">
            <button disabled={savingChoice} onClick={() => chooseSide('direita')} className="rounded-2xl border border-border/70 p-5 text-left hover:border-primary transition-colors"><h3 className="text-xl font-black">Direita</h3><p className="text-sm text-muted-foreground mt-2">Construção dos pontos, consistência, defesa e organização tática.</p></button>
            <button disabled={savingChoice} onClick={() => chooseSide('esquerda')} className="rounded-2xl border border-border/70 p-5 text-left hover:border-primary transition-colors"><h3 className="text-xl font-black">Esquerda</h3><p className="text-sm text-muted-foreground mt-2">Pressão ofensiva, bolas aéreas, potência e definição dos pontos.</p></button>
          </div>
        </>}

        {onboardingStage === 'style' && <>
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Defina seu estilo</p><h2 className="text-2xl font-black mt-2">Escolha sua identidade tática</h2><p className="text-muted-foreground mt-2">Três atributos ficarão no nível 15. Todos os demais começarão no nível 10.</p></div>
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(CAREER_STYLE_PROFILES[profile?.court_side] || {}).map(([key, option]) => <button key={key} disabled={savingChoice} onClick={() => chooseStyle(key)} className="rounded-2xl border border-border/70 p-5 text-left hover:border-primary transition-colors"><h3 className="text-xl font-black">{option.label}</h3><p className="text-sm text-muted-foreground mt-2">{option.description}</p><div className="flex flex-wrap gap-2 mt-4">{option.strengths.map(attr => <span key={attr} className="rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-bold">{ATTRIBUTE_LABELS[attr]} 15</span>)}</div></button>)}
          </div>
          <button disabled={savingChoice} onClick={() => updateOnboarding({ court_side: null, onboarding_stage: 'side' })} className="text-sm font-bold text-muted-foreground">Voltar e trocar o lado</button>
        </>}
      </div>}

      {nextTutorial ? <div className="glass rounded-2xl border border-primary/40 p-5 bg-primary/5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center"><GraduationCap className="h-6 w-6 text-primary" /></div>
          <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-primary font-bold">Próximo passo do tutorial · {tutorialDone + 1}/{tutorialMissions.length}</p><h2 className="font-black text-lg mt-1">{nextTutorial.title}</h2><p className="text-sm text-muted-foreground mt-1">{nextTutorial.description}</p>
            <div className="mt-3 flex items-center gap-3"><ProgressBar value={progress[nextTutorial.id]?.progress || 0} max={nextTutorial.target_count || 1} className="flex-1" /><span className="text-xs font-bold">{progress[nextTutorial.id]?.progress || 0}/{nextTutorial.target_count || 1}</span></div>
          </div>
          {nextTutorial.tutorial_route && <button onClick={() => navigate(nextTutorial.tutorial_route)} className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Ir agora <ArrowRight className="h-4 w-4" /></button>}
        </div>
      </div> : <div className="glass rounded-2xl border border-primary/40 p-5 flex items-center gap-4"><Award className="h-9 w-9 text-primary" /><div><p className="font-black">Tutorial concluído!</p><p className="text-sm text-muted-foreground">Você conheceu os principais sistemas do Padel Legacy.</p></div></div>}

      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-3"><p className="text-[10px] uppercase text-muted-foreground">Objetivos</p><p className="text-xl font-black">{summary.total}</p></div>
        <div className="glass rounded-2xl p-3"><p className="text-[10px] uppercase text-muted-foreground">Finalizados</p><p className="text-xl font-black text-primary">{summary.completed}</p></div>
        <div className="glass rounded-2xl p-3"><p className="text-[10px] uppercase text-muted-foreground">Recompensa</p><p className="text-sm font-black">Automática</p></div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">{TABS.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`min-w-[125px] flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm ${tab === t.key ? 'bg-primary/15 text-primary' : 'glass text-muted-foreground hover:text-foreground'}`}><t.icon className="h-4 w-4" />{t.label}</button>)}</div>

      <div className="glass rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-muted-foreground">
        <RotateCcw className="h-4 w-4 text-primary shrink-0" />
        <span>{tab === 'tutorial' ? 'As etapas são liberadas em sequência. Ao concluir, a recompensa é entregue e a próxima etapa é desbloqueada.' : `Período atual: ${missionPeriodKey(tab, careerDate).split(':')[1]}. Renovação em ${remaining === 0 ? 'hoje' : `${remaining} dia${remaining === 1 ? '' : 's'}`}.`}</span>
      </div>

      {filtered.length === 0 ? <SectionCard title="Missões" icon={Target}><EmptyState icon={Target} message="Nenhuma missão ativa." /></SectionCard> : <div className="space-y-3 animate-stagger">
        {filtered.map((m, index) => {
          const pr = progress[m.id];
          const done = Boolean(pr?.claimed);
          const current = Number(pr?.progress || 0);
          const locked = tab === 'tutorial' && !done && nextTutorial?.id !== m.id;
          return <div key={m.id} className={`glass rounded-2xl p-4 ${done ? 'opacity-60' : ''} ${locked ? 'opacity-45' : ''} ${nextTutorial?.id === m.id ? 'border-primary/40' : ''}`}>
            <div className="flex items-start gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${done ? 'bg-primary/20' : locked ? 'bg-secondary/60' : 'bg-amber-500/15'}`}>{done ? <Check className="h-5 w-5 text-primary" /> : locked ? <Lock className="h-5 w-5 text-muted-foreground" /> : <Target className="h-5 w-5 text-amber-400" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2"><p className="font-semibold text-sm">{tab === 'tutorial' && <span className="text-primary mr-2">#{index + 1}</span>}{m.title}</p><span className="text-[10px] uppercase font-bold text-muted-foreground">{done ? 'Concluída' : locked ? 'Bloqueada' : 'Em andamento'}</span></div>
                <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                <div className="mt-3 flex items-center gap-3"><ProgressBar value={done ? m.target_count : current} max={m.target_count || 1} className="flex-1" /><span className="text-xs font-bold">{done ? m.target_count : current}/{m.target_count || 1}</span></div>
                <div className="flex flex-wrap gap-3 mt-3 text-xs"><span className="flex items-center gap-1 text-cyan-400"><Zap className="h-3.5 w-3.5" />+{m.xp_reward || 0} XP</span><span className="flex items-center gap-1 text-amber-400"><Coins className="h-3.5 w-3.5" />+{m.coins_reward || 0}</span>{m.medal_reward && <span className="flex items-center gap-1 text-primary"><Award className="h-3.5 w-3.5" />{m.medal_reward}</span>}</div>
              </div>
              {!locked && !done && m.tutorial_route && <button onClick={() => navigate(m.tutorial_route)} className="text-xs font-bold text-primary inline-flex items-center gap-1">Ir <ArrowRight className="h-3.5 w-3.5" /></button>}
            </div>
          </div>;
        })}
      </div>}
    </div>
  );
}
