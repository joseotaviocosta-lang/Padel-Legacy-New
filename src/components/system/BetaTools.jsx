import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, AlertTriangle, BarChart3, BookOpen, Bug, CheckCircle2, Clock3, Copy, Download, HardDrive, ListChecks, MessageSquarePlus, Play, RefreshCw, RotateCcw, ShieldCheck, Star, Trash2, Wrench, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCareer } from '@/careers/useCareer.js';
import { buildBetaDiagnosticReport, downloadBetaDiagnosticReport, installBetaDiagnostics } from '@/lib/betaDiagnostics.js';
import { buildBetaFeedbackReport, downloadBetaFeedbackReport } from '@/lib/betaFeedback.js';
import { CareerRepository } from '@/careers/CareerRepository.js';
import { BETA_CHECKLIST, buildBetaChecklistReport, downloadJsonFile, loadBetaChecklist, resetBetaChecklist, saveBetaChecklist } from '@/lib/betaReadiness.js';
import { applyWorldRepairPlan, buildWorldRepairPlan, collectWorldHealth, projectWorldHealth } from '@/lib/simulationHealth.js';
import { buildBetaAnalyticsExport, clearBetaAnalytics, getBetaAnalyticsSnapshot, getBetaTesterInsights } from '@/lib/betaAnalytics.js';
import { buildBetaInsights } from '@/lib/betaInsights.js';
import { buildSaveInspectorExport, inspectCareerSave } from '@/lib/saveInspector.js';
import { CLOSED_BETA_CHANGELOG, buildBetaRatingReport, buildBetaSuggestionReport, getLocalBetaRatings, saveLocalBetaRating } from '@/lib/betaCandidate.js';

const INITIAL_FEEDBACK = {
  severity: 'medium',
  category: 'Interface',
  title: '',
  steps: '',
  expected: '',
  actual: '',
  notes: '',
  includeDiagnostic: true,
};


const INITIAL_SUGGESTION = {
  category: 'Experiência geral',
  title: '',
  problem: '',
  idea: '',
  impact: '',
};

const RATING_AREAS = [
  ['match_engine', 'Partidas'],
  ['interface', 'Interface'],
  ['progression', 'Progressão'],
  ['economy', 'Economia'],
  ['press', 'Imprensa'],
  ['staff', 'Comissão técnica'],
  ['tutorial', 'Tutorial'],
];

const careerRepository = new CareerRepository();

const FIELD_CLASS = 'w-full rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

