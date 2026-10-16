import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// CLOUD-3B — busca manual de parceiros com `court_side` indefinido.
// Antes: getAvailablePartners/getLockedPartners/getRealPartnerCandidates
// devolviam [] sem court_side, e a busca manual mostrava lista vazia numa
// carreira recém-criada. Agora a busca (e só ela) lista candidatos sem
// atribuir lado ao jogador; o padrão dos helpers e as regras de convite
// ficam como estavam.
const { createServer } = await import('vite');
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const career = await vite.ssrLoadModule('/src/lib/career.js');
  const { calculatePartnershipInterest } = await vite.ssrLoadModule('/src/players/teamCompatibility.js');
  const { getAvailablePartners, getLockedPartners, getRealPartnerCandidates } = career;
  const SEARCH = { allowUndefinedSide: true };

  const base = {
    id: 'test-3b', sport_name: 'Novo Atleta', country: 'Brasil', level: 'Iniciante', career_level: 1, xp: 0,
    coins: 100, career_date: '2026-01-01', birth_date: '2010-01-01',
    play_style: 'Equilibrado', partner_chemistry: 50,
  };
  const withSide = (court_side) => ({ ...base, court_side });
  const ids = (list) => list.map((c) => c.id).sort().join(',');

  // 1. Sem lado: reproduz o bug (padrão vazio) e confirma a recuperação.
  for (const undefinedSide of [undefined, null, '']) {
    const p = withSide(undefinedSide);
    assert.equal(getAvailablePartners(p).length, 0, 'padrão (ofertas automáticas/onboarding) segue vazio sem lado');
    assert.equal(getLockedPartners(p).length, 0, 'padrão de bloqueados segue vazio sem lado');
    assert.equal((await getRealPartnerCandidates(p)).length, 0, 'padrão de reais segue vazio sem lado');
    const found = getAvailablePartners(p, SEARCH);
    assert.ok(found.length > 0, `busca manual deve listar candidatos sem lado (court_side=${JSON.stringify(undefinedSide)})`);
    assert.ok(getLockedPartners(p, SEARCH).length > 0, 'seção "fora de alcance" também aparece sem lado');
    assert.equal(p.court_side, undefinedSide, 'nenhum lado foi atribuído ao jogador');
  }

  // 2. Com lado direito/esquerdo: comportamento inalterado pela opção.
  for (const side of ['direita', 'esquerda', 'right', 'left']) {
    const p = withSide(side);
    const normal = getAvailablePartners(p);
    assert.ok(normal.length > 0, `lado ${side}: candidatos disponíveis`);
    assert.equal(ids(getAvailablePartners(p, SEARCH)), ids(normal), `lado ${side}: opção não altera o resultado`);
    assert.equal(ids(getLockedPartners(p, SEARCH)), ids(getLockedPartners(p)), `lado ${side}: bloqueados idênticos`);
  }

  // 3. Mesmos candidatos do jogador com lado definido (sem lista artificial).
  const noSide = getAvailablePartners(withSide(null), SEARCH);
  assert.equal(ids(noSide), ids(getAvailablePartners(withSide('direita'))), 'sem lado vê o mesmo pool elegível de quem tem lado');

  // 4. Ausência real de candidatos segue vazia (portão de interesse/nível intacto).
  const everyoneGated = noSide.every((c) => calculatePartnershipInterest(withSide(null), c).available);
  assert.ok(everyoneGated, 'candidatos listados sem lado passam no portão de interesse');
  const noOneProfile = { ...withSide(null), xp: 0, reputation: 0 };
  const eliteOnly = getLockedPartners(noOneProfile, SEARCH).filter((c) => (c.overall_rating ?? c.overall) > 24);
  assert.ok(eliteOnly.length > 0, 'candidatos fortes seguem bloqueados no início da carreira');
  assert.ok(!getAvailablePartners(noOneProfile, SEARCH).some((c) => eliteOnly.includes(c)), 'bloqueados não vazam para a lista disponível');
  assert.equal(getAvailablePartners({ ...withSide(null), xp: 0, ranking_position: 1500 }, SEARCH).filter((c) => c.career_status === 'aposentado').length, 0, 'aposentados continuam fora');

  // 5. Regras de negociação preservadas: convidar exige lado definido, com orientação na UI.
  const ui = readFileSync(new URL('../src/components/partner/PartnerSearch.jsx', import.meta.url), 'utf8');
  assert.match(ui, /allowUndefinedSide: true/, 'busca usa a opção só na própria tela');
  assert.match(ui, /canChange && hasSide && \(/, 'botão Convidar exige lado definido');
  assert.match(ui, /data-partner-search-side-notice/, 'orientação clara quando o lado não está definido');
  assert.ok(!/court_side\s*[:=]/.test(ui), 'a tela não atribui lado ao jogador');
  const hub = readFileSync(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8');
  assert.match(hub, /getAvailablePartners\(profile\), await listRetiredPartnerOriginIds/, 'ofertas automáticas seguem com o helper padrão');

  console.log('partner-search-undefined-side-3b: OK');
} finally {
  await vite.close();
}
