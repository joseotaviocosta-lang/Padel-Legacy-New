// Playthrough 4.8, Parte N — casos obrigatórios 5 e 6 (candidato ruim pra
// primeira dupla, forte penalização/exclusão) + Parte C/D: a exclusão real
// acontece em selectFirstPartnershipCandidates, nunca só no score.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { classifyFirstPartnershipCandidate, buildFirstPartnershipCandidateScore, selectFirstPartnershipCandidates, FIRST_PARTNERSHIP_CATEGORY } = await vite.ssrLoadModule('/src/lib/firstPartnershipScoring.js');

  const player16 = {
    id: 'test-day1', sport_name: 'Novo Atleta', country: 'Brasil', level: 'Iniciante', career_level: 1, xp: 0,
    coins: 100, career_date: '2026-01-01', birth_date: '2010-01-01',
    serve: 10, forehand: 10, backhand: 10, volley: 10, bandeja: 10, smash: 10,
    defense: 10, agility: 10, strategy: 10, emotional_control: 10,
    court_side: 'direita', play_style: 'Equilibrado', partner_chemistry: 50,
  };

  // Caso 5: candidato 35 anos, OVR 5, iniciante -> fortemente penalizado/excluído.
  const case5 = { id: 'case5', name: 'Álvaro Ramos', age: 35, overall: 5, overall_rating: 5, level: 'Iniciante', preferred_side: 'left', career_status: 'ativo' };
  assert.equal(classifyFirstPartnershipCandidate(case5), FIRST_PARTNERSHIP_CATEGORY.POOR_FIRST_PARTNER, 'caso 5 (35a/OVR5/iniciante) deveria classificar como POOR_FIRST_PARTNER');
  const scored5 = buildFirstPartnershipCandidateScore(player16, case5);
  assert.ok(scored5.score <= 20, `caso 5 deveria ter score fortemente penalizado (obtido ${scored5.score})`);

  // Caso 6: candidato 29 anos, OVR 7, iniciante -> fortemente penalizado/excluído.
  const case6 = { id: 'case6', name: 'Tiago Monteiro', age: 29, overall: 7, overall_rating: 7, level: 'Iniciante', preferred_side: 'right', career_status: 'ativo' };
  assert.equal(classifyFirstPartnershipCandidate(case6), FIRST_PARTNERSHIP_CATEGORY.POOR_FIRST_PARTNER, 'caso 6 (29a/OVR7/iniciante) deveria classificar como POOR_FIRST_PARTNER');
  const scored6 = buildFirstPartnershipCandidateScore(player16, case6);
  assert.ok(scored6.score <= 20, `caso 6 deveria ter score fortemente penalizado (obtido ${scored6.score})`);

  // Exclusão real da vitrine: mesmo se o pool for majoritariamente
  // candidatos ruins, a seleção final nunca deveria trazer nenhum deles --
  // "nunca recorra automaticamente a 35 anos, OVR 5, iniciante só pra
  // completar quantidade" (Parte D).
  const goodYoung = { id: 'good-young', name: 'Bom Jovem', age: 18, overall: 12, overall_rating: 12, potential: 34, preferred_side: 'left', tactical_role: 'coringa', career_status: 'ativo' };
  const mixedPool = [case5, case6, goodYoung,
    { id: 'case5b', name: 'Nuno Fernandes', age: 36, overall: 8, overall_rating: 8, career_status: 'ativo' },
    { id: 'case5c', name: 'Andrea Conti', age: 27, overall: 10, overall_rating: 10, career_status: 'ativo' },
  ];
  const picks = selectFirstPartnershipCandidates(player16, mixedPool, 4);
  assert.ok(picks.every((item) => item.category !== FIRST_PARTNERSHIP_CATEGORY.POOR_FIRST_PARTNER), 'nenhum POOR_FIRST_PARTNER pode aparecer na vitrine final, mesmo com pool majoritariamente ruim');
  assert.ok(picks.length < mixedPool.length, 'a vitrine deveria ser menor que o pool quando a maioria dos candidatos é ruim (nunca preenche com POOR_FIRST_PARTNER)');

  // Pool 100% ruim -> vitrine vazia é aceitável; nunca inclui ninguém do POOR.
  const allPoorPool = [case5, case6, { id: 'case5d', name: 'Ruim 3', age: 33, overall: 6, overall_rating: 6, career_status: 'ativo' }];
  const allPoorPicks = selectFirstPartnershipCandidates(player16, allPoorPool, 4);
  assert.equal(allPoorPicks.length, 0, 'pool inteiramente ruim deveria resultar em vitrine vazia, nunca incluir POOR_FIRST_PARTNER pra completar quantidade');

  console.log('test-first-partnership-poor-candidate-filter: PASS');
} finally {
  await vite.close();
}
