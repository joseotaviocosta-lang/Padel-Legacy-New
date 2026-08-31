// Bug real (QA): notificações indevidas das propostas de dupla iniciais.
//
// O lote inicial de propostas (seed exibido na tela de Duplas/Propostas,
// buildInitialPartnerOffers, src/lib/partnerOfferRules.js) virava
// notificação — uma já chegava antes do jogador entrar na tela, e o resto
// do lote (3-4 propostas) "estourava" de uma vez ao interagir com a tela.
// O tutorial já obriga o jogador a ir a Duplas, comparar e escolher — notificar
// cada oferta do lote é redundante e inflaciona AÇÃO NECESSÁRIA sem nenhuma
// decisão nova ter sido criada.
//
// Causa raiz confirmada: ensureInitialPartnerOffers (src/lib/partnerOffers.js)
// chamava createOfferMessage (cria a notificação) para TODA oferta do lote,
// sem distinguir origem. A emissão está acoplada à CRIAÇÃO da oferta all
// tv (não a uma varredura/leitura separada) — mas a criação em si não deveria
// notificar quando a origem é o seed inicial.
//
// Correção: buildInitialPartnerOffers já marca cada oferta do lote com
// `source: 'initial-partner-offer'` (nenhum campo novo) — ensureInitialPartnerOffers
// agora pula createOfferMessage quando isSeedPartnerOffer(offer) é true.
// Propostas dinâmicas (processSpontaneousPartnerMarket, source diferente)
// continuam notificando normalmente, uma por proposta, na criação.
// Migração (CareerMigration.js, save_schema_version 21): saves gravados antes
// da correção têm essas mensagens marcadas como resolvidas (nunca apagadas).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  async list(dir = '.') { return [...this.files.keys()]; }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const {
    ensureInitialPartnerOffers, acceptPartnerOffer, rejectPartnerOffer, isSeedPartnerOffer, listPartnerOffers,
    processSpontaneousPartnerMarket,
  } = await vite.ssrLoadModule('/src/lib/partnerOffers.js');
  const { migrateCareer } = await vite.ssrLoadModule('/src/careers/CareerMigration.js');
  const { CAREER_SAVE_SCHEMA_VERSION } = await vite.ssrLoadModule('/src/careers/careerSchema.js');

  const CANDIDATE_TEMPLATE = [
    { id: 'a', name: 'Martín', preferred_side: 'left', handedness: 'right', tactical_role: 'finalizador', overall: 54, overall_rating: 54, world_rank: 850, career_status: 'ativo', market_status: 'livre' },
    { id: 'b', name: 'Bruno', preferred_side: 'right', handedness: 'left', tactical_role: 'defensor', overall: 53, overall_rating: 53, world_rank: 880, career_status: 'ativo', market_status: 'livre' },
    { id: 'c', name: 'Carlos', preferred_side: 'left', handedness: 'left', tactical_role: 'pressionador', overall: 59, overall_rating: 59, world_rank: 700, career_status: 'ativo', market_status: 'livre' },
    { id: 'd', name: 'Diego', preferred_side: 'flex', handedness: 'right', tactical_role: 'coringa', overall: 49, overall_rating: 49, world_rank: 1000, career_status: 'ativo', market_status: 'livre' },
    { id: 'e', name: 'Eduardo', preferred_side: 'left', handedness: 'right', tactical_role: 'finalizador', overall: 56, overall_rating: 56, world_rank: 760, career_status: 'ativo', market_status: 'livre' },
  ];

  async function freshCareer(id) {
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    const { career } = await manager.createCareer({ playerName: id });
    activeCareerAdapter.setActiveCareer(career);
    await activeCareerAdapter.createPlayerProfile({
      id: `${id}-player`, sport_name: id, career_date: '2026-01-02', birth_date: '2001-01-01',
      level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
      tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
      energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
    });
    const profile = await localGame.entities.PlayerProfile.get(`${id}-player`);
    for (const candidate of CANDIDATE_TEMPLATE) {
      await localGame.entities.AthleteProfile.create({ ...candidate, id: `${id}-cand-${candidate.id}` });
    }
    const candidates = await localGame.entities.AthleteProfile.filter({});
    return { manager, profile, candidates };
  }

  async function proposalMessages(profileId) {
    return localGame.entities.CareerMessage.filter({ profile_id: profileId, message_type: 'proposta_parceria' });
  }

  // ═══════════════ (a) Carreira nova não produz nenhuma notificação de proposta ═══════════════
  let sharedProfile;
  let sharedOffers;
  {
    const { profile, candidates } = await freshCareer('p1-fresh');
    const offers = await ensureInitialPartnerOffers(profile, candidates);
    gate('(a) Lote inicial foi realmente criado (>= 3 ofertas, todas marcadas source=initial-partner-offer)', offers.length >= 3 && offers.every(isSeedPartnerOffer));
    const messages = await proposalMessages(profile.id);
    gate('(a) Criar carreira nova + gerar o lote inicial NÃO produz NENHUMA notificação de proposta', messages.length === 0);
    sharedProfile = profile;
    sharedOffers = offers;
  }

  // ═══════════════ (b) Aceitar uma dupla não dispara notificações das demais propostas do seed ═══════════════
  {
    await acceptPartnerOffer(sharedProfile, sharedOffers[0]);
    const messages = await proposalMessages(sharedProfile.id);
    gate('(b) Aceitar uma oferta do lote inicial NÃO cria notificação para as demais propostas do seed', messages.length === 0);
    const offersAfter = await listPartnerOffers(sharedProfile.id);
    gate('(b) As demais ofertas do seed foram retiradas (withdrawn) — decisão real, sem gerar notificação', offersAfter.filter((o) => o.id !== sharedOffers[0].id).every((o) => o.status === 'withdrawn'));
    gate('(b) A oferta aceita está com status accepted', offersAfter.find((o) => o.id === sharedOffers[0].id)?.status === 'accepted');
  }

  // ═══════════════ (d) Recusar uma proposta do seed não gera notificação ═══════════════
  {
    const { profile, candidates } = await freshCareer('p1-reject-seed');
    const offers = await ensureInitialPartnerOffers(profile, candidates);
    gate('(d-seed) 0 notificações após gerar o lote (pré-condição)', (await proposalMessages(profile.id)).length === 0);
    await rejectPartnerOffer(profile, offers[1]);
    gate('(d-seed) Recusar uma proposta do seed NÃO gera notificação', (await proposalMessages(profile.id)).length === 0);
    const fresh = (await listPartnerOffers(profile.id)).find((o) => o.id === offers[1].id);
    gate('(d-seed) A proposta recusada muda de status para rejected (decisão real registrada)', fresh?.status === 'rejected');
  }

  // ═══════════════ (c) Proposta gerada no meio da temporada gera exatamente 1 notificação ═══════════════
  // processSpontaneousPartnerMarket usa hash determinístico (nunca Math.random)
  // — sorteado por (profileId, mês). Avança vários meses reais até um "acerto"
  // real, sem reimplementar o hash: mesma pipeline de produção, só repetida.
  let spontaneousProfile;
  let spontaneousMessageCountAfter;
  {
    const { profile: base } = await freshCareer('p1-spontaneous');
    // Livre (sem parceiro) maximiza a chance (22%) — sem AthleteProfile
    // "livre" reaproveitados do lote inicial (para não confundir com o seed).
    for (const candidate of CANDIDATE_TEMPLATE) {
      await localGame.entities.AthleteProfile.create({ ...candidate, id: `p1-spontaneous-market-${candidate.id}`, market_status: 'livre' });
    }
    let current = base;
    let hit = null;
    for (let month = 1; month <= 36 && !hit; month += 1) {
      const previousDate = `2026-${String(((month - 1) % 12) + 1).padStart(2, '0')}-15`;
      const currentDate = `2026-${String((month % 12) + 1).padStart(2, '0')}-01`;
      const before = await proposalMessages(current.id);
      current = await processSpontaneousPartnerMarket(current, previousDate, currentDate);
      const after = await proposalMessages(current.id);
      if (after.length > before.length) hit = { before: before.length, after: after.length };
    }
    assert.ok(hit, 'processSpontaneousPartnerMarket deveria acertar o sorteio em pelo menos 1 de 36 meses testados (~22% de chance por mês)');
    gate('(c) Proposta dinâmica gerada no meio da temporada cria exatamente 1 notificação nova', hit.after === hit.before + 1);
    const offersNow = await listPartnerOffers(current.id);
    const dynamicOffer = offersNow.find((o) => !isSeedPartnerOffer(o) && o.status === 'pending');
    gate('(c) A oferta dinâmica NÃO tem source de seed (origem realmente dinâmica)', Boolean(dynamicOffer) && !isSeedPartnerOffer(dynamicOffer));
    spontaneousProfile = current;
    spontaneousMessageCountAfter = hit.after;

    // ═══════════════ (d) Recusar a proposta dinâmica também não gera uma notificação NOVA ═══════════════
    await rejectPartnerOffer(current, dynamicOffer);
    const messagesAfterReject = await proposalMessages(current.id);
    gate('(d-dinâmica) Recusar a proposta dinâmica não cria uma notificação NOVA (mesma contagem de antes)', messagesAfterReject.length === spontaneousMessageCountAfter);
  }

  // ═══════════════ Auditoria estática: fonte canônica documentada, sem duplicar mecanismo ═══════════════
  {
    const src = read('src/lib/partnerOffers.js');
    gate('ensureInitialPartnerOffers pula createOfferMessage para ofertas do seed (isSeedPartnerOffer)', src.includes('if (!isSeedPartnerOffer(saved)) await createOfferMessage(profile, saved);'));
    gate('isSeedPartnerOffer usa o marcador já existente (source), não um campo novo/paralelo', src.includes("return offer?.source === 'initial-partner-offer';"));
  }

  // ═══════════════ Migração de saves existentes ═══════════════
  {
    const legacySeedOffer = { id: 'partner-offer-legacy-x', profile_id: 'legacy-x', candidate_player_id: 'cand-1', status: 'pending', source: 'initial-partner-offer', candidate_snapshot: { id: 'cand-1', name: 'Legado' } };
    const legacySeedMessage = { id: 'msg-1', profile_id: 'legacy-x', message_type: 'proposta_parceria', related_entity_type: 'partner_offer', related_entity_id: 'partner-offer-legacy-x', status: 'decisao_pendente', is_new: true, is_read: false, sender_name: 'Legado' };
    const legacyDynamicOffer = { id: 'partner-offer-legacy-y', profile_id: 'legacy-x', candidate_player_id: 'cand-2', status: 'pending', source: 'spontaneous-market-offer', candidate_snapshot: { id: 'cand-2', name: 'Dinâmico' } };
    const legacyDynamicMessage = { id: 'msg-2', profile_id: 'legacy-x', message_type: 'proposta_parceria', related_entity_type: 'partner_offer', related_entity_id: 'partner-offer-legacy-y', status: 'decisao_pendente', is_new: true, is_read: false, sender_name: 'Dinâmico' };
    const legacy = {
      save_schema_version: 20,
      player: { id: 'legacy-x', career_date: '2026-01-02' },
      entities: { PartnerOffer: [legacySeedOffer, legacyDynamicOffer], CareerMessage: [legacySeedMessage, legacyDynamicMessage] },
    };
    const migrated = migrateCareer(legacy).data;
    gate('Migração: save vai para a versão atual do schema', migrated.save_schema_version === CAREER_SAVE_SCHEMA_VERSION);
    const migratedSeedMsg = migrated.entities.CareerMessage.find((m) => m.id === 'msg-1');
    const migratedDynamicMsg = migrated.entities.CareerMessage.find((m) => m.id === 'msg-2');
    gate('Migração: notificação do lote inicial é marcada como resolvida (não apagada)', migratedSeedMsg.status === 'resolvida' && migratedSeedMsg.is_read === true && migratedSeedMsg.is_new === false);
    gate('Migração: notificação de proposta dinâmica NÃO é tocada (continua pendente/não lida)', migratedDynamicMsg.status === 'decisao_pendente' && migratedDynamicMsg.is_read === false);
    gate('Migração: nenhuma entidade foi removida (PartnerOffer/CareerMessage preservados)', migrated.entities.PartnerOffer.length === 2 && migrated.entities.CareerMessage.length === 2);
  }

  console.log(`\n${gates} gates executados, todos PASS — Partner Offer Notifications (bug de notificações indevidas).`);
} finally {
  await vite.close();
}
