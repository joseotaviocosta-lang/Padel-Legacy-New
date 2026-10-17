// CLOUD-6J — agrega field-recomposition-experiments.json em tabelas Markdown (somente leitura).
// Uso: node scripts/analyze-cloud6j-summary.mjs [--dir=reports/cloud-phase-6j-field-recomposition-validation/data]
import fs from 'node:fs';
import path from 'node:path';
const dir = (process.argv.find((a) => a.startsWith('--dir=')) || '').split('=')[1] || 'reports/cloud-phase-6j-field-recomposition-validation/data';
const R = JSON.parse(fs.readFileSync(path.join(dir, 'field-recomposition-experiments.json'), 'utf8'));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const f2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(2));
const f1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(1));
const S = R.seeds; const LV = R.levels;
const out = [];
const P = (s = '') => out.push(s);
const val = (w, ent, pol, scn, T, k) => w.evals[ent]?.byPolicy?.[pol]?.byScenario?.[scn]?.[T]?.[k];
const agg = (ent, pol, scn, T, k, seeds = S) => { const v = seeds.map((w) => val(w, ent, pol, scn, T, k)).filter(Number.isFinite); return { m: mean(v), sd: sd(v), min: Math.min(...v), max: Math.max(...v), n: v.length }; };
const cell = (a, d = 2) => (a.n ? `${a.m.toFixed(d)} [${a.min.toFixed(d)}–${a.max.toFixed(d)}]` : '—');
const SILVER = ['PROD', 'CAL_E', 'S40', 'A5', 'W35_85', 'A5_LITE', 'A5_E', 'A5_LITE_E'];
const GOLD = ['PROD', 'GA4', 'GL8', 'GL12', 'GL8_M'];

// ── validação réplica × função real ──
P('### V. Validação réplica × função real (sobreposição de duplas)');
P('| Semente | Preset | Bronze | Silver (offset) | Gold |'); P('|---|---|---|---|---|');
for (const w of [...S, ...(R.sensitivity || [])]) for (const pr of ['balanced', 'balanced-e']) {
  const v = w.validation[pr]; P(`| ${w.seed}${w.warmDays > 8 ? ` (+${w.warmDays}d)` : ''} | ${pr} | ${v.Bronze.overlap}/${v.Bronze.realSelected} | ${v.Silver.overlap}/${v.Silver.realSelected} (${v.Silver.offset}) | ${v.Gold.overlap}/${v.Gold.realSelected} |`);
}
// ── pools e campos reais por preset ──
P(); P('### P. Pool elegível e campo REAL por preset (função de produção)');
P('| Semente | Preset | Tier | Elegíveis | % pool 50–70 | Campo OVR mediana [p25–p75] (mín–máx) | % campo 50–70 | rank mediano |'); P('|---|---|---|---|---|---|---|---|');
for (const w of S) for (const pr of ['balanced', 'balanced-e']) for (const t of ['Bronze', 'Silver', 'Gold']) {
  const p = w.pools[pr][t]; const o = p.realField.ovr; P(`| ${w.seed} | ${pr} | ${t} | ${p.eligible} | ${p.share50to70} | ${o.median} [${o.p25}–${o.p75}] (${o.min}–${o.max}) | ${p.realField.share50to70} | ${p.realField.rankMedian} |`);
}
// ── campos por semente e política ──
P(); P('### F. Campos por semente e política (OVR mediana [p25–p75] · máx · % 50–70 · rank mediano · adversário rodadas 1→4 no caminho do jogador sem-rank)');
for (const tier of ['Silver', 'Gold']) {
  P(`\n**${tier}**\n`); P('| Política | ' + S.map((w) => w.seed).join(' | ') + ' | Média (dp entre sementes) da mediana do campo |'); P('|---|' + S.map(() => '---').join('|') + '|---|');
  for (const pol of tier === 'Silver' ? SILVER : GOLD) {
    const cells = S.map((w) => { const f = w.fields[tier][pol]; return `${f.ovr.median} [${f.ovr.p25}–${f.ovr.p75}] máx ${f.ovr.max} · ${Math.round(f.share50to70 * 100)}% · r${f.rank.median}`; });
    const meds = S.map((w) => w.fields[tier][pol].ovr.median); P(`| ${pol} | ${cells.join(' | ')} | ${f1(mean(meds))} (${f1(sd(meds))}) |`);
  }
}
P(); P('**Caminho do jogador (OVR dos adversários rodada 1→4/5), Silver/sem-rank**\n'); P('| Política | ' + S.map((w) => w.seed).join(' | ') + ' |'); P('|---|' + S.map(() => '---').join('|') + '|');
for (const pol of SILVER) P(`| ${pol} | ${S.map((w) => w.evals['Silver/sem-rank'].byPolicy[pol].path.map((x) => (x ? x.ovr : '—')).join('→')).join(' | ')} |`);
P(); P('**Caminho do jogador, Bronze/sem-rank**\n'); P('| Política | ' + S.map((w) => w.seed).join(' | ') + ' |'); P('|---|' + S.map(() => '---').join('|') + '|');
P(`| PROD | ${S.map((w) => w.evals['Bronze/sem-rank'].byPolicy.PROD.path.map((x) => (x ? x.ovr : '—')).join('→')).join(' | ')} |`);
P(); P('**Caminho, Gold-direto/300 (rodadas 1→5)**\n'); P('| Política | ' + S.map((w) => w.seed).join(' | ') + ' |'); P('|---|' + S.map(() => '---').join('|') + '|');
for (const pol of GOLD) P(`| ${pol} | ${S.map((w) => w.evals['Gold-direto/300'].byPolicy[pol].path.map((x) => (x ? x.ovr : '—')).join('→')).join(' | ')} |`);
P(); P('**Qualifying do Gold (OVR dos 3 adversários), Gold-qual/600**\n'); P('| Política | ' + S.map((w) => w.seed).join(' | ') + ' |'); P('|---|' + S.map(() => '---').join('|') + '|');
for (const pol of GOLD) P(`| ${pol} | ${S.map((w) => w.evals['Gold-qual/600'].byPolicy[pol].qualifying.join('/')).join(' | ')} |`);

