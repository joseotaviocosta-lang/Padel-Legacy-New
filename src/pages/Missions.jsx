import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Target, Check, Coins, Zap, Award, Calendar, Flame, Trophy, Clock, RotateCcw, GraduationCap, ArrowRight, Lock, AlertTriangle } from 'lucide-react';
import { ensureMyProfile, TUTORIAL_MISSIONS, incrementMissionProgress, missionPeriodEndsAt, missionPeriodKey, syncMissionProgressPeriods } from '@/lib/padel';
import { SectionCard, EmptyState, ProgressBar, CoinBadge } from '@/components/padel/GameShared';
import { LoadingScreen } from '@/components/padel/ui';
import { safeModuleTask } from '@/lib/moduleLoading';
import { CAREER_STYLE_PROFILES, ATTRIBUTE_LABELS, buildInitialAttributes } from '@/lib/initialCareerProfiles';
import { applyTutorialSide } from '@/lib/tutorialSideState.js';
import { findMissingMissionCatalog } from '@/lib/missionCatalogLogic';
import { reconcilePersistedTutorial } from '@/onboarding/tutorialReconciliation.js';
import { getCurrentTutorialStep, getTutorialProgress } from '@/onboarding/tutorialState.js';

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

async function syncExtendedMissionCatalog() {
  const existing = await localGame.entities.Mission.list('-created_date', 300);
  const missing = findMissingMissionCatalog(existing, [...TUTORIAL_MISSIONS, ...EXTRA_MISSIONS]);
  if (missing.length) {
    try { await localGame.entities.Mission.bulkCreate(missing.map(m => ({ ...m, is_active: true }))); }
    catch {
      const refreshed = await localGame.entities.Mission.list('-created_date', 300);
      const stillMissing = findMissingMissionCatalog(refreshed, missing);
      for (const mission of stillMissing) await localGame.entities.Mission.create({ ...mission, is_active: true });
    }
  }
}

let catalogSyncPromise = null;
function ensureExtendedMissionCatalog() {
  if (!catalogSyncPromise) {
    catalogSyncPromise = syncExtendedMissionCatalog().finally(() => { catalogSyncPromise = null; });
  }
  return catalogSyncPromise;
}

