// Fase 2A.3 — teste de integridade do registro canônico de atletas reais:
// nenhum id duplicado no registro; todo partner_id resolve para um id
// existente; nenhum atleta real duplicado no pool de ranking procedural;
// os três sistemas (registro, catálogo de prática, pool de ranking) usam o
// MESMO id canônico para a mesma pessoa.
const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { validateRealAthleteRegistryIntegrity, getRealAthleteRegistry, getConfirmedRealPairs, getProbableRealPairs, getUnpairedRealAthleteIds } = await vite.ssrLoadModule('/src/players/realAthleteRegistry.js');
  const { getRealAthletes } = await vite.ssrLoadModule('/src/players/realAthletes.js');
  const { buildSupplementalRankingPopulation } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');

  const failures = [];

  const integrity = validateRealAthleteRegistryIntegrity();
  if (!integrity.ok) failures.push(...integrity.errors);

  const registry = getRealAthleteRegistry();
  if (registry.length !== 100) failures.push(`esperado 100 reais no registro, achou ${registry.length}`);

  const confirmed = getConfirmedRealPairs();
  const probable = getProbableRealPairs();
  const unpaired = getUnpairedRealAthleteIds();
  if (confirmed.length !== 6) failures.push(`esperado 6 pares confirmados, achou ${confirmed.length}`);
  if (probable.length !== 21) failures.push(`esperado 21 pares prováveis, achou ${probable.length}`);
  if (unpaired.length !== 46) failures.push(`esperado 46 reais sem parceiro, achou ${unpaired.length}`);
  if (confirmed.length * 2 + probable.length * 2 + unpaired.length !== 100) failures.push('confirmados+prováveis+sem-parceiro não somam 100');

  // catálogo de prática (realAthletes.js) tem que expor o MESMO conjunto de
  // 100 pessoas, com o MESMO id canônico usado como template_id de origem.
  const practiceCatalog = getRealAthletes();
  if (practiceCatalog.length !== 100) failures.push(`catálogo de prática deveria ter 100 reais, tem ${practiceCatalog.length}`);
  const registryIds = new Set(registry.map((a) => a.id));
  const practiceTemplateIds = new Set(practiceCatalog.map((a) => a.template_id));
  const missingFromPractice = [...registryIds].filter((id) => !practiceTemplateIds.has(id));
  if (missingFromPractice.length) failures.push(`ids do registro ausentes no catálogo de prática: ${missingFromPractice.join(', ')}`);

  // ids duplicados dentro do próprio catálogo de prática (independente do registro)
  const dupPractice = practiceCatalog.map((a) => a.id).filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupPractice.length) failures.push(`ids duplicados no catálogo de prática: ${[...new Set(dupPractice)].join(', ')}`);

  // Fase 2A.3: nenhum real duplicado no pool de ranking procedural — nem
  // por bot_id (impossível por construção, prefixos diferentes) nem por
  // NOME (a checagem de usedNames em buildSupplementalRankingPopulation
  // precisa mesmo enxergar os 100 reais, senão um procedural podia gerar
  // um nome colidente sem ninguém perceber).
  const supplemental = buildSupplementalRankingPopulation(registry, []);
  const registryNames = new Set(registry.map((a) => a.name.trim().toLowerCase()));
  const registryBotIds = new Set(registry.map((a) => a.bot_id));
  const nameCollisions = supplemental.athletes.filter((a) => registryNames.has(String(a.name).trim().toLowerCase()));
  const botIdCollisions = supplemental.athletes.filter((a) => registryBotIds.has(a.bot_id));
  if (nameCollisions.length) failures.push(`procedurais com nome igual a um real: ${nameCollisions.map((a) => a.name).join(', ')}`);
  if (botIdCollisions.length) failures.push(`procedurais com bot_id igual a um real: ${botIdCollisions.map((a) => a.bot_id).join(', ')}`);
  if (supplemental.athletes.length !== 900) failures.push(`esperado 900 procedurais pra fechar 1000, achou ${supplemental.athletes.length}`);

  if (failures.length) {
    console.log('FAIL:');
    for (const f of failures) console.log(' -', f);
    process.exitCode = 1;
  } else {
    console.log(`PASS — registro íntegro: ${registry.length} reais, ${confirmed.length} pares confirmados, ${probable.length} prováveis, ${unpaired.length} sem parceiro. Catálogo de prática e registro usam o mesmo id canônico para todo mundo.`);
  }
} finally {
  await vite.close();
}
