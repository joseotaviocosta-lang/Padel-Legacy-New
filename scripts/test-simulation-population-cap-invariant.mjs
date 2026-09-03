// Fase 2.5, item 4.1 — teste de invariante: nenhum corte de list()/filter()
// no loop de simulação diária/mensal (evolveAthletesMonthly,
// simulateWorldDay, processAiPartnershipMarket, processWorldCircuit,
// updateTeamRankings, resolveCompletedWorldTourEvents) pode ficar menor
// que a população-alvo (WORLD_RANKING_TARGET/TEAM_RANKING_TARGET). Esta é
// a SEXTA ocorrência do mesmo bug ao longo desta auditoria (200, 500,
// 1000, 1100, WorldEvent, CareerMessage, e agora aposentados sem poda) —
// este teste transforma a PRÓXIMA em falha de suíte, não em achado de
// auditoria três fases depois.
//
// Escopo: só os arquivos que fazem parte do loop de simulação de
// população/progressão (mesmo escopo que a Fase 2E corrigiu — não
// worldMarketLifecycle.js/athletePersonalityLifecycle.js/etc., que a
// própria Fase 1.5 já catalogou como débito técnico "Alto risco"/"Risco
// médio" separado, explicitamente adiado, não perdido — ver
// reports/real-athletes-audit/FASE-1.5-INVENTARIO-LIST-LIMIT.md).
// Reportado aqui como WARN (visível, não bloqueia a suíte) pra não cair
// no esquecimento.
import { readFileSync } from 'node:fs';
import { WORLD_RANKING_TARGET, TEAM_RANKING_TARGET } from '../src/lib/rankingPopulation.js';

const CORE_SIMULATION_FILES = [
  { path: 'src/lib/athleteBehavior.js', entity: 'AthleteProfile', target: WORLD_RANKING_TARGET, fn: 'evolveAthletesMonthly' },
  { path: 'src/game-core/worldSimulationLifecycle.js', entity: 'AthleteProfile', target: WORLD_RANKING_TARGET, fn: 'simulateWorldDay' },
  { path: 'src/game-core/aiPartnershipLifecycle.js', entity: 'AthleteProfile', target: WORLD_RANKING_TARGET, fn: 'processAiPartnershipMarket' },
  { path: 'src/game-core/circuitLifecycle.js', entity: 'AthleteProfile', target: WORLD_RANKING_TARGET, fn: 'processWorldCircuit' },
  { path: 'src/game-core/circuitLifecycle.js', entity: 'TeamRanking', target: TEAM_RANKING_TARGET, fn: 'updateTeamRankings' },
  { path: 'src/gameplay/worldTour/WorldTourLifecycle.js', entity: 'AthleteProfile', target: WORLD_RANKING_TARGET, fn: 'resolveCompletedWorldTourEvents' },
];

// Débito já catalogado pela Fase 1.5 (não corrigido nesta entrega — fora
// do escopo do item 4, que é sobre o loop de simulação núcleo). Listado
// aqui só pra continuar visível a cada rodada da suíte.
const KNOWN_DEFERRED_DEBT = [
  { path: 'src/game-core/worldMarketLifecycle.js', note: '500×3 (initializeWorldMarket) — Fase 1.5 "Alto risco", não corrigido' },
  { path: 'src/game-core/athletePersonalityLifecycle.js', note: '250×3 (ensureAthleteIntelligenceProfiles) — Fase 1.5 "Alto risco", não corrigido' },
  { path: 'src/pages/Ranking.jsx', note: '600 (TeamRanking) — Fase 1.5 "Risco médio", margem apertada' },
  { path: 'src/game-core/globalMarketLifecycle.js', note: '600 (TeamRanking) — Fase 1.5 "Risco médio", margem apertada' },
  { path: 'src/lib/teamRanking.js', note: '500/600 (TeamRanking) — Fase 1.5 "Risco médio", margem apertada' },
  { path: 'src/game-core/seasonLifecycle.js', note: '500 (TeamRanking) — mesma família, não catalogado individualmente na Fase 1.5' },
];

