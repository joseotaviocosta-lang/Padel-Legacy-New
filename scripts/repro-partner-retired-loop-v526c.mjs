// Playthrough 5.26-C, Bloco D — reprodução do laço de re-contratação diária.
//
// Sequência medida na 5.26 (normal-004/008, optimizer-015: mesmo parceiro,
// player-fictional-1dmegvd, re-contratado todo dia a partir de 2028-05-01):
//   1. o jogador contrata um parceiro do CATÁLOGO pela busca;
//   2. o atleta materializado desse parceiro se aposenta (evolveAthleteCareerMonth);
//   3. processPartnerDay encerra a dupla (Aposentadoria do parceiro);
//   4. a busca oferece o MESMO template e startPartnership reaproveita a
//      linha aposentada → volta ao passo 3 no dia seguinte.
// O passo 2 é aplicado com o MESMO patch que evolveAthleteCareerMonth grava
// (retired/career_status/market_status) — esperar a aposentadoria natural
// exigiria ~2 anos de simulação por execução.
// Saída: RS_OUT (JSON) com assinaturas por dia, encerramentos e o resumo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { installDeterminism, MemoryStorage, bootRuntime, createRealCareer } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';

const DAYS = Number(process.env.RS_DAYS || 30);
const OUT = resolve(process.env.RS_OUT || 'reports/progression-clean-526c/partner-loop-repro.json');
installDeterminism('partner-retired-526c');
const rt = await bootRuntime(new MemoryStorage());
const A = await act.loadActionModules(rt);
const { profile: p0 } = await createRealCareer(rt, { saveName: 'retired-loop' });
await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Repro' });
const E = rt.localGame.entities;
const fresh = () => E.PlayerProfile.get(p0.id);
const first = (rows) => rows[0];
const partnerOf = (row) => row?.partner_bot_id || row?.athlete_b_id || null;

// 1. Histórico das carreiras da 5.26: a primeira dupla veio de uma oferta
// inicial ACEITA (depois disso ensureInitialPartnerOffers não gera mais
// nada); as trocas seguintes, pela busca (convite a um template do catálogo).
let profile = await fresh();
await act.ensurePartner(rt, A, profile, first);
profile = await fresh();
// O MESMO candidato que a busca escolhe (1º com interesse disponível).
const relationships = (await A.relationships.getPlayerRelationships(profile.id).catch(() => [])) || [];
const bot = A.career.getAvailablePartners(profile).find((candidate) => {
  const compat = A.partnership.computeCompatibility(profile, candidate, relationships);
  return A.teamCompatibility.calculatePartnershipInterest(profile, candidate, compat)?.available;
});
const terms = A.partnerLifecycle.getSuggestedPartnerTerms(profile, bot);
const started = await A.partnership.startPartnership(profile, bot, terms.durationDays, terms.prizeSplit);
const retiredId = partnerOf(started.partnership);

// 2. Aposentadoria do atleta materializado (patch de evolveAthleteCareerMonth).
profile = await fresh();
await E.AthleteProfile.update(retiredId, { retired: true, retirement_date: profile.career_date, career_status: 'aposentado', market_status: 'aposentado' });

const signs = [{ date: profile.career_date, partner: retiredId, partnershipId: started.partnership.id, via: 'fixture' }];
const days = [];
for (let i = 0; i < DAYS; i += 1) {
  // 3. Avanço real de um dia (processPartnerDay roda aqui).
  const adv = await rt.calendar.advanceCareerDays(await fresh(), 1);
  if (adv.blockedBy?.id) await A.calendarSystem.resolveDecision(adv.blockedBy.id, 'skip').catch(() => null);
  profile = await fresh();
  const before = await A.partnership.getActivePartnership(profile.id);
  // 4. Política do harness: sem dupla → busca/convida (lista do PartnerSearch).
  const r = before ? { changed: false } : await act.ensurePartner(rt, A, profile, first);
  const after = await A.partnership.getActivePartnership(profile.id);
  if (r.changed) signs.push({ date: profile.career_date, partner: partnerOf(r.partnership), partnershipId: r.partnership?.id, via: r.via || 'offer' });
  days.push({ date: profile.career_date, activeBefore: partnerOf(before), activeAfter: partnerOf(after), signed: r.changed ? partnerOf(r.partnership) : null, error: r.error || r.offerError || null });
}
const ended = ((await E.Partnership.filter({ profile_id: p0.id }).catch(() => [])) || [])
  .filter((row) => row.status !== 'ativa').map((row) => ({ id: row.id, partner: partnerOf(row), status: row.status, reason: row.end_reason, started: row.started_career_date, ended: row.ended_career_date }));
const retiredResigns = signs.slice(1).filter((s) => s.partner === retiredId).length;
const summary = { days: DAYS, retiredPartner: retiredId, signs: signs.length, retiredResigns, endedByRetirement: ended.filter((e) => /Aposentadoria/.test(e.reason || '')).length, finalPartner: days.at(-1)?.activeAfter || null };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ summary, signs, ended, days }, null, 2));
console.log(JSON.stringify(summary));
await rt.close();
process.exit(0);
