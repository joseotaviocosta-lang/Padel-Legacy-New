// Playthrough 5.24-B, Partes E/F/L/S — HARNESS DE PERFORMANCE MOBILE.
//
// Mede, com o MESMO método antes e depois de qualquer correção:
//  - navegação SPA (pushState + popstate, como um toque no BottomNav):
//      tUseful  = início → rota sem skeleton (aria-busy) e com <h1>;
//      tSettled = início → 700ms sem mutação de DOM (fim do trabalho visível);
//  - long tasks (PerformanceObserver) dentro da janela de navegação;
//  - leituras/escritas de entidades (storageIOProbe, por caller);
//  - renders do shell (useRenderCounter: AppLayout/BottomNav/Bell/CareerHud);
//  - tamanho do DOM;
//  - scroll: frames > 50ms durante uma rolagem programada;
//  - custo de um refresh do header (evento padel:profile-updated).
//
// CPU 4x mais lenta (CDP) para aproximar um celular intermediário. Os números
// absolutos são de dev server (React dev), então valem para COMPARAR antes e
// depois, não como tempo real de APK.
//
// Uso: node scripts/perf-mobile-pages-v524b.mjs <label> [--rounds=3] [--width=360]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const label = process.argv[2] || 'run';
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const ROUNDS = Number(arg('rounds', 3));
const WIDTH = Number(arg('width', 360));
const HEIGHT = WIDTH >= 390 ? 844 : 800;
const CPU = Number(arg('cpu', 4));
const PROFILE = arg('profile', '');
const HEAVY = process.argv.includes('--heavy');
const OUT_DIR = resolve('reports/perf-524b');
mkdirSync(OUT_DIR, { recursive: true });

export const PERF_PAGES = [
  { id: 'home', label: 'Home', path: '/game' },
  { id: 'ranking', label: 'Ranking', path: '/ranking?scope=world&type=individual' },
  { id: 'tournaments', label: 'Torneios', path: '/tournaments' },
  { id: 'partners', label: 'Minha dupla', path: '/partners' },
  { id: 'training', label: 'Treinos', path: '/career/training' },
  { id: 'economy', label: 'Economia', path: '/game/economy' },
  { id: 'world', label: 'Mundo / Países', path: '/world/directory?tab=countries' },
];

// Mesma carreira da 5.24: parceria ativa + Race com pontos, para que header e
// Ranking percorram o caminho real (TeamRanking da dupla do jogador).
async function injectCareer(page, heavy = false) {
  return page.evaluate(async (heavy) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const { ensureMyProfile } = await import('/src/lib/padel.js');
    const { startPartnership } = await import('/src/lib/partnershipSystem.js');
    const { ensurePlayerTeamRanking } = await import('/src/lib/teamRanking.js');
    const bots = await import('/src/lib/bots.js');
    const user = await localGame.auth.me();
    const profile = await ensureMyProfile(user);
    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 40).catch(() => []);
    await Promise.all((athletes || []).slice(0, 30).map((a, i) => localGame.entities.AthleteProfile
      .update(a.id, { race_points: Math.max(0, 900 - i * 25) }).catch(() => null)));
    const pool = bots.BOTS_BY_DIFFICULTY?.avancado || bots.BOTS_BY_DIFFICULTY?.elite || [];
    const started = await startPartnership(profile, pool[0], 60, 50);
    const partnerId = started?.partnership?.partner_bot_id;
    if (partnerId) {
      await localGame.entities.AthleteProfile.update(partnerId, { world_ranking_points: 978, ranking_points: 978, race_points: 120 }).catch(() => null);
    }
    await localGame.entities.PlayerProfile.update(profile.id, { rank_points: 39, world_ranking_points: 39, race_points: 39 }).catch(() => null);
    await ensurePlayerTeamRanking(await localGame.entities.PlayerProfile.get(profile.id));
    // --heavy: aproxima um save de meio de temporada (1500 atletas, ~1000
    // duplas, 60 clubes) clonando linhas existentes com ids novos.
    if (heavy) {
      const inflate = async (entity, target, sort) => {
        const rows = await localGame.entities[entity].list(sort, 100000);
        const missing = Math.max(0, target - rows.length);
        if (!missing || !rows.length) return;
        const clones = Array.from({ length: missing }, (_, i) => {
          const src = rows[i % rows.length];
          const { id: _id, created_date: _c, updated_date: _u, ...rest } = src;
          const suffix = `heavy${i}`;
          const clone = { ...rest };
          if (entity === 'TeamRanking') {
            clone.team_key = `${src.team_key || 'k'}::${suffix}`;
            clone.ranking_points = Math.max(1, Math.round((Number(src.ranking_points) || 10) * 0.6));
          }
          if (entity === 'AthleteProfile') {
            clone.name = `${src.name || 'Atleta'} ${i}`;
            clone.world_ranking_points = Math.max(0, Math.round((Number(src.world_ranking_points) || 5) * 0.4));
          }
          if (entity === 'Club') clone.name = `${src.name || 'Clube'} ${i}`;
          return clone;
        });
        await localGame.entities[entity].bulkCreate(clones);
      };
      await inflate('AthleteProfile', 1500, '-world_ranking_points');
      await inflate('TeamRanking', 1000, '-ranking_points');
      await inflate('Club', 60, '-club_points');
    }
    const counts = {
      athletes: (await localGame.entities.AthleteProfile.list(null, 100000)).length,
      teams: (await localGame.entities.TeamRanking.list(null, 100000)).length,
      clubs: (await localGame.entities.Club.list(null, 100000)).length,
      tournaments: (await localGame.entities.Tournament.list(null, 100000)).length,
      notifications: (await localGame.entities.CareerCommunication?.list?.(null, 100000).catch(() => []) || []).length,
    };
    return { ok: Boolean(partnerId), partnerId, counts };
  }, heavy).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
}

