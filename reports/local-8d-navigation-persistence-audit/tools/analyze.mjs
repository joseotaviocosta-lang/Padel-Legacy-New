// LOCAL-8D — consolida dynamic/<cenário>.json numa matriz rota × cenário.
// Agrupa cada escrita por DOMÍNIO e marca o que é só onboarding (introdução
// de página vista + carimbo do save). A classificação final A/B/C/D e a
// prioridade P0–P3 são decididas no relatório, com a causa no código.
// Uso: node reports/local-8d-navigation-persistence-audit/tools/analyze.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIR = 'reports/local-8d-navigation-persistence-audit';
const DOMAINS = {
  universo: ['AthleteProfile', 'TeamRanking', 'Tournament', 'Season', 'CircuitSeason', 'AthleteRankingResult', 'AthleteRankingHistory', 'AthleteCareerLegacy', 'Match', 'WorldEvent', 'Club', 'ClubMember', 'Coach', 'MarketEvent'],
  contratos_propostas: ['Partnership', 'PartnershipLegacy', 'PartnerOffer', 'PlayerContract', 'TournamentRegistration', 'CalendarEvent', 'Sponsor', 'StaffMember', 'CoachContract'],
  economia: ['FinancialTransaction', 'ShopItem', 'InventoryItem'],
  progressao: ['Mission', 'MissionProgress', 'Achievement', 'PlayerAchievement', 'TrainingSession', 'MonthlyCareerReport', 'AnnualCareerReport'],
  mensagens: ['CareerMessage', 'PressInterview', 'PressArticle', 'Post', 'HistoryEntry', 'Notification'],
  relacoes: ['Relationship', 'FanBase'],
};
const domainOf = (entity) => Object.entries(DOMAINS).find(([, list]) => list.includes(entity))?.[0] || 'outros';
const ONBOARDING_TOP = { tutorial: ['pageIntroductionsSeen'], player: ['updated_date', 'tutorial_onboarding'], save_version: ['(valor)'], updated_at: ['(valor)'], last_played_at: ['(valor)'] };
const onlyOnboarding = (top = {}) => Object.entries(top).every(([k, subs]) => ONBOARDING_TOP[k] && subs.every((s) => ONBOARDING_TOP[k].includes(s)));

function summarize(diff) {
  if (!diff) return null;
  const byDomain = {};
  const add = (kind, entity, n, extra) => {
    const d = domainOf(entity);
    byDomain[d] = byDomain[d] || {};
    byDomain[d][entity] = byDomain[d][entity] || { created: 0, removed: 0, changed: 0, fields: {} };
    byDomain[d][entity][kind] += n;
    if (extra) for (const [f, c] of Object.entries(extra)) byDomain[d][entity].fields[f] = (byDomain[d][entity].fields[f] || 0) + c;
  };
  for (const [e, v] of Object.entries(diff.created || {})) add('created', e, v.count);
  for (const [e, v] of Object.entries(diff.removed || {})) add('removed', e, v.count);
  for (const [e, v] of Object.entries(diff.changed || {})) add('changed', e, v.count, v.fields);
  const records = Object.values(byDomain).flatMap((x) => Object.values(x)).reduce((s, x) => s + x.created + x.removed + x.changed, 0);
  const topNonOnboarding = Object.fromEntries(Object.entries(diff.top || {}).filter(([k, subs]) => !(ONBOARDING_TOP[k] && subs.every((s) => ONBOARDING_TOP[k].includes(s)))));
  return { records, byDomain, top: diff.top || {}, topNonOnboarding, onboardingOnly: records === 0 && onlyOnboarding(diff.top) };
}