// ── consistência ──
P(); P('### C. Consistência de elegibilidade / integridade (soma sobre sementes)');
P('| Tier | Política | duplicatas | slots vazios | não elegíveis | comprometidas/parceiro | tamanho correto | Gold: entram com rank pior que o corte direto (450) |'); P('|---|---|---|---|---|---|---|---|');
for (const tier of ['Silver', 'Gold']) for (const pol of tier === 'Silver' ? SILVER : GOLD) {
  const c = S.map((w) => w.consistency[tier][pol]); const sum = (k) => c.reduce((s, x) => s + (x[k] || 0), 0);
  P(`| ${tier} | ${pol} | ${sum('duplicates')} | ${sum('undefinedSlots')} | ${sum('notEligible')} | ${sum('committedOrPartner')} | ${c.every((x) => x.size === x.need) ? 'sim' : 'NÃO'} | ${tier === 'Gold' ? c.map((x) => x.rankWorseThanDirectCut).join('/') : '—'} |`);
}
P(); P('**Ordem Bronze < Silver < Gold (OVR mediana do campo), por semente e política de Silver (Gold = PROD)**\n'); P('| Política Silver | ' + S.map((w) => w.seed).join(' | ') + ' | Δ Silver−Bronze ≥ 5 e Gold−Silver ≥ 5 em todas? |'); P('|---|' + S.map(() => '---').join('|') + '|---|');
for (const pol of SILVER) { const ok = S.every((w) => w.fields.Silver[pol].ovr.median - w.fields.Bronze.PROD.ovr.median >= 5 && w.fields.Gold.PROD.ovr.median - w.fields.Silver[pol].ovr.median >= 5);
  P(`| ${pol} | ${S.map((w) => `${w.fields.Bronze.PROD.ovr.median}<${w.fields.Silver[pol].ovr.median}<${w.fields.Gold.PROD.ovr.median}`).join(' | ')} | ${ok ? 'sim' : 'não'} |`); }

