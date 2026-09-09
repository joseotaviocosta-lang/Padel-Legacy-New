import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Fase 5.1 — trocado de import ESM direto (`node` puro) pro mesmo padrão
// já usado por scripts/audit-real-athletes-simulation.mjs/test-match-
// integrity.mjs: `vite.ssrLoadModule`. `partnerOfferRules.js` passou a
// importar `getSuggestedPartnerTerms` de `partnerLifecycle.js` (Fase 5.1,
// item 2 — unificação dos 3 caminhos de contratação), que por sua vez
// importa `@/api/localGameClient.js` (alias só o Vite resolve) — quebrava
// o import direto deste teste, mesma classe de problema já corrigida em
// test-match-integrity.mjs.
const { createServer } = await import('vite');
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { buildInitialPartnerOffers, partnerOfferId, validatePartnerOfferAcceptance } = await vite.ssrLoadModule('/src/lib/partnerOfferRules.js');
  const { evaluatePartnerCompatibility } = await vite.ssrLoadModule('/src/players/teamCompatibility.js');
  const { migrateCareer } = await vite.ssrLoadModule('/src/careers/CareerMigration.js');
  const { CAREER_SAVE_SCHEMA_VERSION } = await vite.ssrLoadModule('/src/careers/careerSchema.js');

  const player = { id:'career-1', name:'José', career_date:'2026-01-02', preferred_side:'right', court_side:'direita', handedness:'right', tactical_role:'controlador', overall:52, overall_rating:52, ranking_position:900, reputation:55 };
  const candidates = [
    {id:'a',name:'Martín',preferred_side:'left',handedness:'right',tactical_role:'finalizador',overall:54,overall_rating:54,world_rank:850,career_status:'ativo'},
    {id:'b',name:'Bruno',preferred_side:'right',handedness:'left',tactical_role:'defensor',overall:53,overall_rating:53,world_rank:880,career_status:'ativo'},
    {id:'c',name:'Carlos',preferred_side:'left',handedness:'left',tactical_role:'pressionador',overall:59,overall_rating:59,world_rank:700,career_status:'ativo'},
    {id:'d',name:'Diego',preferred_side:'flex',handedness:'right',tactical_role:'coringa',overall:49,overall_rating:49,world_rank:1000,career_status:'ativo'},
  ];
  const offers = buildInitialPartnerOffers(player, candidates);
  assert.ok(offers.length >= 3 && offers.length <= 5);
  assert.equal(new Set(offers.map(item=>item.id)).size, offers.length);
  assert.equal(offers[0].recommended, true);
  assert.equal(offers[0].id, partnerOfferId(player.id, offers[0].candidate_player_id));
  assert.ok(offers.every(item=>item.candidate_snapshot?.id && item.status === 'pending'));
  const complementary = evaluatePartnerCompatibility(player, candidates[0]);
  const sameSide = evaluatePartnerCompatibility(player, candidates[1]);
  assert.equal(complementary.sideResolution.naturalFit, true);
  assert.ok(sameSide.sideResolution.penalties.total > 0);
  assert.ok(sameSide.warnings.length > 0);
  assert.equal(validatePartnerOfferAcceptance(player, offers[0], offers, null).ok, true);
  assert.equal(validatePartnerOfferAcceptance(player, {...offers[0],status:'expired'}, offers, null).code, 'OFFER_NOT_PENDING');
  assert.equal(validatePartnerOfferAcceptance(player, offers[0], [{...offers[1],status:'accepted'}], null).code, 'OTHER_OFFER_ACCEPTED');

  const legacy = { save_schema_version:13, player:{...player,partner_id:'a'}, entities:{CareerMessage:[{id:'m1',profile_id:'career-1',message_type:'proposta_parceria',sender_name:'Martín',related_entity_id:'a',related_entity_name:'Martín',status:'decisao_pendente',actions:[{id:'accept',payload:{bot:candidates[0],duration:60,split:50}}]}]} };
  const migrated = migrateCareer(legacy).data;
  assert.equal(migrated.save_schema_version, CAREER_SAVE_SCHEMA_VERSION);
  assert.equal(migrated.entities.PartnerOffer[0].status,'accepted');
  assert.equal(migrated.entities.CareerMessage[0].related_entity_type,'partner_offer');
  assert.equal(migrateCareer(migrated).data.entities.PartnerOffer.length,1);

  for (const [file, needle] of [['src/onboarding/tutorialSteps.js','/partners?view=offers&source=tutorial'],['src/pages/PartnerHub.jsx',"activeTab === 'offers'"],['src/components/partner/InboxPanel.jsx','view_partner_offer']]) assert.ok(fs.readFileSync(path.resolve(file),'utf8').includes(needle), `${file} deve integrar ofertas`);
  console.log('partner-offers-v2: navegação, geração, compatibilidade, concorrência lógica e migration OK');
} finally {
  await vite.close();
}