const files = existsSync(`${DIR}/dynamic`) ? readdirSync(`${DIR}/dynamic`).filter((f) => f.endsWith('.json')) : [];
const matrix = {};
const totals = { operations: 0, opsWithWrites: 0, opsOnboardingOnly: 0, opsWithRecordWrites: 0, records: 0, open2NonZero: 0, mathRandom: 0, careerWrites: 0 };
for (const f of files) {
  const data = JSON.parse(readFileSync(`${DIR}/dynamic/${f}`, 'utf8'));
  const scenario = data.scenario || f.replace('.json', '');
  for (const [route, entry] of Object.entries(data.routes || {})) {
    if (entry.skipped) { matrix[route] = matrix[route] || {}; matrix[route][scenario] = { skipped: entry.skipped }; continue; }
    const o1 = summarize(entry.open1?.diff); const o2 = summarize(entry.open2?.diff); const rl = summarize(entry.reloadVsNeutralBoot);
    for (const s of [o1, o2]) {
      totals.operations += 1;
      if (!s) continue;
      if (s.records || Object.keys(s.top).length) totals.opsWithWrites += 1;
      if (s.onboardingOnly && Object.keys(s.top).length) totals.opsOnboardingOnly += 1;
      if (s.records) totals.opsWithRecordWrites += 1;
      totals.records += s.records;
    }
    if (o2 && (o2.records || Object.keys(o2.topNonOnboarding).length)) totals.open2NonZero += 1;
    totals.mathRandom += (entry.open1?.mathRandomCalls || 0) + (entry.open2?.mathRandomCalls || 0);
    totals.careerWrites += (entry.open1?.careerWrites || 0) + (entry.open2?.careerWrites || 0);
    matrix[route] = matrix[route] || {};
    matrix[route][scenario] = {
      open1: o1, open2: o2, reload: rl,
      mathRandom: [entry.open1?.mathRandomCalls, entry.open2?.mathRandomCalls],
      careerWrites: [entry.open1?.careerWrites, entry.open2?.careerWrites],
    };
  }
}
// Achados: rota com escrita de REGISTRO (fora do onboarding) em algum cenário.
const findings = [];
for (const [route, perScenario] of Object.entries(matrix)) {
  const hits = Object.entries(perScenario).filter(([, v]) => v.open1 && (v.open1.records || Object.keys(v.open1.topNonOnboarding).length));
  if (!hits.length) continue;
  const entities = {};
  for (const [, v] of hits) for (const dom of Object.values(v.open1.byDomain)) for (const [e, c] of Object.entries(dom)) {
    entities[e] = entities[e] || { created: 0, removed: 0, changed: 0, fields: new Set() };
    entities[e].created += c.created; entities[e].removed += c.removed; entities[e].changed += c.changed;
    Object.keys(c.fields).forEach((x) => entities[e].fields.add(x));
  }
  findings.push({
    route,
    scenarios: hits.map(([s]) => s),
    domains: [...new Set(Object.keys(entities).map(domainOf))],
    entities: Object.fromEntries(Object.entries(entities).map(([e, c]) => [e, { ...c, fields: [...c.fields].slice(0, 12) }])),
    topNonOnboarding: Object.assign({}, ...hits.map(([, v]) => v.open1.topNonOnboarding)),
    idempotent: hits.every(([s]) => { const o2 = perScenario[s].open2; return !o2 || (!o2.records && !Object.keys(o2.topNonOnboarding).length); }),
    mathRandomOpen1: Math.max(...hits.map(([, v]) => v.mathRandom[0] || 0)),
  });
}
writeFileSync(`${DIR}/matrix.json`, JSON.stringify({ createdAt: new Date().toISOString(), scenarios: files.map((f) => f.replace('.json', '')), totals, findings, matrix }, null, 2));
console.log(JSON.stringify(totals));
const fmtEntity = (c) => [c.created ? `+${c.created}` : '', c.removed ? `-${c.removed}` : '', c.changed ? `~${c.changed}` : '', c.fields.length ? `[${c.fields.join(',')}]` : ''].filter(Boolean).join(' ');
for (const f of findings) {
  const ents = Object.entries(f.entities).map(([e, c]) => `${e} ${fmtEntity(c)}`).join(' | ');
  const top = Object.keys(f.topNonOnboarding).length ? ` topo:${JSON.stringify(f.topNonOnboarding)}` : '';
  console.log(`${f.route.padEnd(48)} ${f.scenarios.join(',').padEnd(40)} ${f.idempotent ? 'idempotente' : 'NAO idempotente'} rnd=${f.mathRandomOpen1} ${ents}${top}`);
}
