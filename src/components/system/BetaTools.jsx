import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Bug, CheckCircle2, Copy, Download, HardDrive, ListChecks, Play, RefreshCw, RotateCcw, ShieldCheck, Wrench, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCareer } from '@/careers/useCareer.js';
import { buildBetaDiagnosticReport, downloadBetaDiagnosticReport, installBetaDiagnostics } from '@/lib/betaDiagnostics.js';
import { buildBetaFeedbackReport, downloadBetaFeedbackReport } from '@/lib/betaFeedback.js';
import { CareerRepository } from '@/careers/CareerRepository.js';
import { BETA_CHECKLIST, buildBetaChecklistReport, downloadJsonFile, loadBetaChecklist, resetBetaChecklist, saveBetaChecklist } from '@/lib/betaReadiness.js';
import { applyWorldRepairPlan, buildWorldRepairPlan, collectWorldHealth, projectWorldHealth } from '@/lib/simulationHealth.js';

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

  useEffect(() => installBetaDiagnostics(), []);

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


  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Relatar problema da versão beta" className={`inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 font-black text-amber-300 transition-colors hover:bg-amber-400/15 ${compact ? 'h-9 w-9 p-0' : 'px-3 py-2 text-xs'}`}>
        <Bug className="h-4 w-4" /> {!compact && 'BETA'}
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Ferramentas da versão beta">
          <section className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Padel Legacy Beta</p><h2 className="mt-1 text-lg font-black">Central de testes</h2></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-xl p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3">
              {[
                ['feedback', 'Relatar problema'],
                ['checklist', 'Checklist'],
                ['save', 'Proteção do save'],
                ['health', 'Saúde do mundo'],
                ['diagnostic', 'Diagnóstico'],
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setMode(value)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${mode === value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{label}</button>
              ))}
            </div>

            <div className="overflow-y-auto p-5">
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
      )}
    </>
  );
}