export default function BetaTools({ compact = false }) {
  const location = useLocation();
  const { activeCareer } = useCareer();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState('feedback');
  const [feedback, setFeedback] = useState(INITIAL_FEEDBACK);
  const [checklist, setChecklist] = useState(() => loadBetaChecklist(activeCareer?.career_id));
  const [saveStatus, setSaveStatus] = useState('');
  const [backupCount, setBackupCount] = useState(0);
  const [worldHealth, setWorldHealth] = useState(null);
  const [worldProjection, setWorldProjection] = useState(null);
  const [healthStatus, setHealthStatus] = useState('');
  const [repairPlan, setRepairPlan] = useState(null);
  const [repairResult, setRepairResult] = useState(null);
  const [repairing, setRepairing] = useState(false);
  const [analytics, setAnalytics] = useState(() => getBetaAnalyticsSnapshot());
  const testerInsights = useMemo(() => getBetaTesterInsights(analytics), [analytics]);
  const betaInsights = useMemo(() => buildBetaInsights(analytics), [analytics]);
  const [saveInspection, setSaveInspection] = useState(null);
  const [inspectorStatus, setInspectorStatus] = useState('');
  const [suggestion, setSuggestion] = useState(INITIAL_SUGGESTION);
  const [ratings, setRatings] = useState(() => Object.fromEntries(RATING_AREAS.map(([id]) => [id, 4])));
  const [continuePlaying, setContinuePlaying] = useState('maybe');
  const [ratingNotes, setRatingNotes] = useState('');
  const [ratingStatus, setRatingStatus] = useState('');
  const [ratingCount, setRatingCount] = useState(() => getLocalBetaRatings().length);

  useEffect(() => installBetaDiagnostics(), []);

  useEffect(() => {
    const refresh = () => setAnalytics(getBetaAnalyticsSnapshot());
    window.addEventListener('padel:beta-analytics-updated', refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => { window.removeEventListener('padel:beta-analytics-updated', refresh); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setChecklist(loadBetaChecklist(activeCareer?.career_id));
    setSaveStatus('');
    if (!activeCareer?.career_id) { setBackupCount(0); return; }
    careerRepository.listBackupFiles(activeCareer.career_id).then(items => setBackupCount(items.length)).catch(() => setBackupCount(0));
  }, [activeCareer?.career_id]);

  const canExportFeedback = useMemo(
    () => feedback.title.trim().length >= 4 && feedback.actual.trim().length >= 4,
    [feedback.actual, feedback.title],
  );

  async function copyDiagnostic() {
    const report = buildBetaDiagnosticReport({ career: activeCareer, pathname: location.pathname });
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function copyFeedback() {
    if (!canExportFeedback) return;
    const report = buildBetaFeedbackReport({ career: activeCareer, pathname: location.pathname, feedback });
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function updateFeedback(field, value) {
    setFeedback(current => ({ ...current, [field]: value }));
  }
  function toggleChecklistItem(itemId) {
    const next = { ...checklist, [itemId]: !checklist[itemId] };
    setChecklist(next);
    saveBetaChecklist(activeCareer?.career_id, next);
  }

  async function createManualBackup() {
    if (!activeCareer?.career_id) return;
    setSaveStatus('Criando backup…');
    try {
      const career = await careerRepository.readCareer(activeCareer.career_id);
      await careerRepository.writeBackup(activeCareer.career_id, career);
      const backups = await careerRepository.listBackupFiles(activeCareer.career_id);
      setBackupCount(backups.length);
      setSaveStatus('Backup criado com sucesso.');
    } catch (error) {
      console.error('Falha ao criar backup manual', error);
      setSaveStatus(`Falha ao criar backup: ${error?.message || 'erro desconhecido'}`);
    }
  }

  async function runWorldHealthAudit() {
    setHealthStatus('Analisando o universo…');
    try {
      const report = await collectWorldHealth({ career: activeCareer });
      setWorldHealth(report);
      setWorldProjection(null);
      setRepairPlan(null);
      setRepairResult(null);
      setHealthStatus(`Auditoria concluída: ${report.status} (${report.score}/100).`);
    } catch (error) {
      console.error('Falha na auditoria do mundo', error);
      setHealthStatus(`Falha na auditoria: ${error?.message || 'erro desconhecido'}`);
    }
  }

  function runProjection(seasons) {
    if (!worldHealth) return;
    const projection = projectWorldHealth(worldHealth, seasons);
    setWorldProjection(projection);
    setHealthStatus(`Projeção de ${seasons} temporadas concluída sem alterar o save.`);
  }


  async function prepareSafeRepairs() {
    setHealthStatus('Preparando plano de correções seguras…');
    try {
      const plan = await buildWorldRepairPlan({ career: activeCareer });
      setRepairPlan(plan);
      setRepairResult(null);
      setHealthStatus(plan.total ? `${plan.total} correções seguras preparadas. Revise antes de aplicar.` : 'Nenhuma correção segura necessária.');
    } catch (error) {
      console.error('Falha ao preparar correções do mundo', error);
      setHealthStatus(`Falha ao preparar correções: ${error?.message || 'erro desconhecido'}`);
    }
  }

  async function applySafeRepairs() {
    if (!repairPlan?.total || repairing) return;
    setRepairing(true);
    setHealthStatus('Criando backup e aplicando correções seguras…');
    try {
      if (activeCareer?.career_id) {
        const career = await careerRepository.readCareer(activeCareer.career_id);
        await careerRepository.writeBackup(activeCareer.career_id, career);
        const backups = await careerRepository.listBackupFiles(activeCareer.career_id);
        setBackupCount(backups.length);
      }
      const result = await applyWorldRepairPlan(repairPlan);
      setRepairResult(result);
      const report = await collectWorldHealth({ career: activeCareer });
      setWorldHealth(report);
      setRepairPlan(null);
      setHealthStatus(`Correções concluídas: ${result.applied} aplicadas, ${result.failed} falharam. Saúde atual: ${report.score}/100.`);
    } catch (error) {
      console.error('Falha ao aplicar correções do mundo', error);
      setHealthStatus(`Falha ao aplicar correções: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setRepairing(false);
    }
  }

  async function runSaveInspector() {
    if (!activeCareer?.career_id) {
      setInspectorStatus('Nenhuma carreira ativa para inspecionar.');
      return;
    }
    setInspectorStatus('Lendo e validando o save…');
    try {
      const career = await careerRepository.readCareer(activeCareer.career_id);
      const report = inspectCareerSave(career);
      setSaveInspection(report);
      setInspectorStatus(`Inspeção concluída: ${report.status} (${report.score}/100).`);
    } catch (error) {
      console.error('Falha no Save Inspector', error);
      setSaveInspection(null);
      setInspectorStatus(`Falha ao inspecionar o save: ${error?.message || 'erro desconhecido'}`);
    }
  }

  async function exportActiveSave() {
    if (!activeCareer?.career_id) return;
    setSaveStatus('Preparando exportação…');
    try {
      const career = await careerRepository.readCareer(activeCareer.career_id);
      downloadJsonFile(career, `padel-legacy-save-${activeCareer.career_id}-${Date.now()}.json`);
      setSaveStatus('Save exportado. Guarde o arquivo em local seguro.');
    } catch (error) {
      console.error('Falha ao exportar save', error);
      setSaveStatus(`Falha ao exportar: ${error?.message || 'erro desconhecido'}`);
    }
  }


  function updateSuggestion(field, value) {
    setSuggestion(current => ({ ...current, [field]: value }));
  }

  function downloadObject(data, filename) {
    downloadJsonFile(data, filename);
  }

  function exportSuggestion() {
    const report = buildBetaSuggestionReport({
      careerId: activeCareer?.career_id,
      pathname: location.pathname,
      suggestion,
    });
    downloadObject(report, `padel-legacy-sugestao-${Date.now()}.json`);
  }

  function saveRating() {
    const report = buildBetaRatingReport({
      careerId: activeCareer?.career_id,
      ratings,
      continuePlaying,
      notes: ratingNotes,
    });
    saveLocalBetaRating(report);
    setRatingCount(getLocalBetaRatings().length);
    setRatingStatus('Avaliação salva localmente. Você também pode exportá-la para compartilhar.');
  }

  function exportRating() {
    const report = buildBetaRatingReport({
      careerId: activeCareer?.career_id,
      ratings,
      continuePlaying,
      notes: ratingNotes,
    });
    downloadObject(report, `padel-legacy-avaliacao-beta-${Date.now()}.json`);
  }


  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Relatar problema da versão beta" className={`inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 font-black text-amber-300 transition-colors hover:bg-amber-400/15 ${compact ? 'h-9 w-9 p-0' : 'px-3 py-2 text-xs'}`}>
        <Bug className="h-4 w-4" /> {!compact && 'BETA'}
      </button>
      {open && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Ferramentas da versão beta">
          <section className="flex h-[calc(100dvh-0.75rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-card p-4 sm:p-5">
              <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Padel Legacy Beta</p><h2 className="mt-1 text-lg font-black">Central de testes</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-xl p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border bg-card px-4 py-3 sm:px-5">
              {[
                ['feedback', 'Relatar problema'],
                ['suggestion', 'Sugerir melhoria'],
                ['rating', 'Avaliar sistemas'],
                ['changelog', 'Changelog'],
                ['checklist', 'Checklist'],
                ['save', 'Proteção do save'],
                ['health', 'Saúde do mundo'],
                ['tester', 'Estatísticas'],
                ['insights', 'Insights'],
                ['inspector', 'Save Inspector'],
                ['analytics', 'Sessão atual'],
                ['diagnostic', 'Diagnóstico'],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setMode(value)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${mode === value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{label}</button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
              {mode === 'feedback' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2 font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Relato pronto para a beta fechada</p>
                    <p className="mt-1">Descreva o caminho exato. O arquivo pode incluir versão, tela atual e resumo técnico da carreira, sem senhas.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs font-bold">Gravidade
                      <select value={feedback.severity} onChange={event => updateFeedback('severity', event.target.value)} className={FIELD_CLASS}>
                        <option value="blocker">Bloqueador — impede jogar</option>
                        <option value="high">Grave — quebra sistema importante</option>
                        <option value="medium">Moderado — atrapalha a experiência</option>
                        <option value="low">Polimento — visual ou conveniência</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-bold">Área
                      <select value={feedback.category} onChange={event => updateFeedback('category', event.target.value)} className={FIELD_CLASS}>
                        {['Interface', 'Partida', 'Calendário', 'Treinos', 'Torneios', 'Ranking', 'Dupla', 'Comissão', 'Economia', 'Missões/Tutorial', 'Save', 'Desempenho', 'Outro'].map(item => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                  </div>

                  <label className="block space-y-1 text-xs font-bold">Título do problema
                    <input value={feedback.title} onChange={event => updateFeedback('title', event.target.value)} placeholder="Ex.: botão +1 semana fica processando" className={FIELD_CLASS} />
                  </label>
                  <label className="block space-y-1 text-xs font-bold">Passos para reproduzir
                    <textarea value={feedback.steps} onChange={event => updateFeedback('steps', event.target.value)} rows={3} placeholder="1. Abrir Calendário\n2. Clicar em +1 semana..." className={FIELD_CLASS} />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1 text-xs font-bold">O que deveria acontecer
                      <textarea value={feedback.expected} onChange={event => updateFeedback('expected', event.target.value)} rows={3} className={FIELD_CLASS} />
                    </label>
                    <label className="block space-y-1 text-xs font-bold">O que aconteceu
                      <textarea value={feedback.actual} onChange={event => updateFeedback('actual', event.target.value)} rows={3} className={FIELD_CLASS} />
                    </label>
                  </div>
                  <label className="block space-y-1 text-xs font-bold">Observações
                    <textarea value={feedback.notes} onChange={event => updateFeedback('notes', event.target.value)} rows={2} placeholder="Frequência, momento da carreira, tentativa de contorno..." className={FIELD_CLASS} />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={feedback.includeDiagnostic} onChange={event => updateFeedback('includeDiagnostic', event.target.checked)} />
                    Incluir diagnóstico técnico seguro no arquivo
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={!canExportFeedback} onClick={copyFeedback} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"><Copy className="h-4 w-4" /> {copied ? 'Copiado' : 'Copiar relato'}</button>
                    <button type="button" disabled={!canExportFeedback} onClick={() => downloadBetaFeedbackReport({ career: activeCareer, pathname: location.pathname, feedback })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-4 w-4" /> Baixar relato</button>
                  </div>
                </div>
              )}

              {mode === 'suggestion' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
                    <p className="flex items-center gap-2 font-black text-fuchsia-200"><MessageSquarePlus className="h-5 w-5" /> Sugerir melhoria</p>
                    <p className="mt-1 text-xs text-muted-foreground">Separe ideias de bugs. Conte qual problema de experiência você percebeu e como imagina uma solução melhor.</p>
                  </div>
                  <label className="block space-y-1 text-xs font-bold">Área
                    <select value={suggestion.category} onChange={event => updateSuggestion('category', event.target.value)} className={FIELD_CLASS}>
                      {['Experiência geral', 'Partidas', 'Progressão', 'Treinos', 'Torneios', 'Ranking', 'Imprensa', 'Comissão', 'Economia', 'Interface', 'Tutorial', 'Outro'].map(item => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1 text-xs font-bold">Título da ideia
                    <input value={suggestion.title} onChange={event => updateSuggestion('title', event.target.value)} placeholder="Ex.: tornar a preparação pré-torneio mais clara" className={FIELD_CLASS} />
                  </label>
                  <label className="block space-y-1 text-xs font-bold">Qual problema você percebeu?
                    <textarea rows={3} value={suggestion.problem} onChange={event => updateSuggestion('problem', event.target.value)} className={FIELD_CLASS} />
                  </label>
                  <label className="block space-y-1 text-xs font-bold">Sua sugestão
                    <textarea rows={4} value={suggestion.idea} onChange={event => updateSuggestion('idea', event.target.value)} className={FIELD_CLASS} />
                  </label>
                  <label className="block space-y-1 text-xs font-bold">Impacto esperado
                    <textarea rows={2} value={suggestion.impact} onChange={event => updateSuggestion('impact', event.target.value)} placeholder="Por que isso deixaria o jogo melhor?" className={FIELD_CLASS} />
                  </label>
                  <button type="button" disabled={suggestion.title.trim().length < 4 || suggestion.idea.trim().length < 6} onClick={exportSuggestion} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-40"><Download className="h-4 w-4" /> Exportar sugestão</button>
                </div>
              )}

              {mode === 'rating' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="flex items-center gap-2 font-black text-amber-200"><Star className="h-5 w-5" /> Avaliar sistemas</p>
                    <p className="mt-1 text-xs text-muted-foreground">Dê uma nota rápida de 1 a 5. Estas avaliações ficam locais até você decidir exportá-las.</p>
                  </div>
                  <div className="space-y-2">
                    {RATING_AREAS.map(([id, label]) => (
                      <div key={id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/35 p-3">
                        <span className="text-sm font-bold">{label}</span>
                        <div className="flex gap-1" aria-label={`Nota de ${label}`}>
                          {[1,2,3,4,5].map(value => <button key={value} type="button" onClick={() => setRatings(current => ({ ...current, [id]: value }))} className={`rounded-lg p-1.5 ${value <= ratings[id] ? 'text-amber-300' : 'text-muted-foreground/35'}`}><Star className="h-4 w-4" fill={value <= ratings[id] ? 'currentColor' : 'none'} /></button>)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-sm font-black">Você jogaria mais uma hora agora?</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[['yes','Sim'],['maybe','Talvez'],['no','Não']].map(([value,label]) => <button key={value} type="button" onClick={() => setContinuePlaying(value)} className={`rounded-xl px-3 py-2 text-xs font-black ${continuePlaying === value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{label}</button>)}
                    </div>
                  </div>
                  <label className="block space-y-1 text-xs font-bold">Comentário opcional
                    <textarea rows={3} value={ratingNotes} onChange={event => setRatingNotes(event.target.value)} className={FIELD_CLASS} placeholder="O que mais influenciou suas notas?" />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={saveRating} className="rounded-xl border border-border px-4 py-3 text-sm font-black hover:bg-secondary">Salvar localmente</button>
                    <button type="button" onClick={exportRating} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground"><Download className="h-4 w-4" /> Exportar avaliação</button>
                  </div>
                  {ratingStatus && <p className="rounded-xl bg-secondary/55 p-3 text-xs text-muted-foreground">{ratingStatus} · {ratingCount} avaliação(ões) salva(s).</p>}
                </div>
              )}

              {mode === 'changelog' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <p className="flex items-center gap-2 font-black text-primary"><BookOpen className="h-5 w-5" /> Changelog da Closed Beta</p>
                    <p className="mt-1 text-xs text-muted-foreground">A RC1 está em feature freeze. A partir daqui entram apenas correções, balanceamento e ajustes de UX.</p>
                  </div>
                  {CLOSED_BETA_CHANGELOG.map(entry => (
                    <section key={entry.version} className="rounded-2xl border border-border p-4">
                      <div className="flex items-center justify-between gap-3"><h3 className="font-black">{entry.title}</h3><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-black uppercase">{entry.version}</span></div>
                      <ul className="mt-3 space-y-2">{entry.items.map(item => <li key={item} className="flex gap-2 text-xs text-muted-foreground"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> <span>{item}</span></li>)}</ul>
                    </section>
                  ))}
                </div>
              )}

              {mode === 'checklist' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
                    <p className="flex items-center gap-2 font-black text-sky-300"><ListChecks className="h-5 w-5" /> Roteiro da beta fechada</p>
                    <p className="mt-1 text-xs text-muted-foreground">Marque os fluxos já testados nesta carreira. O progresso fica salvo apenas neste dispositivo.</p>
                  </div>
                  <div className="space-y-2">
                    {BETA_CHECKLIST.map(item => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/35 p-3 hover:bg-secondary/50">
                        <input type="checkbox" checked={Boolean(checklist[item.id])} onChange={() => toggleChecklistItem(item.id)} className="mt-0.5" />
                        <span><span className="block text-[10px] font-black uppercase tracking-wider text-primary">{item.group}</span><span className="text-sm font-semibold">{item.label}</span></span>
                      </label>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => { const next = resetBetaChecklist(activeCareer?.career_id); setChecklist(next); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary"><RotateCcw className="h-4 w-4" /> Reiniciar checklist</button>
                    <button type="button" onClick={() => downloadJsonFile(buildBetaChecklistReport({ careerId: activeCareer?.career_id, state: checklist }), `padel-legacy-checklist-${Date.now()}.json`)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" /> Exportar checklist</button>
                  </div>
                </div>
              )}

              {mode === 'save' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="flex items-center gap-2 font-black text-emerald-300"><ShieldCheck className="h-5 w-5" /> Proteção da carreira</p>
                    <p className="mt-1 text-xs text-muted-foreground">Crie uma cópia interna antes de testes longos ou exporte o save para guardar fora do jogo.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-secondary/55 p-4"><p className="text-xs text-muted-foreground">Carreira ativa</p><p className="mt-1 truncate font-black">{activeCareer?.career_name || activeCareer?.player_name || 'Nenhuma carreira'}</p></div>
                    <div className="rounded-2xl bg-secondary/55 p-4"><p className="text-xs text-muted-foreground">Backups internos encontrados</p><p className="mt-1 text-2xl font-black">{backupCount}</p></div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={!activeCareer?.career_id} onClick={createManualBackup} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary disabled:opacity-40"><HardDrive className="h-4 w-4" /> Criar backup interno</button>
                    <button type="button" disabled={!activeCareer?.career_id} onClick={exportActiveSave} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"><Download className="h-4 w-4" /> Exportar save</button>
                  </div>
                  {saveStatus && <p className="rounded-xl border border-border bg-background/45 p-3 text-xs text-muted-foreground">{saveStatus}</p>}
                  <p className="text-xs text-muted-foreground">A restauração não é automática nesta tela para evitar sobrescrever uma carreira por engano. O arquivo exportado pode ser usado pela ferramenta de importação do gerenciador de carreiras.</p>
                </div>
              )}

              {mode === 'health' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-cyan-200"><Activity className="h-4 w-4" /> Painel de Saúde da Simulação</p>
                    <p className="mt-1 text-xs text-muted-foreground">Audita ranking, população, duplas, treinadores, contratos, notícias e integridade do universo. A projeção não modifica o save.</p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={runWorldHealthAudit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><RefreshCw className="h-4 w-4" /> Auditar agora</button>
                    <button type="button" disabled={!worldHealth} onClick={() => downloadJsonFile({ audit: worldHealth, projection: worldProjection }, `padel-legacy-saude-mundo-${Date.now()}.json`)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary disabled:opacity-40"><Download className="h-4 w-4" /> Exportar relatório</button>
                  </div>

                  {healthStatus && <p className="rounded-xl bg-secondary/55 p-3 text-xs text-muted-foreground">{healthStatus}</p>}

                  {worldHealth && (
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          ['Saúde', `${worldHealth.score}/100`],
                          ['Atletas ativos', worldHealth.counts.activeAthletes],
                          ['Duplas', worldHealth.counts.partnerships],
                          ['Treinadores livres', worldHealth.counts.freeCoaches],
                          ['Idade média', worldHealth.averages.age],
                          ['Overall médio', worldHealth.averages.overall],
                          ['Lesionados', worldHealth.counts.injuries],
                          ['Partidas', worldHealth.counts.matches],
                        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-secondary/35 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}
                      </div>

                      <div className="rounded-2xl border border-border p-4">
                        <div className="mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan-300" /><h3 className="text-sm font-black">Distribuição de idade</h3></div>
                        <div className="space-y-2">{worldHealth.distributions.ageBands.map(item => { const max = Math.max(1, ...worldHealth.distributions.ageBands.map(entry => entry.value)); return <div key={item.label} className="grid grid-cols-[48px_1fr_48px] items-center gap-2 text-xs"><span>{item.label}</span><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.max(2, item.value / max * 100)}%` }} /></div><strong className="text-right">{item.value}</strong></div>; })}</div>
                      </div>

                      <div className="rounded-2xl border border-border p-4">
                        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-black">Problemas encontrados</h3><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-black">{worldHealth.issues.length}</span></div>
                        {worldHealth.issues.length === 0 ? <p className="text-xs text-emerald-300">Nenhuma inconsistência importante encontrada.</p> : <div className="space-y-2">{worldHealth.issues.map(item => <div key={item.id} className="rounded-xl bg-secondary/45 p-3"><p className="flex items-center gap-2 text-xs font-black"><AlertTriangle className="h-4 w-4 text-amber-300" /> {item.title} <span className="ml-auto text-muted-foreground">{item.count}</span></p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div>)}</div>}
                      </div>

                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div><h3 className="flex items-center gap-2 text-sm font-black text-emerald-200"><Wrench className="h-4 w-4" /> Auditor Mundial Seguro</h3><p className="mt-1 text-xs text-muted-foreground">Prepara apenas correções de baixo risco. Um backup interno é criado automaticamente antes de aplicar.</p></div>
                          <button type="button" onClick={prepareSafeRepairs} disabled={repairing} className="rounded-xl border border-emerald-400/25 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40">Preparar correções</button>
                        </div>
                        {repairPlan && <div className="mt-3 rounded-xl bg-background/40 p-3 text-xs"><p className="font-black">{repairPlan.total} operações preparadas</p><div className="mt-2 space-y-1 text-muted-foreground">{Object.entries(repairPlan.byReason).map(([reason, count]) => <p key={reason}>• {reason}: {count}</p>)}</div><button type="button" onClick={applySafeRepairs} disabled={repairing || !repairPlan.total} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-black text-black disabled:opacity-40"><ShieldCheck className="h-4 w-4" /> {repairing ? 'Aplicando…' : 'Criar backup e aplicar'}</button></div>}
                        {repairResult && <p className="mt-3 rounded-xl bg-background/40 p-3 text-xs text-muted-foreground">Última execução: {repairResult.applied} aplicadas · {repairResult.failed} falharam · {repairResult.skipped} ignoradas.</p>}
                      </div>

                      <div className="rounded-2xl border border-border p-4">
                        <h3 className="text-sm font-black">Projeção estatística</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Estima população, aposentadorias, idade, Overall e lesões sem avançar o calendário real.</p>
                        <div className="mt-3 grid grid-cols-3 gap-2">{[10, 50, 100].map(seasons => <button key={seasons} type="button" onClick={() => runProjection(seasons)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"><Play className="h-3.5 w-3.5" /> {seasons} temporadas</button>)}</div>
                        {worldProjection && <div className="mt-3 rounded-xl bg-secondary/55 p-3 text-xs"><p><strong>Final:</strong> {worldProjection.end.active} atletas ativos · idade média {worldProjection.end.averageAge} · OVR médio {worldProjection.end.averageOverall}</p><p className="mt-1 text-muted-foreground">Aposentados acumulados: {worldProjection.end.retired} · lesionados projetados: {worldProjection.end.injuries}</p>{worldProjection.warnings.map(warning => <p key={warning} className="mt-2 text-amber-300">• {warning}</p>)}</div>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {mode === 'tester' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-violet-200"><BarChart3 className="h-4 w-4" /> Cobertura do testador</p>
                    <p className="mt-1 text-xs text-muted-foreground">Resume como esta carreira explorou os sistemas do jogo. Os dados permanecem locais e servem para interpretar melhor o feedback da beta.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['Perfil', testerInsights.testerLevel],
                      ['Cobertura', `${testerInsights.coverage}%`],
                      ['Sessões', testerInsights.sessions],
                      ['Tempo total', `${Math.max(1, Math.round(testerInsights.totalDurationMs / 60000))} min`],
                    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-secondary/35 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}
                  </div>

                  <div className="rounded-2xl border border-border p-4">
                    <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-black">Uso dos sistemas</h3><p className="text-[11px] text-muted-foreground">Tempo e visitas acumulados em todas as sessões.</p></div><span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-[10px] font-black text-violet-200">Score {testerInsights.testerScore}/100</span></div>
                    <div className="space-y-2">{testerInsights.features.slice(0, 14).map(feature => { const maxTime = Math.max(1, ...testerInsights.features.map(item => item.timeMs)); return <div key={feature.id} className="grid grid-cols-[minmax(105px,1fr)_2fr_65px] items-center gap-2 text-xs"><span className={`truncate font-bold ${feature.discovered ? '' : 'text-muted-foreground'}`}>{feature.label}</span><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${feature.discovered ? 'bg-violet-400' : 'bg-muted-foreground/20'}`} style={{ width: `${feature.discovered ? Math.max(4, feature.timeMs / maxTime * 100) : 0}%` }} /></div><span className="text-right text-[11px] text-muted-foreground">{feature.visits} visitas</span></div>; })}</div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border p-4">
                      <h3 className="text-sm font-black">Ainda não descoberto</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Sistemas que não foram abertos nesta instalação.</p>
                      {testerInsights.unusedFeatures.length ? <div className="mt-3 flex flex-wrap gap-2">{testerInsights.unusedFeatures.map(feature => <span key={feature.id} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{feature.label}</span>)}</div> : <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-200">Todos os sistemas principais já foram explorados.</p>}
                    </div>
                    <div className="rounded-2xl border border-border p-4">
                      <h3 className="text-sm font-black">Indicadores de uso</h3>
                      <div className="mt-3 space-y-2">{testerInsights.missed.map(item => <div key={item.id} className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2 text-xs"><span className="font-bold">{item.label}</span><strong className={item.positive ? 'text-emerald-300' : item.value > 0 ? 'text-amber-300' : ''}>{item.value}</strong></div>)}</div>
                    </div>
                  </div>

                  <button type="button" onClick={() => downloadJsonFile({ ...buildBetaAnalyticsExport(), testerInsights }, `padel-legacy-estatisticas-testador-${Date.now()}.json`)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" /> Exportar estatísticas completas</button>
                </div>
              )}

              {mode === 'insights' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-fuchsia-200"><BarChart3 className="h-4 w-4" /> Beta Insights Engine</p>
                    <p className="mt-1 text-xs text-muted-foreground">Interpreta a telemetria local para destacar descobribilidade, fricção de navegação e oportunidades de UX. Nenhum dado sai do dispositivo.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['UX Score', `${betaInsights.uxScore}/100`],
                      ['Situação', betaInsights.grade],
                      ['Perfil', betaInsights.behaviorProfile],
                      ['Fricções', betaInsights.friction.length],
                    ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-secondary/35 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}
                  </div>

                  <div className="rounded-2xl border border-border p-4">
                    <h3 className="text-sm font-black">Saúde da experiência</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {Object.entries({ Descoberta: betaInsights.metrics.discovery, Engajamento: betaInsights.metrics.engagement, Navegação: betaInsights.metrics.navigation, Continuidade: betaInsights.metrics.continuity }).map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-xs"><span className="font-bold">{label}</span><strong>{value}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${value >= 85 ? 'bg-emerald-400' : value >= 65 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${value}%` }} /></div></div>)}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border p-4">
                      <h3 className="text-sm font-black">Cobertura por área</h3>
                      <div className="mt-3 space-y-2">{betaInsights.categories.map(item => <div key={item.label} className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2 text-xs"><span className="font-bold">{item.label}</span><span><strong>{item.coverage}%</strong> · {item.discovered}/{item.total}</span></div>)}</div>
                    </div>
                    <div className="rounded-2xl border border-border p-4">
                      <h3 className="text-sm font-black">Recomendações</h3>
                      {betaInsights.recommendations.length ? <div className="mt-3 space-y-2">{betaInsights.recommendations.slice(0, 6).map(item => <div key={item.id} className={`rounded-xl p-3 text-xs ${item.priority === 'attention' ? 'bg-amber-500/10' : 'bg-secondary/40'}`}><p className="font-black">{item.title}</p><p className="mt-1 text-muted-foreground">{item.detail}</p></div>)}</div> : <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-200">Nenhuma recomendação importante no momento.</p>}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black">Possíveis pontos de fricção</h3><p className="text-[11px] text-muted-foreground">São indícios de UX para investigação, não bugs confirmados.</p></div><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-black">{betaInsights.friction.length}</span></div>
                    {betaInsights.friction.length ? <div className="mt-3 space-y-2">{betaInsights.friction.map(item => <div key={item.id} className="flex gap-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><p className="text-xs font-black">{item.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p></div></div>)}</div> : <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-200">Nenhum padrão forte de fricção detectado.</p>}
                  </div>

                  <button type="button" onClick={() => downloadJsonFile({ ...buildBetaAnalyticsExport(), betaInsights }, `padel-legacy-beta-insights-${Date.now()}.json`)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" /> Exportar insights</button>
                </div>
              )}

              {mode === 'inspector' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-sky-200"><HardDrive className="h-4 w-4" /> Save Inspector Pro</p>
                    <p className="mt-1 text-xs text-muted-foreground">Inspeciona a estrutura do save sem alterar nada: schema, IDs, países, duplas, missões, inscrições, contratos, comunicações e ranking.</p>
                  </div>

                  <button type="button" onClick={runSaveInspector} disabled={!activeCareer?.career_id} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"><RefreshCw className="h-4 w-4" /> Inspecionar carreira ativa</button>
                  {inspectorStatus && <p className="rounded-xl bg-secondary/55 p-3 text-xs text-muted-foreground">{inspectorStatus}</p>}

                  {saveInspection && <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ['Saúde', `${saveInspection.score}/100`],
                        ['Status', saveInspection.status],
                        ['Registros', saveInspection.counts.records],
                        ['Problemas', saveInspection.issues.length],
                      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-secondary/35 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}
                    </div>

                    <div className="rounded-2xl border border-border p-4">
                      <h3 className="text-sm font-black">Resumo estrutural</h3>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{Object.entries(saveInspection.counts).map(([key, value]) => <div key={key} className="rounded-xl bg-secondary/40 p-2.5"><p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{key.replaceAll(/([A-Z])/g, ' $1')}</p><p className="mt-0.5 font-black">{value}</p></div>)}</div>
                    </div>

                    <div className="rounded-2xl border border-border p-4">
                      <h3 className="text-sm font-black">Inconsistências encontradas</h3>
                      {saveInspection.issues.length ? <div className="mt-3 space-y-2">{saveInspection.issues.map(item => <div key={item.id} className={`rounded-xl border p-3 ${item.severity === 'blocker' || item.severity === 'high' ? 'border-rose-500/20 bg-rose-500/5' : 'border-amber-500/15 bg-amber-500/5'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{item.area} · {item.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p></div><span className="rounded-full bg-background/60 px-2 py-1 text-[10px] font-black uppercase">{item.severity} · {item.count}</span></div></div>)}</div> : <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Nenhuma inconsistência estrutural detectada.</p>}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => downloadJsonFile(buildSaveInspectorExport(saveInspection), `padel-legacy-save-inspector-${Date.now()}.json`)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" /> Exportar diagnóstico</button>
                      <button type="button" onClick={createManualBackup} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary"><ShieldCheck className="h-4 w-4" /> Criar backup agora</button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">O Inspector é somente leitura. Correções automáticas de baixo risco continuam disponíveis em “Saúde do mundo”, sempre com backup prévio.</p>
                  </>}
                </div>
              )}

              {mode === 'analytics' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-violet-200"><BarChart3 className="h-4 w-4" /> Estatísticas do testador</p>
                    <p className="mt-1 text-xs text-muted-foreground">Telemetria local e opcional. Nenhum dado é enviado pela internet e o arquivo exportado não inclui nomes, e-mails, caminhos locais ou o conteúdo integral do save.</p>
                  </div>

                  {analytics.currentSession ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          ['Sessão', `${Math.max(1, Math.round((analytics.currentSession.durationMs || 0) / 60000))} min`],
                          ['Telas abertas', analytics.events.filter(item => item.sessionId === analytics.currentSession.id && item.type === 'SCREEN_VIEW').length],
                          ['Dias avançados', analytics.currentSession.counters?.CALENDAR_ADVANCED || 0],
                          ['Eventos', analytics.currentSession.eventCount || 0],
                        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-secondary/35 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>)}
                      </div>

                      <div className="rounded-2xl border border-border p-4">
                        <div className="mb-3 flex items-center gap-2"><Clock3 className="h-4 w-4 text-violet-300" /><h3 className="text-sm font-black">Tempo por tela</h3></div>
                        {Object.entries(analytics.currentSession.screenTimeMs || {}).length === 0 ? <p className="text-xs text-muted-foreground">Navegue pelo jogo para começar a formar o relatório.</p> : <div className="space-y-2">{Object.entries(analytics.currentSession.screenTimeMs || {}).sort((a,b) => b[1]-a[1]).slice(0,10).map(([screen, ms]) => { const max = Math.max(1, ...Object.values(analytics.currentSession.screenTimeMs || {})); return <div key={screen} className="grid grid-cols-[minmax(90px,1fr)_2fr_54px] items-center gap-2 text-xs"><span className="truncate" title={screen}>{screen}</span><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.max(3, ms/max*100)}%` }} /></div><strong className="text-right">{Math.max(1, Math.round(ms/60000))}m</strong></div>; })}</div>}
                      </div>

                      <div className="rounded-2xl border border-border p-4">
                        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-black">Timeline da sessão</h3><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-black">últimos 20</span></div>
                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{analytics.events.filter(item => item.sessionId === analytics.currentSession.id).slice(-20).reverse().map(item => <div key={item.id} className="flex items-start gap-3 rounded-xl bg-secondary/40 p-3"><span className="mt-0.5 text-[10px] font-black text-violet-300">{new Date(item.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><div className="min-w-0"><p className="truncate text-xs font-black">{item.type.replaceAll('_', ' ')}</p><p className="truncate text-[11px] text-muted-foreground">{item.screen}</p></div></div>)}</div>
                      </div>
                    </>
                  ) : <p className="rounded-xl bg-secondary/55 p-3 text-xs text-muted-foreground">A sessão será iniciada automaticamente ao navegar pelo jogo.</p>}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => downloadJsonFile(buildBetaAnalyticsExport(), `padel-legacy-sessao-beta-${Date.now()}.json`)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" /> Exportar sessão</button>
                    <button type="button" onClick={() => { if (window.confirm('Apagar as estatísticas locais da beta neste dispositivo?')) { clearBetaAnalytics(); setAnalytics(getBetaAnalyticsSnapshot()); } }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary"><Trash2 className="h-4 w-4" /> Limpar dados locais</button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Armazenamento limitado às últimas 50 sessões e 2.000 eventos para evitar crescimento indefinido.</p>
                </div>
              )}

              {mode === 'diagnostic' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Use esta opção quando o jogo apresentar erro inesperado, tela branca ou comportamento difícil de descrever.</p>
                  <div className="rounded-2xl bg-secondary/55 p-3 text-xs text-muted-foreground">
                    <p><strong className="text-foreground">Versão:</strong> {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'beta'}</p>
                    <p><strong className="text-foreground">Tela:</strong> {location.pathname}</p>
                    <p><strong className="text-foreground">Carreira:</strong> {activeCareer?.career_id || 'nenhuma'}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={copyDiagnostic} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary"><Copy className="h-4 w-4" /> {copied ? 'Copiado' : 'Copiar diagnóstico'}</button>
                    <button type="button" onClick={() => downloadBetaDiagnosticReport({ career: activeCareer, pathname: location.pathname })} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"><Download className="h-4 w-4" /> Baixar diagnóstico</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ), document.body)}
    </>
  );
}