// Instala os observadores na página (uma vez por documento).
async function installProbes(page) {
  await page.evaluate(async () => {
    const storage = await import('/src/dev/storageIOProbe.js');
    const probe = await import('/src/dev/performanceProbe.js');
    storage.setStorageProbeEnabledForTests(true);
    window.__plPerf = { storage, probe, longTasks: [] };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__plPerf.longTasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* sem suporte */ }
  });
}

function snapshotCounts() {
  const { storage, probe } = window.__plPerf;
  const ops = storage.getStoragePerformanceSnapshot(5000).operations;
  const byCaller = {};
  for (const op of ops) {
    const key = `${op.operation === 'cache' ? 'read' : op.operation}:${op.caller}`;
    byCaller[key] = (byCaller[key] || 0) + op.count;
  }
  return { totals: storage.captureStorageTotals(), byCaller, renders: probe.getRenderCounts() };
}

function diffCounts(before, after) {
  const callers = {};
  for (const [k, v] of Object.entries(after.byCaller)) {
    const d = v - (before.byCaller[k] || 0);
    if (d) callers[k] = d;
  }
  const renders = {};
  for (const [k, v] of Object.entries(after.renders)) {
    const d = v - (before.renders[k] || 0);
    if (d) renders[k] = d;
  }
  return {
    calls: after.totals.calls - before.totals.calls,
    writes: after.totals.writes - before.totals.writes,
    teamRankingReads: Object.entries(callers).filter(([k]) => /read:.*TeamRanking/.test(k)).reduce((s, [, v]) => s + v, 0),
    athleteListReads: Object.entries(callers).filter(([k]) => /read:.*list:AthleteProfile/.test(k)).reduce((s, [, v]) => s + v, 0),
    callers,
    renders,
  };
}