// ── Etapa 2: início de carreira (REAL_BAL e FLAT) ──
const SC = ['REAL_BAL'];
for (const [ent, title] of [['Bronze/sem-rank', 'Bronze (sem ranking)'], ['Silver/sem-rank', 'Silver (sem ranking)']]) for (const scn of ['FLAT', 'REAL_BAL', 'REAL_PW', 'REAL_PS']) {
  P(); P(`### E2. ${title} — P(vencer a 1ª partida do torneio) · cenário ${scn} · média [mín–máx] entre ${S.length} sementes`);
  P('| Política | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
  for (const pol of ent.startsWith('Bronze') ? ['PROD'] : SILVER) P(`| ${pol} | ${LV.map((T) => cell(agg(ent, pol, scn, T, 'pFirst'))).join(' | ')} |`);
}
for (const [ent, title] of [['Silver/sem-rank', 'Silver (sem ranking)']]) {
  P(); P(`### E2b. ${title} — vitórias esperadas por torneio (REAL_BAL)`);
  P('| Política | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
  for (const pol of SILVER) P(`| ${pol} | ${LV.map((T) => cell(agg(ent, pol, 'REAL_BAL', T, 'eWins'))).join(' | ')} |`);
  P(); P(`### E2c. ${title} — P(≥1 vitória em 3 torneios consecutivos) = 1−(1−p)³ com p = P(1ª partida), REAL_BAL (média das sementes)`);
  P('| Política | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
  for (const pol of SILVER) P(`| ${pol} | ${LV.map((T) => { const p = agg(ent, pol, 'REAL_BAL', T, 'pFirst').m; return f2(1 - (1 - p) ** 3); }).join(' | ')} |`);
}
P(); P('### E2d. Bronze e Silver (sem ranking) — vitórias esperadas por torneio, PROD (REAL_BAL)');
P('| Tier | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
P(`| Bronze | ${LV.map((T) => cell(agg('Bronze/sem-rank', 'PROD', 'REAL_BAL', T, 'eWins'))).join(' | ')} |`);
P(`| Silver | ${LV.map((T) => cell(agg('Silver/sem-rank', 'PROD', 'REAL_BAL', T, 'eWins'))).join(' | ')} |`);
P(); P('### E2e. Silver com rank 600 (dupla que já pontuou) — P(título), REAL_BAL: risco de Silver fácil demais para duplas fortes');
P('| Política | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
for (const pol of SILVER) P(`| ${pol} | ${LV.map((T) => cell(agg('Silver/600', pol, 'REAL_BAL', T, 'pTitle'))).join(' | ')} |`);
P(); P('### E2f. Silver com rank 600 — P(1ª partida), REAL_BAL (intermediários 45–65)');
P('| Política | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
for (const pol of SILVER) P(`| ${pol} | ${LV.map((T) => cell(agg('Silver/600', pol, 'REAL_BAL', T, 'pFirst'))).join(' | ')} |`);
P(); P('### E2g. Silver com rank 600 — vitórias esperadas, REAL_BAL');
P('| Política | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
for (const pol of SILVER) P(`| ${pol} | ${LV.map((T) => cell(agg('Silver/600', pol, 'REAL_BAL', T, 'eWins'))).join(' | ')} |`);

// ── Etapa 5: plano × real ──
P(); P('### E5. Atributos planos × reais — diferença máxima absoluta e inversão de ordem entre políticas');
const allEnt = ['Bronze/sem-rank', 'Silver/sem-rank', 'Silver/600'];
P('| Cenário real | Métrica | máx |Δ| vs FLAT (pontos de prob.) | onde | média Δ (real−flat) | nº de (ent,pol,OVR) com |Δ|>0,10 |'); P('|---|---|---|---|---|---|');
for (const scn of ['REAL_BAL', 'REAL_PW', 'REAL_PS', 'REAL_SPEC']) for (const k of ['pFirst', 'pTitle', 'eWins']) {
  let mx = 0; let where = ''; const ds = []; let big = 0;
  for (const ent of allEnt) for (const pol of ent.startsWith('Bronze') ? ['PROD'] : SILVER) for (const T of LV) {
    const a = agg(ent, pol, scn, T, k).m; const b = agg(ent, pol, 'FLAT', T, k).m; if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    // compara a MESMA dupla (mesmo OVR de dupla); REAL_PW/PS têm OVR de dupla = T também
    const d = a - b; ds.push(d); if (Math.abs(d) > Math.abs(mx)) { mx = d; where = `${ent} ${pol} OVR${T}`; } if (Math.abs(d) > 0.10) big++;
  }
  P(`| ${scn} | ${k} | ${f2(mx)} | ${where} | ${f2(mean(ds))} | ${big}/${ds.length} |`);
}
P(); P('**Direção do efeito de cada política (Δ vs PROD em P(1ª partida), Silver/600) — plano × real, OVR 45/55/65**\n');
P('| Política | FLAT 45/55/65 | REAL_BAL 45/55/65 | REAL_PW 45/55/65 | REAL_PS 45/55/65 | REAL_SPEC 45/55/65 |'); P('|---|---|---|---|---|---|');
for (const pol of SILVER.filter((x) => x !== 'PROD')) P(`| ${pol} | ${['FLAT', 'REAL_BAL', 'REAL_PW', 'REAL_PS', 'REAL_SPEC'].map((scn) => [45, 55, 65].map((T) => { const d = agg('Silver/600', pol, scn, T, 'pFirst').m - agg('Silver/600', 'PROD', scn, T, 'pFirst').m; return (d >= 0 ? '+' : '') + d.toFixed(2); }).join(' / ')).join(' | ')} |`);
P(); P('**Início de carreira — P(1ª partida) em Bronze/Silver(sem-rank), PROD: FLAT × REAL_BAL × PW × PS × SPEC**\n');
P('| Tier | Cenário | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|---|' + LV.map(() => '---').join('|') + '|');
for (const [ent, t] of [['Bronze/sem-rank', 'Bronze'], ['Silver/sem-rank', 'Silver']]) for (const scn of ['FLAT', 'REAL_BAL', 'REAL_PW', 'REAL_PS', 'REAL_SPEC']) P(`| ${t} | ${scn} | ${LV.map((T) => f2(agg(ent, 'PROD', scn, T, 'pFirst').m)).join(' | ')} |`);

// ── Etapa 6 ──
for (const ent of ['Gold-direto/300', 'Gold-qual/600']) for (const k of ['pMainR1', 'pTitle']) {
  P(); P(`### E6. ${ent} — ${k === 'pMainR1' ? 'P(vencer 1ª partida da chave principal)' : 'P(título)'} · REAL_BAL · média [mín–máx]`);
  P('| Política | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
  for (const pol of GOLD) P(`| ${pol} | ${LV.map((T) => cell(agg(ent, pol, 'REAL_BAL', T, k))).join(' | ')} |`);
}
P(); P('### E6b. Gold-direto/300 — vitórias esperadas · REAL_BAL');
P('| Política | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
for (const pol of GOLD) P(`| ${pol} | ${LV.map((T) => cell(agg('Gold-direto/300', pol, 'REAL_BAL', T, 'eWins'))).join(' | ')} |`);
P(); P('### E6c. Platinum/Masters (inalterados por construção) — P(1ª partida) · REAL_BAL');
P('| Cenário | ' + LV.map((T) => `OVR ${T}`).join(' | ') + ' |'); P('|---|' + LV.map(() => '---').join('|') + '|');
for (const ent of ['Platinum-direto/250', 'Masters-direto/150']) P(`| ${ent} | ${LV.map((T) => cell(agg(ent, 'PROD', 'REAL_BAL', T, 'pFirst'))).join(' | ')} |`);
P(); P('### E6d. Gold — plano × real (P(1ª partida principal), Gold-direto/300, OVR 55/65/75)');
P('| Política | FLAT | REAL_BAL | REAL_PW | REAL_PS | REAL_SPEC |'); P('|---|---|---|---|---|---|');
for (const pol of GOLD) P(`| ${pol} | ${['FLAT', 'REAL_BAL', 'REAL_PW', 'REAL_PS', 'REAL_SPEC'].map((scn) => [55, 65, 75].map((T) => f2(agg('Gold-direto/300', pol, scn, T, 'pMainR1').m)).join('/')).join(' | ')} |`);

// ── sensibilidade de maturidade do mundo ──
if (R.sensitivity?.length) {
  const w = R.sensitivity[0]; const w8 = S[0];
  P(); P(`### M. Sensibilidade: mundo ${w.seed} com +${w.warmDays} dias × +8 dias (mesma semente)`);
  P('| Tier | Política | mediana campo (+8d) | mediana campo (+45d) | 1ª rodada (+8d) | 1ª rodada (+45d) |'); P('|---|---|---|---|---|---|');
  for (const [tier, pols, ent] of [['Silver', SILVER, 'Silver/sem-rank'], ['Gold', GOLD, 'Gold-direto/300']]) for (const pol of pols) P(`| ${tier} | ${pol} | ${w8.fields[tier][pol].ovr.median} | ${w.fields[tier][pol].ovr.median} | ${w8.evals[ent].byPolicy[pol].path[0]?.ovr} | ${w.evals[ent].byPolicy[pol].path[0]?.ovr} |`);
}
fs.writeFileSync(path.join(dir, 'summary-tables.md'), out.join('\n'));
console.log(out.join('\n'));
