// CLOUD-7B2A — aceitação de determinismo. Uso: node scripts/test-cloud-7b2a-determinism.mjs [--quick] [--output=<json>]
// Padrão: longa duração = 365 dias. --quick: 60 dias (apenas desenvolvimento).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { openServer, createRun, canon, canonicalSave, stripTelemetry, sha, summarizeSave, firstDiff } from './lib/cloud7b2aDeterminismKit.mjs';

const QUICK = process.argv.includes('--quick');
const OUT = (process.argv.find((a) => a.startsWith('--output=')) || '').slice(9);
const SHORT = 45; const LONG = QUICK ? 60 : 365;
const FIXTURE = 'reports/cloud-phase-7b1-save-pipeline/fixtures/career-day30-pre7b1.json.gz';
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); if (!ok) failed += 1; console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${detail ? ` — ${detail}` : ''}`); };
const env = await openServer();
const collect = (run) => run.checkpoint();
async function simulate(opts, days, { reloadAt = null, every = 0 } = {}) {
  const run = await createRun(env, opts); const marks = [];
  for (let d = 1; d <= days; d += 1) {
    await run.advance();
    if (reloadAt === d) await run.reload();
    if (every && d % every === 0) marks.push([d, canonicalSave(run.saveText())]);
  }
  return { run, text: run.saveText(), digest: canonicalSave(run.saveText()), marks, blocked: run.blocked };
}
const stateDigest = (text) => { const s = stripTelemetry(JSON.parse(text)); delete s.career_id; delete s.updated_at; if (s.player) delete s.player.updated_date; return sha(canon(s)); };
const countOf = (text, k) => (JSON.parse(text).entities[k] || []).length;
try {
  // 1 — mesma seed, e controle negativo (sem isolamento a divergência documentada reaparece)
  const a1 = await simulate({ seed: 'det-1' }, SHORT); const a2 = await simulate({ seed: 'det-1' }, SHORT);
  check('T1 mesma seed → estados idênticos', a1.digest === a2.digest && a1.blocked.length === 0 && a2.blocked.length === 0, `${SHORT} dias, ${countOf(a1.text, 'TeamRanking')} duplas`);
  await simulate({ seed: 'det-neg' }, 1);
  const neg = await simulate({ seed: 'det-neg', isolate: false }, 30); const neg0 = await simulate({ seed: 'det-neg' }, 30);
  check('T1b controle negativo: estado compartilhado sem isolamento diverge (prova do mecanismo)', neg.digest !== neg0.digest);
  // 2 — seeds diferentes
  const b1 = await simulate({ seed: 'det-2' }, SHORT);
  check('T2 seeds diferentes → resultados variados', b1.digest !== a1.digest && sha(JSON.parse(b1.text).entities.TeamRanking) !== sha(JSON.parse(a1.text).entities.TeamRanking));
  // 3 — longa duração com checkpoints a cada 30 dias
  const l1 = await simulate({ seed: 'det-long' }, LONG, { every: 30 }); const l2 = await simulate({ seed: 'det-long' }, LONG, { every: 30 });
  const firstBad = l1.marks.findIndex((m, i) => m[1] !== l2.marks[i][1]);
  check(`T3 longa duração (${LONG} dias) idêntica em todos os checkpoints`, firstBad === -1 && l1.digest === l2.digest && !l1.blocked.length, firstBad === -1 ? `${countOf(l1.text, 'TeamRanking')} duplas` : `primeiro checkpoint divergente: dia ${l1.marks[firstBad][0]}`);
  // 4 — save/load intermediário (o kit restaura o relógio simulado após a recarga: mesmas condições; nenhuma diferença é mascarada)
  const c1 = await simulate({ seed: 'det-sl' }, 60); const c2 = await simulate({ seed: 'det-sl' }, 60, { reloadAt: 30 });
  const t4ok = canonicalSave(c1.text) === canonicalSave(c2.text);
  check('T4 carreira contínua == carreira com recarga no dia 30 (60 dias)', t4ok, t4ok ? '' : JSON.stringify(firstDiff(summarizeSave(JSON.parse(c1.text)), summarizeSave(JSON.parse(c2.text))).slice(0, 8)));
  // 5 — isolamento: X, Y, X' no mesmo processo
  const x1 = await simulate({ seed: 'det-iso-x' }, 30); await simulate({ seed: 'det-iso-y' }, 30); const x2 = await simulate({ seed: 'det-iso-x' }, 30);
  check('T5 isolamento: X, Y, X no mesmo processo → X idêntico', x1.digest === x2.digest);
  // 6 — invariantes de duplas/rankings após execução longa
  const st = JSON.parse(l1.text).entities; const issues = [];
  for (const k of ['AthleteProfile', 'TeamRanking', 'Partnership', 'Tournament']) { const ids = (st[k] || []).map((r) => r.id); if (new Set(ids).size !== ids.length) issues.push(`ids duplicados em ${k}`); }
  const keys = st.TeamRanking.map((r) => r.team_key); if (new Set(keys).size !== keys.length) issues.push('team_key duplicada em TeamRanking');
  const active = new Map(); for (const p of st.Partnership.filter((r) => r.status === 'ativa')) for (const id of [p.athlete_a_id || p.participant_a_id, p.athlete_b_id || p.participant_b_id]) { if (!id) continue; if (active.has(id)) issues.push(`atleta ${id} em duas duplas ativas`); active.set(id, 1); }
  check('T6 duplas/rankings consistentes (ids únicos, team_key única, sem atleta em duas duplas ativas)', issues.length === 0, issues.slice(0, 3).join('; '));
  // 7 — compatibilidade com save anterior à correção
  const fixtureText = zlib.gunzipSync(fs.readFileSync(FIXTURE)).toString('utf8');
  const fx1 = await createRun(env, { seed: 'det-fx', loadText: fixtureText }); const t0 = JSON.parse(fx1.saveText()); const dayBefore = fx1.profile.career_date;
  for (let i = 0; i < 10; i += 1) await fx1.advance();
  await fx1.reload(); await fx1.advance();
  const t1 = JSON.parse(fx1.saveText());
  const keep = (k) => new Set((t0.entities[k] || []).map((r) => r.id)); const lost = ['Tournament', 'Match', 'TeamRanking', 'AthleteProfile'].filter((k) => { const now = new Set((t1.entities[k] || []).map((r) => r.id)); return [...keep(k)].some((id) => !now.has(id)) && k !== 'TeamRanking'; });
  check('T7 save antigo carrega, avança 10 dias, recarrega e avança', fx1.profile.career_date > dayBefore && fx1.blocked.length === 0, `${dayBefore} → ${fx1.profile.career_date}`);
  check('T7b nenhuma entidade antiga perdida (Tournament/Match/AthleteProfile)', lost.length === 0, lost.join(','));
  const fx2 = await createRun(env, { seed: 'det-fx', loadText: fixtureText }); for (let i = 0; i < 10; i += 1) await fx2.advance();
  const fx3 = await createRun(env, { seed: 'det-fx', loadText: fixtureText }); for (let i = 0; i < 10; i += 1) await fx3.advance();
  check('T7c save antigo + mesma seed → mesmo resultado em duas execuções', canonicalSave(fx2.saveText()) === canonicalSave(fx3.saveText()));
} finally { await env.server.close(); }
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ quick: QUICK, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} verificações aprovadas`);
process.exit(failed ? 1 : 0);