// Navega pela SPA e mede até a rota assentar.
async function navigateAndMeasure(page, path) {
  const before = await page.evaluate(snapshotCounts);
  const result = await page.evaluate(async (target) => {
    const start = performance.now();
    let lastMutation = start;
    const mo = new MutationObserver(() => { lastMutation = performance.now(); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    window.__plPerf.longTasks.length = 0;
    // O <h1> da página ANTERIOR continua no DOM até o React trocar a rota;
    // sem guardar a referência, o critério "pronto" dispara na hora (0-10ms).
    const previousH1 = document.querySelector('.app-route-stage h1');
    history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
    const routeReady = () => {
      const stage = document.querySelector('.app-route-stage');
      if (!stage) return false;
      if (stage.querySelector('[aria-busy="true"]')) return false;
      const h1 = stage.querySelector('h1');
      return Boolean(h1) && h1 !== previousH1 && h1.isConnected;
    };
    let tUseful = null;
    await new Promise((done) => {
      const tick = () => {
        const now = performance.now();
        if (tUseful === null && routeReady()) tUseful = now - start;
        if (tUseful !== null && now - lastMutation > 700) return done();
        if (now - start > 15000) return done();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    mo.disconnect();
    const tSettled = lastMutation - start;
    const lt = window.__plPerf.longTasks.filter((t) => t.start >= start - 5);
    return {
      tUseful: tUseful === null ? null : Math.round(tUseful),
      tSettled: Math.round(tSettled),
      longTaskCount: lt.length,
      longTaskMs: Math.round(lt.reduce((s, t) => s + t.duration, 0)),
      longestTaskMs: Math.round(Math.max(0, ...lt.map((t) => t.duration))),
      dom: document.querySelectorAll('*').length,
    };
  }, path);
  const after = await page.evaluate(snapshotCounts);
  return { ...result, ...diffCounts(before, after) };
}

// Rolagem programada: 12 passos de 260px, mede frames.
async function measureScroll(page) {
  return page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 150));
    const frames = [];
    let last = performance.now();
    let running = true;
    const tick = (now) => { frames.push(now - last); last = now; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    for (let i = 0; i < 12; i += 1) {
      window.scrollBy(0, 260);
      await new Promise((r) => setTimeout(r, 60));
    }
    running = false;
    await new Promise((r) => setTimeout(r, 100));
    window.scrollTo(0, 0);
    const over50 = frames.filter((f) => f > 50).length;
    return { frames: frames.length, over50, worstFrameMs: Math.round(Math.max(0, ...frames)) };
  });
}

// Custo de 1 refresh do header (evento disparado por compras, treinos, dia).
async function measureHeaderRefresh(page) {
  const before = await page.evaluate(snapshotCounts);
  const timing = await page.evaluate(async () => {
    window.__plPerf.longTasks.length = 0;
    const start = performance.now();
    window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: {} }));
    await new Promise((r) => setTimeout(r, 1500));
    const lt = window.__plPerf.longTasks.filter((t) => t.start >= start - 5);
    return { longTaskMs: Math.round(lt.reduce((s, t) => s + t.duration, 0)), longTaskCount: lt.length };
  });
  const after = await page.evaluate(snapshotCounts);
  return { ...timing, ...diffCounts(before, after) };
}

// Microbenchmarks de atribuição: quanto custa cada leitura usada pelo header.
async function microBench(page) {
  return page.evaluate(async () => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const padel = await import('/src/lib/padel.js');
    const tr = await import('/src/lib/teamRanking.js');
    const cd = await import('/src/lib/countryDirectory.js');
    const user = await localGame.auth.me();
    const profile = await padel.ensureMyProfile(user);
    const time = async (fn, n = 5) => {
      const s = performance.now();
      for (let i = 0; i < n; i += 1) await fn();
      return Math.round(((performance.now() - s) / n) * 10) / 10;
    };
    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1500);
    const clubs = await localGame.entities.Club.list('-club_points', 200);
    return {
      getTeamRankings5000Ms: await time(() => tr.getTeamRankings(5000)),
      getWorldRankMs: await time(() => padel.getWorldRank(profile)),
      buildCountryDirectoryMs: await time(() => cd.buildCountryDirectory(athletes, clubs), 20),
    };
  });
}

// Perfil de CPU (CDP Profiler) de uma navegação: self-time por função/arquivo.
async function profilePages(page, cdp, ids) {
  const out = {};
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  for (const id of ids) {
    const target = PERF_PAGES.find((p) => p.id === id);
    if (id !== 'header' && !target) continue;
    // Sai e volta, para medir a montagem da página.
    await navigateAndMeasure(page, id === 'home' ? '/game/economy' : '/game');
    await cdp.send('Profiler.start');
    if (target) await navigateAndMeasure(page, target.path);
    else await measureHeaderRefresh(page);
    const { profile } = await cdp.send('Profiler.stop');
    const nodeById = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const dt = profile.timeDeltas || [];
    (profile.samples || []).forEach((nodeId, i) => self.set(nodeId, (self.get(nodeId) || 0) + (dt[i] || 0)));
    const byFn = new Map();
    for (const [nodeId, us] of self) {
      const cf = nodeById.get(nodeId).callFrame;
      const file = (cf.url || '').replace(/^https?:\/\/[^/]+\//, '').split('?')[0] || '(native)';
      const key = `${cf.functionName || '(anon)'} @ ${file}:${cf.lineNumber + 1}`;
      byFn.set(key, (byFn.get(key) || 0) + us);
    }
    const byFile = new Map();
    for (const [key, us] of byFn) {
      const file = key.split(' @ ')[1]?.replace(/:\d+$/, '') || '?';
      byFile.set(file, (byFile.get(file) || 0) + us);
    }
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `${Math.round(us / 1000)}ms ${k}`);
    out[id] = { topFunctions: top(byFn, 25), topFiles: top(byFile, 15) };
  }
  await cdp.send('Profiler.disable');
  return out;
}