// Extrai só o CORPO da função nomeada (por casamento de chaves), não o
// arquivo inteiro — sem isso, chamadas de outras funções no mesmo arquivo
// (ex.: getAthletes/generateRelationships em athleteBehavior.js, ambas já
// triadas como corte de UI/contenção O(n²) intencional na Fase 1.5) eram
// confundidas com a função de simulação sendo checada.
function extractFunctionBody(source, fnName) {
  const startMatch = source.match(new RegExp(`(?:export\\s+)?async function\\s+${fnName}\\s*\\([^)]*\\)[^{]*\\{`));
  if (!startMatch) return null;
  let depth = 1;
  let i = startMatch.index + startMatch[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  return source.slice(start, i - 1);
}

function findLimitCalls(source, entity) {
  // Casa `Entity.list(sortArg, LIMITE)` e `Entity.filter(queryArg, sortArg, LIMITE)`
  // — LIMITE é o ÚLTIMO argumento antes do `)` de fechamento da chamada, um
  // literal numérico OU um identificador (que tentamos resolver abaixo).
  const pattern = new RegExp(`${entity}\\.(list|filter)\\(([^;]*?)\\)`, 'g');
  const calls = [];
  let match;
  while ((match = pattern.exec(source))) {
    const [full, method, argsText] = match;
    // Só chamadas de 1 linha (sem parênteses aninhados de outra chamada) —
    // suficiente para o padrão real usado neste arquivo (nenhum list()/
    // filter() de população aqui usa argumento multilinha ou aninhado).
    if (argsText.includes('(') || full.includes('\n')) continue;
    const args = argsText.split(',').map((part) => part.trim());
    const last = args[args.length - 1];
    if (!last || last === '{}' || /^\{.*\}$/.test(last)) continue; // filter({...}) sem sort/limit — não é corte de população
    calls.push({ method, raw: full, limitArg: last });
  }
  return calls;
}

function resolveLimit(source, limitArg, target) {
  if (/^\d+$/.test(limitArg)) return { value: Number(limitArg), resolved: true };
  // Identificador — procura `const NOME = <expressão com WORLD_RANKING_TARGET/TEAM_RANKING_TARGET e +/-/números>;`
  const defMatch = source.match(new RegExp(`const\\s+${limitArg}\\s*=\\s*([^;]+);`));
  if (!defMatch) return { value: null, resolved: false };
  const expr = defMatch[1].trim();
  const safeExpr = expr
    .replace(/WORLD_RANKING_TARGET/g, String(target === TEAM_RANKING_TARGET ? WORLD_RANKING_TARGET : target))
    .replace(/TEAM_RANKING_TARGET/g, String(TEAM_RANKING_TARGET));
  if (!/^[\d+\-*/\s.]+$/.test(safeExpr)) return { value: null, resolved: false };
  try {
    // eslint-disable-next-line no-eval
    const value = eval(safeExpr);
    return { value: Number(value), resolved: Number.isFinite(value) };
  } catch {
    return { value: null, resolved: false };
  }
}

const failures = [];
const warnings = [];
const passes = [];

for (const { path, entity, target, fn } of CORE_SIMULATION_FILES) {
  const source = readFileSync(path, 'utf8');
  const body = extractFunctionBody(source, fn);
  if (body === null) {
    warnings.push(`${path}: função "${fn}" não encontrada pelo padrão esperado (assinatura mudou?) — revisar manualmente.`);
    continue;
  }
  const calls = findLimitCalls(body, entity);
  if (!calls.length) {
    warnings.push(`${path} (${fn}): nenhuma chamada ${entity}.list/filter com corte encontrada dentro da função — pode não precisar mais, ou mudou de forma; revisar manualmente.`);
    continue;
  }
  for (const call of calls) {
    const { value, resolved } = resolveLimit(source, call.limitArg, target);
    if (!resolved) {
      warnings.push(`${path} (${fn}): "${call.raw}" — limite "${call.limitArg}" não resolvido estaticamente (constante fora do padrão TARGET±N); revisar manualmente.`);
      continue;
    }
    if (value < target) {
      failures.push(`${path} (${fn}): "${call.raw}" — limite ${value} < alvo de população ${target} (${entity}). Este corte volta a excluir parte da população, exatamente o achado #16b/2E que esta auditoria já corrigiu.`);
    } else {
      passes.push(`${path} (${fn}): "${call.raw}" — limite ${value} >= alvo ${target}. OK.`);
    }
  }
}

console.log('=== invariante de tetos de população — sistema de simulação núcleo ===');
passes.forEach((line) => console.log(`PASS — ${line}`));
warnings.forEach((line) => console.log(`WARN — ${line}`));

console.log('\n=== débito já catalogado (Fase 1.5), fora do escopo desta entrega — só visibilidade ===');
for (const { path, note } of KNOWN_DEFERRED_DEBT) {
  console.log(`DEBT — ${path}: ${note}`);
}

if (failures.length) {
  console.log('\n=== FALHAS ===');
  failures.forEach((line) => console.log(`FAIL — ${line}`));
}

console.log(`\n${passes.length} PASS, ${warnings.length} WARN, ${failures.length} FAIL (núcleo), ${KNOWN_DEFERRED_DEBT.length} débito catalogado (fora do escopo, não bloqueia).`);
process.exitCode = failures.length ? 1 : 0;