export default function Missions() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [missions, setMissions] = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tutorial');
  const [savingChoice, setSavingChoice] = useState(false);
  const [athleteName, setAthleteName] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const user = await localGame.auth.me();
      let p = await ensureMyProfile(user);
      await ensureExtendedMissionCatalog();
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
      const [registrations, matches, trainings] = await Promise.all([
        localGame.entities.CalendarEvent.filter({ profile_id: p.id, event_type: 'tournament' }).catch(() => []),
        localGame.entities.Match.list('-created_date', 50).catch(() => []),
        localGame.entities.TrainingSession.filter({ profile_id: p.id }).catch(() => []),
      ]);
      const reconciliation = await reconcilePersistedTutorial(p, { registrations, matches, trainings }, missionsData, progData);
      p = reconciliation.profile || p;
      progData = reconciliation.progressRows || progData;
      setProfile(p);
      setMissions(missionsData || []);
      setProgress(Object.fromEntries((progData || []).map(pr => [pr.mission_id, pr])));
    } catch (e) {
      console.error(e);
      setLoadError('Não foi possível carregar o catálogo de missões. Verifique o armazenamento local e tente novamente.');
    }
    finally { setLoading(false); }
  }


  const tutorialStep = getCurrentTutorialStep(profile?.tutorial_onboarding);
  const tutorialStatus = profile?.tutorial_onboarding?.status;
  const onboardingStage = tutorialStatus === 'completed' ? 'completed' : tutorialStep?.id;

  async function chooseSide(side) {
    if (!['direita', 'esquerda'].includes(side) || !profile?.id) return;
    if (savingChoice) return;
    setSavingChoice(true);
    setActionError(''); setActionFeedback('Salvando lado...');
    try {
      const choice = applyTutorialSide(profile, side);
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        court_side: choice.court_side,
        play_style: choice.play_style,
        onboarding_stage: choice.onboarding_stage,
      });
      await incrementMissionProgress(updated.id, 'choose_court_side', 1, updated.career_date);
      await localGame.entities.PlayerProfile.update(updated.id, { onboarding_stage: 'style' });
      setActionFeedback('Lado salvo. Próximo passo: escolha seu estilo.');
      await load();
    } catch (error) {
      console.error('[tutorial] Falha ao salvar lado.', error);
      setActionError('Não foi possível salvar o lado. Tente novamente.');
      setActionFeedback('');
    } finally {
      setSavingChoice(false);
    }
  }

  async function saveAthleteName(event) {
    event.preventDefault();
    const name = athleteName.trim();
    if (savingChoice || !profile?.id || !name || name.length > 40) return;
    setSavingChoice(true);
    setActionError(''); setActionFeedback('Salvando nome...');
    try {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: name });
      await incrementMissionProgress(updated.id, 'set_player_name', 1, updated.career_date);
      setAthleteName(name);
      setActionFeedback('Nome salvo. Próximo passo: escolha seu lado de jogo.');
      await load();
    } catch (error) {
      console.error('[tutorial] Falha ao salvar nome.', error);
      setActionError('Não foi possível salvar seu nome. Tente novamente.');
      setActionFeedback('');
    } finally { setSavingChoice(false); }
  }

  async function chooseStyle(style) {
    const side = profile?.court_side;
    if (!side || !CAREER_STYLE_PROFILES[side]?.[style]) return;
    if (savingChoice) return;
    const attributes = buildInitialAttributes(side, style);
    setSavingChoice(true);
    setActionError(''); setActionFeedback('Salvando estilo...');
    try {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, {
        ...attributes,
        play_style: style,
        unspent_attribute_points: 0,
        onboarding_completed: false,
        onboarding_stage: 'first-training',
      });
      await incrementMissionProgress(updated.id, 'choose_play_style', 1, updated.career_date);
      setActionFeedback('Estilo salvo. Próximo passo: faça seu primeiro treino.');
      await load();
    } catch (error) {
      console.error('[tutorial] Falha ao salvar estilo.', error);
      setActionError('Não foi possível salvar o estilo. Tente novamente.');
      setActionFeedback('');
    } finally {
      setSavingChoice(false);
    }
  }

  const tutorialMissions = useMemo(() => missions.filter(m => m.mission_type === 'tutorial').sort((a, b) => Number(a.tutorial_order || 0) - Number(b.tutorial_order || 0)), [missions]);
  const nextTutorial = tutorialStatus === 'in_progress' ? tutorialMissions.find(m => m.objective_type === tutorialStep?.objectiveType) : null;
  const tutorialDone = getTutorialProgress(profile?.tutorial_onboarding).completed;
  const inlineAction = ['set_player_name', 'choose_court_side', 'choose_play_style'].includes(nextTutorial?.objective_type);
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
      {loadError && (
        <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button onClick={load} className="rounded-lg border border-amber-400/40 px-3 py-1.5 font-bold">Tentar novamente</button>
        </div>
      )}
      <div className="relative overflow-hidden rounded-3xl glass p-5 md:p-6 grid-bg">
        <div className="relative flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0"><Target className="h-7 w-7 text-amber-400" /></div>
          <div className="flex-1"><h1 className="text-xl md:text-2xl font-black tracking-tight">Missões e Tutorial</h1><p className="text-sm text-muted-foreground">Aprenda o jogo passo a passo e receba recompensas automaticamente</p></div>
          <CoinBadge coins={profile?.coins || 0} size="md" />
        </div>
      </div>

      {inlineAction && onboardingStage !== 'completed' && <div id="tutorial-primary-action" className="glass rounded-3xl border border-primary/50 p-5 md:p-7 bg-primary/5 space-y-5">
        {nextTutorial?.objective_type === 'set_player_name' && <form onSubmit={saveAthleteName} className="space-y-4">
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Identidade do atleta</p><h2 className="text-2xl font-black mt-2">Como seu atleta será conhecido?</h2><p className="text-muted-foreground mt-2">Este nome aparece em partidas e notícias. O nome do save continua separado.</p></div>
          <label className="block text-sm font-bold" htmlFor="tutorial-athlete-name">Nome do atleta</label>
          <div className="flex gap-2"><input id="tutorial-athlete-name" autoFocus value={athleteName} onChange={event => setAthleteName(event.target.value)} maxLength={40} placeholder="Ex.: José Silva" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3"/><button type="submit" disabled={savingChoice || !athleteName.trim()} className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-50">{savingChoice ? 'Salvando...' : 'Salvar nome'}</button></div>
        </form>}

        {nextTutorial?.objective_type === 'choose_court_side' && <>
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Escolha seu lado</p><h2 className="text-2xl font-black mt-2">Onde você prefere jogar?</h2><p className="text-muted-foreground mt-2">Essa escolha define sua responsabilidade principal dentro da dupla.</p></div>
          <div className="grid md:grid-cols-2 gap-4">
            <button type="button" disabled={savingChoice} onClick={() => chooseSide('direita')} className="rounded-2xl border border-border/70 p-5 text-left hover:border-primary transition-colors disabled:opacity-50"><h3 className="text-xl font-black">Direita</h3><p className="text-sm text-muted-foreground mt-2">Construção dos pontos, consistência, defesa e organização tática.</p></button>
            <button type="button" disabled={savingChoice} onClick={() => chooseSide('esquerda')} className="rounded-2xl border border-border/70 p-5 text-left hover:border-primary transition-colors disabled:opacity-50"><h3 className="text-xl font-black">Esquerda</h3><p className="text-sm text-muted-foreground mt-2">Pressão ofensiva, bolas aéreas, potência e definição dos pontos.</p></button>
          </div>
        </>}

        {nextTutorial?.objective_type === 'choose_play_style' && <>
          <div><p className="text-xs uppercase tracking-[0.2em] font-bold text-primary">Missão · Defina seu estilo</p><h2 className="text-2xl font-black mt-2">Escolha sua identidade tática</h2><p className="text-muted-foreground mt-2">Três atributos ficarão no nível 15. Todos os demais começarão no nível 10.</p></div>
          <div className="grid md:grid-cols-2 gap-4">
            {Object.entries(CAREER_STYLE_PROFILES[profile?.court_side] || {}).map(([key, option]) => <button type="button" key={key} disabled={savingChoice} onClick={() => chooseStyle(key)} className="rounded-2xl border border-border/70 p-5 text-left hover:border-primary transition-colors disabled:opacity-50"><h3 className="text-xl font-black">{option.label}</h3><p className="text-sm text-muted-foreground mt-2">{option.description}</p><div className="flex flex-wrap gap-2 mt-4">{option.strengths.map(attr => <span key={attr} className="rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-bold">{ATTRIBUTE_LABELS[attr]} 15</span>)}</div></button>)}
          </div>
        </>}
      </div>}

      {actionFeedback && <p role="status" aria-live="polite" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{actionFeedback}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{actionError}</p>}

      {nextTutorial && !inlineAction ? <div className="glass rounded-2xl border border-primary/40 p-5 bg-primary/5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center"><GraduationCap className="h-6 w-6 text-primary" /></div>
          <div className="flex-1"><p className="text-[10px] uppercase tracking-wider text-primary font-bold">Próximo passo do tutorial · {tutorialDone + 1}/{tutorialMissions.length}</p><h2 className="font-black text-lg mt-1">{nextTutorial.title}</h2><p className="text-sm text-muted-foreground mt-1">{nextTutorial.description}</p>{nextTutorial.why_it_matters && <p className="mt-2 text-xs"><strong>Por que isso importa?</strong> {nextTutorial.why_it_matters}</p>}
            <div className="mt-3 flex items-center gap-3"><ProgressBar value={progress[nextTutorial.id]?.progress || 0} max={nextTutorial.target_count || 1} className="flex-1" /><span className="text-xs font-bold">{progress[nextTutorial.id]?.progress || 0}/{nextTutorial.target_count || 1}</span></div>
          </div>
          {nextTutorial.tutorial_route && <button type="button" onClick={() => navigate(nextTutorial.tutorial_route)} className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{nextTutorial.action_label || 'Ir agora'} <ArrowRight className="h-4 w-4" /></button>}
        </div>
      </div> : !nextTutorial && tutorialStatus === 'completed' ? <div className="glass rounded-2xl border border-primary/40 p-5 flex items-center gap-4"><Award className="h-9 w-9 text-primary" /><div><p className="font-black">Tutorial concluído!</p><p className="text-sm text-muted-foreground">Você conheceu os principais sistemas do Padel Legacy.</p></div></div> : null}

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
                {m.why_it_matters && <p className="mt-2 text-xs"><strong>Por que importa:</strong> {m.why_it_matters}</p>}
                <div className="mt-3 flex items-center gap-3"><ProgressBar value={done ? m.target_count : current} max={m.target_count || 1} className="flex-1" /><span className="text-xs font-bold">{done ? m.target_count : current}/{m.target_count || 1}</span></div>
                <div className="flex flex-wrap gap-3 mt-3 text-xs"><span className="flex items-center gap-1 text-cyan-400"><Zap className="h-3.5 w-3.5" />+{m.xp_reward || 0} XP</span><span className="flex items-center gap-1 text-amber-400"><Coins className="h-3.5 w-3.5" />+{m.coins_reward || 0}</span>{m.medal_reward && <span className="flex items-center gap-1 text-primary"><Award className="h-3.5 w-3.5" />{m.medal_reward}</span>}</div>
              </div>
              {!locked && !done && m.tutorial_route && nextTutorial?.id !== m.id && <button type="button" onClick={() => navigate(m.tutorial_route)} className="text-xs font-bold text-primary inline-flex items-center gap-1">{m.action_label || 'Abrir'} <ArrowRight className="h-3.5 w-3.5" /></button>}
            </div>
          </div>;
        })}
      </div>}
    </div>
  );
}