const median = (values) => {
  const v = values.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.floor(v.length / 2)];
};

async function run() {
  const browser = await launch();
  const report = { label, heavy: HEAVY, width: WIDTH, height: HEIGHT, cpuThrottle: CPU, rounds: ROUNDS, generatedAt: new Date().toISOString() };
  try {
    const page = await openCareer(browser, { width: WIDTH, height: HEIGHT, mobile: true });
    report.career = await injectCareer(page, HEAVY);
    await goto(page, '/game', { settle: 2500 });
    await dismissOverlays(page);
    await installProbes(page);
    const cdp = await page.target().createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

    // Rodada 0 aquece chunks lazy (transformação do Vite), descartada.
    const samples = Object.fromEntries(PERF_PAGES.map((p) => [p.id, []]));
    for (let round = 0; round <= ROUNDS; round += 1) {
      for (const p of PERF_PAGES) {
        const m = await navigateAndMeasure(page, p.path);
        if (round > 0) samples[p.id].push(m);
        process.stdout.write(`${round}:${p.id}=${m.tUseful}/${m.tSettled}ms tr=${m.teamRankingReads} `);
      }
      process.stdout.write('\n');
    }

    report.pages = {};
    for (const p of PERF_PAGES) {
      const s = samples[p.id];
      // Scroll medido uma vez com a rota assentada.
      await navigateAndMeasure(page, p.path);
      const scroll = await measureScroll(page);
      report.pages[p.id] = {
        label: p.label,
        tUsefulMedian: median(s.map((x) => x.tUseful)),
        tSettledMedian: median(s.map((x) => x.tSettled)),
        longTaskMsMedian: median(s.map((x) => x.longTaskMs)),
        longestTaskMsMedian: median(s.map((x) => x.longestTaskMs)),
        queriesMedian: median(s.map((x) => x.calls)),
        writesMedian: median(s.map((x) => x.writes)),
        teamRankingReadsMedian: median(s.map((x) => x.teamRankingReads)),
        athleteListReadsMedian: median(s.map((x) => x.athleteListReads)),
        dom: s[s.length - 1]?.dom,
        appLayoutRendersMedian: median(s.map((x) => x.renders.AppLayout || 0)),
        rendersLast: s[s.length - 1]?.renders,
        callersLast: s[s.length - 1]?.callers,
        scroll,
        raw: s.map(({ tUseful, tSettled, longTaskMs, calls, writes, teamRankingReads }) => ({ tUseful, tSettled, longTaskMs, calls, writes, teamRankingReads })),
      };
    }

    await navigateAndMeasure(page, '/game');
    const headerRuns = [];
    for (let i = 0; i < 3; i += 1) headerRuns.push(await measureHeaderRefresh(page));
    report.headerRefresh = {
      longTaskMsMedian: median(headerRuns.map((x) => x.longTaskMs)),
      queriesMedian: median(headerRuns.map((x) => x.calls)),
      teamRankingReadsMedian: median(headerRuns.map((x) => x.teamRankingReads)),
      athleteListReadsMedian: median(headerRuns.map((x) => x.athleteListReads)),
      appLayoutRenders: headerRuns.map((x) => x.renders.AppLayout || 0),
      callersLast: headerRuns[headerRuns.length - 1].callers,
    };
    report.micro = await microBench(page);
    if (PROFILE) report.cpuProfile = await profilePages(page, cdp, PROFILE.split(','));
    report.pageErrors = page.__errors || [];
    await page.close();
  } finally {
    await browser.close();
  }
  const file = resolve(OUT_DIR, `${label}${HEAVY ? "-heavy" : ""}-${WIDTH}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log('\nresumo:');
  for (const [id, p] of Object.entries(report.pages)) {
    console.log(`${id.padEnd(12)} useful=${p.tUsefulMedian}ms settled=${p.tSettledMedian}ms longTasks=${p.longTaskMsMedian}ms q=${p.queriesMedian} w=${p.writesMedian} TR=${p.teamRankingReadsMedian} dom=${p.dom} AL=${p.appLayoutRendersMedian} scroll>50=${p.scroll.over50}`);
  }
  console.log('header refresh', JSON.stringify({ ...report.headerRefresh, callersLast: undefined }));
  console.log('micro', JSON.stringify(report.micro));
  console.log(`→ ${file}`);
}

run().catch((error) => { console.error(error); process.exit(1); });
