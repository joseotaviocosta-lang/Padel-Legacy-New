import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  bucketEventLoopLag, createEventLoopLagMonitor, createFrameMonitor, createLongTaskMonitor,
  disablePerfDebug, getActionLog, getDomNodeCount, getRenderCounts, isPerfDebugEnabled, PERFDEBUG_CHANGE_EVENT,
  resetRenderCounts, setPerfModeAttribute, getLastAdvanceDayBreakdown,
} from '@/dev/performanceProbe.js';
import { careerIOStats, resetCareerIOStats } from '@/gameplay/repositories/CareerEntityRepository.js';

// M3.4 (docs/MOBILE_M3_4_DEVICE_PERFORMANCE.md) — overlay de perfdebug.
//
// Só existe para o jogador conseguir nos mandar números reais do aparelho
// físico sem precisar interpretar o Chrome DevTools. Ativa pelo toggle
// Performance em Configurações (ou por `?perfdebug=1`, como compatibilidade)
// e persiste em localStorage — sobrevive a navegações internas do app.
// NUNCA aparece por padrão. Roda no bundle release de
// propósito (ver comentário em performanceProbe.js) — é exatamente o APK
// release que precisa ser medido.
//
// Visual propositalmente mínimo (Parte 2: "não precisa ter visual bonito,
// precisa ser útil"). Atualiza no máximo ~2x/s para o próprio monitor não
// virar gargalo (Parte 3).
const SAMPLE_INTERVAL_MS = 500;
const LONG_TASK_HISTORY_LIMIT = 8;

export default function MobilePerformanceMonitor() {
  const [active, setActive] = useState(() => isPerfDebugEnabled());
  const [collapsed, setCollapsed] = useState(false);
  const [frameStats, setFrameStats] = useState(null);
  const [longTasks, setLongTasks] = useState([]);
  const [lagBucketCounts, setLagBucketCounts] = useState({});
  const [domNodes, setDomNodes] = useState(0);
  const [renderCounts, setRenderCounts] = useState({});
  const [lastAction, setLastAction] = useState(null);
  // Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md, item 13): IO de storage e
  // breakdown do último advance-day, amostrados no mesmo timer ~2x/s abaixo —
  // sem monitor próprio novo, sem custo por frame.
  const [ioStats, setIoStats] = useState({ reads: 0, writes: 0, totalMs: 0, maxMs: 0 });
  const [advanceDayBreakdown, setAdvanceDayBreakdown] = useState(null);
  const [noBlur, setNoBlur] = useState(false);
  const [noMotion, setNoMotion] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setActive(isPerfDebugEnabled());
  }, [location.pathname]);

  useEffect(() => {
    const syncActiveState = () => setActive(isPerfDebugEnabled());
    window.addEventListener(PERFDEBUG_CHANGE_EVENT, syncActiveState);
    return () => window.removeEventListener(PERFDEBUG_CHANGE_EVENT, syncActiveState);
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    const frameMonitor = createFrameMonitor();
    frameMonitor.start(setFrameStats);

    const longTaskMonitor = createLongTaskMonitor();
    longTaskMonitor.start((entry) => {
      setLongTasks((current) => [entry, ...current].slice(0, LONG_TASK_HISTORY_LIMIT));
    });

    const lagMonitor = createEventLoopLagMonitor();
    lagMonitor.start((_lagMs, bucket) => {
      if (!bucket) return;
      setLagBucketCounts((current) => ({ ...current, [bucket]: (current[bucket] || 0) + 1 }));
    });

    const sampleTimer = setInterval(() => {
      setDomNodes(getDomNodeCount());
      setRenderCounts(getRenderCounts());
      setLastAction(getActionLog().at(-1) || null);
      setIoStats({ ...careerIOStats });
      setAdvanceDayBreakdown(getLastAdvanceDayBreakdown());
    }, SAMPLE_INTERVAL_MS);

    return () => {
      frameMonitor.stop();
      longTaskMonitor.stop();
      lagMonitor.stop();
      clearInterval(sampleTimer);
    };
  }, [active]);

  useEffect(() => { setPerfModeAttribute('data-perf-no-blur', noBlur); }, [noBlur]);
  useEffect(() => { setPerfModeAttribute('data-perf-no-motion', noMotion); }, [noMotion]);
  useEffect(() => () => {
    setPerfModeAttribute('data-perf-no-blur', false);
    setPerfModeAttribute('data-perf-no-motion', false);
  }, []);

  const worstLongTask = useMemo(() => longTasks.reduce((max, entry) => Math.max(max, entry.duration), 0), [longTasks]);
  const topRenders = useMemo(
    () => Object.entries(renderCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
    [renderCounts],
  );

  if (!active) return null;

  function close() {
    disablePerfDebug();
    setActive(false);
  }

  return (
    <div
      data-perfdebug-overlay
      style={{
        position: 'fixed', left: '0.5rem', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
        zIndex: 999999, maxWidth: collapsed ? 'auto' : 'min(92vw, 22rem)',
        background: 'rgba(10,10,16,0.92)', color: '#e6ffe6', font: '11px/1.4 ui-monospace, Menlo, Consolas, monospace',
        borderRadius: '10px', padding: collapsed ? '0.4rem 0.6rem' : '0.6rem 0.75rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)', pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
        <strong style={{ color: '#7CFC7C' }}>perfdebug</strong>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button type="button" onClick={() => setCollapsed((v) => !v)} style={buttonStyle}>{collapsed ? '▲' : '▼'}</button>
          <button type="button" onClick={close} style={buttonStyle}>×</button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ marginTop: '0.4rem', display: 'grid', gap: '0.15rem' }}>
          <Row label="Rota" value={location.pathname} />
          <Row label="FPS" value={frameStats ? `${frameStats.fps}` : '—'} />
          <Row label="Frame médio" value={frameStats ? `${frameStats.avgFrameMs}ms` : '—'} />
          <Row label="Pior frame" value={frameStats ? `${frameStats.worstFrameMs}ms` : '—'} />
          <Row label=">33ms" value={frameStats ? `${frameStats.over33}/${frameStats.sampleCount}` : '—'} />
          <Row label=">100ms" value={frameStats ? `${frameStats.over100}/${frameStats.sampleCount}` : '—'} />
          <Row label="Long tasks" value={`${longTasks.length} (pior ${worstLongTask}ms)`} />
          <Row label="Lag loop" value={Object.entries(lagBucketCounts).map(([k, v]) => `${k}:${v}`).join(' ') || '—'} />
          <Row label="DOM nodes" value={String(domNodes)} />
          <Row label="Última ação" value={lastAction ? `${lastAction.label} ${lastAction.durationMs}ms` : '—'} />

          {/* Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md, itens 9/10): IO de
              storage (via CareerEntityRepository.withCareer) e breakdown do
              último avanço de dia (via o profiler já plugado em
              dayAdvanceCoordinator.js). */}
          <div style={{ marginTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.3rem' }}>
            <Row label="Storage leituras/gravações" value={`${ioStats.reads}/${ioStats.writes}`} />
            <Row label="Storage tempo total/pior" value={`${Math.round(ioStats.totalMs)}ms / ${Math.round(ioStats.maxMs)}ms`} />
          </div>

          {advanceDayBreakdown && (
            <div style={{ marginTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.3rem' }}>
              <Row label="advance-day (última)" value="" />
              {Object.entries(advanceDayBreakdown.stages).map(([name, ms]) => <Row key={name} label={`  ${name}`} value={`${ms}ms`} />)}
            </div>
          )}

          {topRenders.length > 0 && (
            <div style={{ marginTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.3rem' }}>
              {topRenders.map(([label, count]) => <Row key={label} label={label} value={String(count)} />)}
              <button type="button" onClick={() => { resetRenderCounts(); resetCareerIOStats(); setIoStats({ ...careerIOStats }); }} style={{ ...buttonStyle, marginTop: '0.25rem' }}>zerar contadores</button>
            </div>
          )}

          <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.35rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <input type="checkbox" checked={noBlur} onChange={(event) => setNoBlur(event.target.checked)} /> sem blur
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <input type="checkbox" checked={noMotion} onChange={(event) => setNoMotion(event.target.checked)} /> sem motion
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

const buttonStyle = {
  background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', borderRadius: '6px',
  padding: '0.15rem 0.4rem', font: 'inherit', cursor: 'pointer',
};

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
