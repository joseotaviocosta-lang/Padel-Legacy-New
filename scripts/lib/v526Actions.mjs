import { appendFileSync } from 'node:fs';
// Playthrough 5.26 — AÇÕES DO JOGADOR, espelhando as páginas reais.
//
// Cada função chama as MESMAS funções de domínio que a página correspondente
// chama. Onde a lógica vive dentro do componente (sem função de domínio
// exportada), ela é reproduzida aqui linha a linha e isso é declarado:
//  - (LOCAL-9C.2-A: a compra deixou de ser réplica — Shop.jsx e buyAndEquip
//    chamam shopTransactions.purchaseShopItem; equipar usa toggleEquipItem);
//  - Missions.jsx onboarding (nome/lado/estilo → buildInitialProfile);
//  - TournamentModal.jsx `handleMatchFinished` (sequência de finalização da
//    rodada: recordTournamentMatchResult, recompensa da partida, físico,
//    TeamRanking/Partnership, bracket canônico, batch, finalização, conquistas).
// Nenhuma fórmula de balanceamento é reinventada; só a orquestração.

export async function loadActionModules(rt) {
  const L = (p) => rt.load(p);
  return {
    initialProfiles: await L('/src/lib/initialCareerProfiles.js'),
    career: await L('/src/lib/career.js'),
    partnerOffers: await L('/src/lib/partnerOffers.js'),
    partnership: await L('/src/lib/partnershipSystem.js'),
    partnerAthlete: await L('/src/lib/partnerAthlete.js'),
    partnerLifecycle: await L('/src/game-core/partnerLifecycle.js'),
    teamCompatibility: await L('/src/players/teamCompatibility.js'),
    relationships: await L('/src/lib/relationships.js'),
    pressData: await L('/src/lib/pressData.js'),
    postMatchInterview: await L('/src/lib/postMatchInterview.js'),
    interviewLifecycle: await L('/src/lib/interviewLifecycle.js'),
    careerStory: await L('/src/lib/careerStory.js'),
    sponsors: await L('/src/lib/sponsors.js'),
    sportsEconomy: await L('/src/lib/sportsEconomyV26.js'),
    economy: await L('/src/lib/economy.js'),
    staffCatalog: await L('/src/lib/staffCatalog.js'),
    staffLifecycle: await L('/src/game-core/staffLifecycle.js'),
    coaches: await L('/src/lib/coaches.js'),
    coachLifecycle: await L('/src/game-core/coachLifecycle.js'),
    store: await L('/src/lib/storeCatalog.js'),
    market: await L('/src/lib/marketEngine.js'),
    training: await L('/src/lib/trainingSystemV2.js'),
    trainingEconomy: await L('/src/lib/trainingEconomy.js'),
    registration: await L('/src/lib/tournamentRegistration.js'),
    calendarSystem: await L('/src/lib/calendarSystem.js'),
    circuit: await L('/src/lib/circuitCatalog.js'),
    runManager: await L('/src/gameplay/worldTour/TournamentRunManager.js'),
    settlement: await L('/src/gameplay/worldTour/tournamentSettlement.js'),
    tournamentLifecycle: await L('/src/game-core/tournamentLifecycle.js'),
    tournamentMatchLifecycle: await L('/src/game-core/tournamentMatchLifecycle.js'),
    committedRoster: await L('/src/lib/committedRoster.js'),
    teamRanking: await L('/src/lib/teamRanking.js'),
    matchEngine: await L('/src/lib/matchEngine.js'),
    physical: await L('/src/gameplay/worldTour/PhysicalConditionManager.js'),
    bond: await L('/src/lib/partnerBondSystem.js'),
    achievements: await L('/src/lib/achievementEngine.js'),
    achievementContext: await L('/src/lib/achievementContext.js'),
    entryManager: await L('/src/gameplay/worldTour/EntryManager.js'),
    equipment: await L('/src/game-core/equipmentLifecycle.js'),
  };
}

const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
// OVR exibido: média dos atributos planos (PlayerProfile); atletas do mundo só
// têm o campo `overall` (sem atributos planos), então caímos nele.
export const ovrOf = (p) => {
  if (!p) return null;
  const flat = Math.round(ATTRS.reduce((s, k) => s + (Number(p[k]) || 0), 0) / ATTRS.length);
  return flat > 0 ? flat : (Number(p.overall ?? p.overall_rating) || 0);
};

// ── Onboarding (Missions.jsx) ───────────────────────────────────────────────
export async function completeOnboarding(rt, A, profile, { side, style, name }) {
  const { localGame } = rt;
  let p = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: name, name });
  await rt.padel.incrementMissionProgress(p.id, 'set_player_name', 1, p.career_date);
  p = await localGame.entities.PlayerProfile.update(p.id, { court_side: side, preferred_side: side === 'direita' ? 'right' : 'left' });
  await rt.padel.incrementMissionProgress(p.id, 'choose_court_side', 1, p.career_date);
  p = await localGame.entities.PlayerProfile.get(p.id);
  const build = A.initialProfiles.buildInitialProfile({ handedness: p.handedness || 'right', preferredSide: side, playStyle: style, careerDifficultyId: p.career_difficulty || 'hard' });
  p = await localGame.entities.PlayerProfile.update(p.id, {
    ...build.attributes, play_style: style, tactical_role: build.tactical_role, archetype_id: build.archetype_id,
    archetype_label: build.archetype_label, build_affinity: build.affinity, recommended_training_attributes: build.recommended_attributes,
    unspent_attribute_points: 0, onboarding_completed: false, onboarding_stage: 'first-training',
  });
  await rt.padel.incrementMissionProgress(p.id, 'choose_play_style', 1, p.career_date);
  return { profile: await localGame.entities.PlayerProfile.get(p.id), build };
}

// ── Dupla (PartnerHub.jsx) ──────────────────────────────────────────────────
// Playthrough 5.27-G — só harness: PL527G_PARTNER_DUMP=<arquivo.jsonl> grava
// cada mercado de parceiro (ofertas iniciais e Busca) com o detalhamento por
// candidato e quem foi escolhido, para auditar a qualidade da decisão.
function dumpPartnerMarket(A, profile, kind, rows, chosen) {
  const file = process.env.PL527G_PARTNER_DUMP;
  if (!file) return;
  const terms = (c) => { try { return A.partnerLifecycle.getSuggestedPartnerTerms(profile, c); } catch { return {}; } };
  const line = {
    kind, date: profile.career_date, playerOvr: ovrOf(profile), playerRankPosition: Number(profile.ranking_position) || null, coins: Number(profile.coins) || 0,
    playerSide: profile.preferred_side || profile.position || null,
    candidates: rows.map((r) => { const c = r.candidate || {}; const t = terms(c); return {
      id: c.id, name: c.name || c.sport_name, ovr: Number(c.overall_rating ?? c.overall) || ovrOf(c), attrOvr: ovrOf(c), worldPoints: Number(c.world_ranking_points ?? c.ranking_points) || 0,
      worldRank: Number(c.world_rank ?? c.ranking_position) || null, compatibility: Number(r.offer?.compatibility ?? r.offer?.compatibility_snapshot?.total ?? r.offer?.compatibility_score) || 0,
      recommended: Boolean(r.offer?.recommended), side: c.preferred_side || c.position || null, age: Number(c.age) || null,
      salary: t.monthlySalary ?? null, prizeSplit: t.prizeSplit ?? null, durationDays: t.durationDays ?? null, chosen: Boolean(chosen && c.id === chosen.candidate?.id),
    }; }),
  };
  // Um arquivo por processo: linhas grandes de processos paralelos não se misturam.
  appendFileSync(`${file}.${process.pid}`, `${JSON.stringify(line)}\n`);
}

export async function ensurePartner(rt, A, profile, pick) {
  const { localGame } = rt;
  const active = (await localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, null, 1).catch(() => []))[0];
  if (active) return { partnership: active, changed: false };
  const available = A.career.getAvailablePartners(profile);
  const offers = (await A.partnerOffers.ensureInitialPartnerOffers(profile, available).catch(() => [])) || [];
  const pending = offers.filter((o) => o.status === 'pending');
  if (!pending.length) return invitePartner(rt, A, profile, pick);
  const offerRows = pending.map((o) => ({ offer: { ...o, compatibility: Number(o.compatibility_snapshot?.total) || 0 }, candidate: A.partnerOffers.offerCandidate(o) || {} }));
  const chosen = pick(pending.map((o) => ({ offer: o, candidate: A.partnerOffers.offerCandidate(o) || {} })));
  dumpPartnerMarket(A, profile, 'initial-offers', offerRows, chosen);
  if (!chosen) return { partnership: null, changed: false, offers: pending.length };
  const result = await A.partnerOffers.acceptPartnerOffer(profile, chosen.offer).catch((e) => ({ error: e.message }));
  // Oferta "pendente" que já expirou/foi superada falha ao aceitar; o jogador
  // vê o erro e vai à Busca (Convidar) em vez de insistir na mesma oferta.
  if (!result?.partnership) {
    const viaSearch = await invitePartner(rt, A, profile, pick);
    return { ...viaSearch, offerError: result?.error || 'sem parceria' };
  }
  return { partnership: result.partnership, changed: true, candidate: chosen.candidate, offers: pending.length };
}

// Sem oferta pendente (a caixa de ofertas só gera as ofertas INICIAIS): o
// jogador usa a Busca do PartnerHub → "Convidar" (PartnerSearch.jsx +
// PartnerHub.handleInvite): candidatos com interest.available, termos de
// getSuggestedPartnerTerms e startPartnership.
// Pool da Busca (PartnerSearch.jsx) — extraído para a amostragem de mercados da 5.27-G.
export async function buildSearchPool(rt, A, profile) {
  const relationships = (await A.relationships.getPlayerRelationships(profile.id).catch(() => [])) || [];
  const reals = (await A.career.getRealPartnerCandidates?.(profile).catch(() => [])) || [];
  // Mesma lista do PartnerSearch.jsx: sem templates cujo atleta se aposentou
  // (5.26-C, Bloco D). Com o código anterior à correção o helper não existe e
  // a lista volta a ser o catálogo cru — o que reproduz o laço.
  const retired = A.partnerAthlete.listRetiredPartnerOriginIds ? await A.partnerAthlete.listRetiredPartnerOriginIds() : null;
  const catalog = retired ? A.partnerAthlete.excludeRetiredPartnerTemplates(A.career.getAvailablePartners(profile), retired) : A.career.getAvailablePartners(profile);
  const pool = [...catalog, ...reals].map((bot) => {
    const compat = A.partnership.computeCompatibility(profile, bot, relationships);
    return { bot, compat, interest: A.teamCompatibility.calculatePartnershipInterest(profile, bot, compat) };
  }).filter((c) => c.interest?.available);
  return pool.map((c) => ({ offer: { compatibility: Number(c.compat?.total ?? c.compat) || 0, interestScore: c.interest?.score ?? null }, candidate: c.bot }));
}

// 5.27-G: grava um mercado de Busca sem decidir (amostrador de saves).
export async function samplePartnerMarket(rt, A, profile, kind = 'search-sample') {
  const rows = await buildSearchPool(rt, A, profile);
  dumpPartnerMarket(A, profile, kind, rows, null);
  return rows.length;
}

async function invitePartner(rt, A, profile, pick) {
  if (A.career.canChangePartner && !A.career.canChangePartner(profile)) return { partnership: null, changed: false, offers: 0, via: 'search', blocked: 'troca bloqueada' };
  const searchRows = await buildSearchPool(rt, A, profile);
  if (!searchRows.length) return { partnership: null, changed: false, offers: 0, via: 'search' };
  const chosen = pick(searchRows);
  dumpPartnerMarket(A, profile, 'search', searchRows, chosen);
  if (!chosen) return { partnership: null, changed: false, offers: searchRows.length, via: 'search' };
  const terms = A.partnerLifecycle.getSuggestedPartnerTerms(profile, chosen.candidate);
  const result = await A.partnership.startPartnership(profile, chosen.candidate, terms.durationDays, terms.prizeSplit).catch((e) => ({ error: e.message }));
  return { partnership: result?.partnership || null, changed: Boolean(result?.partnership), candidate: chosen.candidate, offers: searchRows.length, via: 'search', error: result?.error };
}

// ── Patrocínio (SponsorPanel.jsx) ───────────────────────────────────────────
export async function sponsorOptions(rt, A, profile) {
  const contracts = (await rt.localGame.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }).catch(() => [])) || [];
  const active = contracts.map(A.sponsors.normalizeSponsorshipContract).filter((c) => c && c.is_active);
  const market = A.sportsEconomy.getMonthlySponsorMarket(profile, A.sponsors.SPONSOR_CATALOG);
  const activeIds = new Set(active.map((c) => c.sponsor_id));
  const rows = (market.sponsors || []).filter((s) => s && s.id && !activeIds.has(s.id)).map((sponsor) => {
    const eligibility = A.sponsors.canSign(sponsor, profile);
    const check = eligibility.ok ? A.sponsors.validateSponsorSlot(sponsor, active) : eligibility;
    return { sponsor, check, offer: A.sponsors.negotiateOffer(sponsor, profile) };
  });
  return { active, signable: rows.filter((r) => r.check.ok), visible: rows.length };
}
export async function signSponsor(rt, A, profile, row) {
  await A.sponsors.signSponsorContract(profile, row.sponsor);
  return rt.localGame.entities.PlayerProfile.get(profile.id);
}

// ── Treinador (Coaches.jsx) ─────────────────────────────────────────────────
export async function coachOptions(rt, A, profile) {
  const careerId = rt.runtime.activeCareerAdapter.activeCareerId;
  const init = await A.coachLifecycle.ensureCoachMarketInitialized(careerId).catch(() => ({ coaches: [] }));
  const resolved = await A.coachLifecycle.resolveActiveCoach(profile).catch(() => ({ profile, coach: null }));
  const p = resolved.profile || profile;
  const closes = ((await rt.localGame.entities.FinancialTransaction.filter({ profile_id: p.id }).catch(() => [])) || [])
    .filter((t) => t.type === 'monthly_close').sort((a, b) => String(b.month).localeCompare(String(a.month)));
  const monthlyIncome = Number(closes[0]?.income) > 0 ? Number(closes[0].income) : null;
  const hired = resolved.coach || null;
  const market = A.coaches.buildCoachMarket((init.coaches || []).filter((c) => c.id !== hired?.id), p, { monthlyIncome });
  const available = (market.curated || market.available || []).map((item) => item.coach || item).filter(Boolean);
  return { profile: p, hired, available };
}
export async function hireCoach(rt, A, profile, coach) {
  const r = await A.coachLifecycle.hirePrimaryCoach(profile, coach, 12);
  return r?.profile || rt.localGame.entities.PlayerProfile.get(profile.id);
}

// ── Staff (Staff.jsx / StaffPanel.jsx) ──────────────────────────────────────
export async function staffOptions(rt, A, profile) {
  const hires = (await rt.localGame.entities.PlayerStaffHire.filter({ profile_id: profile.id }).catch(() => [])) || [];
  const activeHires = hires.filter((h) => !['terminated', 'expired'].includes(h.contract_status));
  const hiredRoles = new Set(activeHires.map((h) => h.staff_type));
  const market = A.staffCatalog.getStaffMarketForMonth(profile.career_date, profile);
  const slots = A.staffCatalog.getStaffSlots(profile.career_level || 1);
  const available = market.filter((c) => !hiredRoles.has(c.roleId) && c.available !== false && (Number(profile.career_level) || 1) >= (c.minCareerLevel || 1));
  return { activeHires, slots, available, freeSlots: Math.max(0, slots - activeHires.length) };
}
export async function hireStaffMember(rt, A, profile, candidate) {
  await A.economy.hireStaff(profile, candidate);
  await A.staffLifecycle.syncStaffEffects(await rt.localGame.entities.PlayerProfile.get(profile.id)).catch(() => null);
  return rt.localGame.entities.PlayerProfile.get(profile.id);
}

// ── Imprensa (Press.jsx load + InterviewModal + handleCompleteInterview) ────
// Única fonte de fãs (fan_appeal) do jogador. `chooseAnswer(question)` é a
// escolha do jogador (política); o resto é o MESMO fluxo persistido da página
// (sem as notificações de sino, que não mudam estado de jogo).
export async function answerPendingInterviews(rt, A, profile, { chooseAnswer, max = 3 } = {}) {
  const { localGame } = rt;
  const P = A.pressData;
  const p0 = await localGame.entities.PlayerProfile.get(profile.id);
  const [arts, mats, events, partnerships, registrations, relationships] = await Promise.all([
    localGame.entities.PressArticle.filter({ profile_id: p0.id }, '-created_date', 50).catch(() => []),
    localGame.entities.Match.filter({ profile_id: p0.id }, '-created_date', 20).catch(() => []),
    localGame.entities.CalendarEvent.filter({ profile_id: p0.id }, 'start_date', 100).catch(() => []),
    localGame.entities.Partnership.filter({ profile_id: p0.id }, '-created_date', 20).catch(() => []),
    localGame.entities.TournamentRegistration.filter({ profile_id: p0.id }, '-registered_at', 100).catch(() => []),
    A.relationships.getPlayerRelationships(p0.id).catch(() => []),
  ]);
  const existingJ = await localGame.entities.PressJournalist.filter({ profile_id: p0.id }, null, 50).catch(() => []);
  const recon = P.reconcileJournalistCatalog(existingJ || [], p0.id);
  for (const j of recon.missing) await localGame.entities.PressJournalist.upsert(j.id, j).catch(() => null);
  const journalists = await localGame.entities.PressJournalist.filter({ profile_id: p0.id }, null, 50).catch(() => []);
  const articles = arts || [];
  const pending = P.getPendingInterviews(p0, mats || [], {
    calendarEvents: events || [], partnership: A.partnership.selectActivePartnership(partnerships || []),
    registrations: registrations || [], rivalry: A.careerStory.getTopRivalry(relationships || []), pressArticles: articles,
  }).filter((iv) => !articles.some((a) => (a.source_event_id === iv.sourceId || a.related_event === iv.relatedEvent)
    && ['entrevista', 'repercussao', 'rumor', 'especulacao', 'previsao'].includes(a.article_type)));
  const results = [];
  let profileNow = p0;
  for (const interview of pending.slice(0, max)) {
    if (!A.interviewLifecycle.isInterviewActionable(interview, profileNow.career_date)) continue;
    const bias = interview.questionCategory === 'post_loss' || interview.questionCategory === 'rumor' ? 'critical' : 'any';
    const picked = P.pickJournalist(bias);
    const journalist = (journalists || []).find((j) => j.name === picked.name) || picked;
    const questions = P.selectInterviewQuestions(interview.questionCategory, interview.matchContext || {}, profileNow.recent_interview_question_ids || [], 2);
    if (!questions.length) continue;
    const answers = questions.map((q) => chooseAnswer(q));
    const effects = answers.reduce((acc, a) => { Object.keys(a.effects || {}).forEach((k) => { acc[k] = (acc[k] || 0) + a.effects[k]; }); return acc; }, { fan_appeal: 0, sponsor_appeal: 0, morale: 0, reputation: 0, journalist_bias: 0 });
    const postMatch = A.postMatchInterview.isPostMatchInterview(interview);
    const officialMatch = postMatch ? A.postMatchInterview.findOfficialInterviewMatch(interview, mats || [], profileNow) : null;
    if (postMatch && !officialMatch) continue;
    const processed = new Set(profileNow.processed_press_interview_sources || []);
    if (processed.has(interview.sourceId)) continue;
    if (postMatch) await rt.padel.incrementMissionProgress(profileNow.id, ['complete_interview', 'give_interview', 'respond_interview'], 1, profileNow.career_date, { triggerEventId: interview.sourceId }).catch(() => null);
    const tone = P.toneFromEffects(effects);
    const postMatchId = postMatch && String(interview.sourceId || '').startsWith('match:') ? interview.sourceId.slice('match:'.length) : null;
    const articleId = (postMatchId ? `round-news-${postMatchId}` : `press-response-${interview.id}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);
    await localGame.entities.PressArticle.upsert(articleId, {
      profile_id: profileNow.id, journalist_id: journalist.id, journalist_name: journalist.name, outlet: journalist.outlet,
      article_type: ['post_win', 'post_loss'].includes(interview.questionCategory) ? 'repercussao' : interview.questionCategory === 'rumor' ? 'rumor' : interview.questionCategory === 'speculation' ? 'especulacao' : interview.questionCategory === 'prediction' ? 'previsao' : 'entrevista',
      title: `Entrevista (${tone})`, content: '', tone,
      reputation_change: effects.reputation || 0, fan_appeal_change: effects.fan_appeal || 0, sponsor_appeal_change: effects.sponsor_appeal || 0, morale_change: effects.morale || 0,
      related_event: interview.relatedEvent, source_event_id: interview.sourceId, interview_status: 'answered', answered_at: new Date().toISOString(), career_date: profileNow.career_date, is_read: false,
    }).catch(() => null);
    const progressPatch = postMatch ? A.postMatchInterview.buildOfficialInterviewProgressPatch(profileNow, interview, mats || []) : {};
    const before = { fans: Number(profileNow.fan_appeal) || 0, reputation: Number(profileNow.reputation) || 0 };
    profileNow = await localGame.entities.PlayerProfile.update(profileNow.id, {
      ...P.applyReputationEffects(profileNow, effects), ...progressPatch,
      processed_press_interview_sources: [...processed, interview.sourceId].slice(-200),
      recent_interview_question_ids: [...(profileNow.recent_interview_question_ids || []), ...questions.map((q) => q.id)].slice(-20),
    });
    if (journalist.id) await localGame.entities.PressJournalist.update(journalist.id, { bias_toward_player: Math.max(-100, Math.min(100, (journalist.bias_toward_player || 0) + (effects.journalist_bias || 0))), interviews_done: (journalist.interviews_done || 0) + 1 }).catch(() => null);
    results.push({ category: interview.questionCategory, tone, effects, fansBefore: before.fans, fansAfter: Number(profileNow.fan_appeal) || 0, reputationBefore: before.reputation, reputationAfter: Number(profileNow.reputation) || 0 });
  }
  return { pending: pending.length, answered: results };
}

// Demitir staff — Staff.jsx onFire: fireStaff + syncStaffEffects.
export async function fireStaffMember(rt, A, profile, member) {
  const updated = await A.economy.fireStaff(member, profile);
  await A.staffLifecycle.syncStaffEffects(updated || await rt.localGame.entities.PlayerProfile.get(profile.id)).catch(() => null);
  return rt.localGame.entities.PlayerProfile.get(profile.id);
}
// Dispensar treinador — mesmo patch de Coaches.jsx handleFire.
export async function fireCoach(rt, profile) {
  return rt.localGame.entities.PlayerProfile.update(profile.id, {
    coach_id: null, coach_name: null, coach_monthly_salary: 0, coach_signing_cost: 0,
    coach_contract_status: 'terminated', coach_paid_by_club: false,
    coach_trust: 45, coach_relationship_months: 0, coach_tactical_understanding: 15,
  });
}

// ── Loja (Shop.jsx `buy`) + Inventário (Inventory.jsx equipar) ─────────────
export async function shopOptions(rt, A, profile) {
  const { localGame } = rt;
  await A.market.seedMarket?.().catch?.(() => null);
  await A.store.ensureExpandedShopCatalog().catch(() => null);
  const [items, inventory, events, histories, contracts] = await Promise.all([
    localGame.entities.ShopItem.filter({ is_available: true }, 'catalog_order', 1000).catch(() => []),
    localGame.entities.PlayerInventory.filter({ profile_id: profile.id }).catch(() => []),
    localGame.entities.MarketEvent.filter({ is_active: true }, '-priority', 20).catch(() => []),
    localGame.entities.MarketPriceHistory.filter({}, '-last_updated_date', 200).catch(() => []),
    localGame.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }).catch(() => []),
  ]);
  // LOCAL-9C.2-A: a mesma cotação da Loja e da compra canônica (eventos
  // vigentes na data da carreira, histórico mais recente, patrocínio ativo).
  // Antes: eventos sem filtro de vigência e sem a data (dia 1 fixo).
  const T = await rt.load('/src/game-core/shopTransactions.js');
  const sponsorsRef = T.sponsorRefsFromContracts(contracts || []);
  const marketProfile = { ...profile, active_sponsor_names: sponsorsRef.map((s) => s.sponsor_name) };
  const activeEvents = T.selectShopEvents(events || [], profile.career_date);
  const owned = new Set((inventory || []).map((i) => i.item_id));
  const rows = (items || []).filter(Boolean).map(A.store.normalizeShopItem).map((item) => {
    const price = Number(T.quoteShopItem(item, { events: activeEvents, history: T.selectItemPriceHistory(histories || [], item.id), sponsors: sponsorsRef, careerDate: profile.career_date })?.currentPrice ?? item.price) || Number(item.price) || 0;
    const access = A.store.getShopItemAccess(profile, item);
    const marketState = A.sportsEconomy.getEquipmentMarketState(item, marketProfile);
    const bonusTotal = Object.values(item.attribute_bonus || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    return { item, price, unlocked: access.unlocked, available: Boolean(marketState?.available) || owned.has(item.id), owned: owned.has(item.id), bonusTotal };
  });
  const equipped = (inventory || []).filter((i) => i.equipped);
  return { rows, inventory: inventory || [], equipped };
}
export async function buyAndEquip(rt, profile, row, inventory) {
  const { localGame } = rt;
  const item = row.item;
  if ((profile.coins || 0) < row.price) return { profile, bought: false };
  // LOCAL-9C.2-A: a mesma operação de domínio da Loja (Shop.jsx): valida e
  // cobra sobre o save atual, grava extrato e estoque no mesmo lote.
  const { purchaseShopItem } = await rt.load('/src/game-core/shopTransactions.js');
  const purchase = await purchaseShopItem(profile.id, item.id, { expectedPrice: row.price });
  if (!purchase.ok) return { profile: purchase.profile ? { ...profile, ...purchase.profile } : profile, bought: false, refused: purchase.code };
  const inv = purchase.inventoryItem;
  const p = purchase.profile;
  // Shop.jsx dispara sem await; aqui aguardamos só para o ledger atribuir a
  // recompensa da missão ao passo certo (mesmo efeito, outra ordem).
  await rt.padel.incrementMissionProgress(p.id, 'buy_item').catch(() => {});
  // Equipar (Inventory.jsx → equipmentLifecycle.toggleEquipItem, LOCAL-9B):
  // mesmo plano puro da tela — só flags do inventário (um item por
  // categoria) e o nome da raquete. O bônus não é gravado no atributo-base.
  const { toggleEquipItem } = await rt.load('/src/game-core/equipmentLifecycle.js');
  const shopItems = await localGame.entities.ShopItem.list();
  await toggleEquipItem({ profile: p, inventory: [...inventory, inv], target: inv, shopItems });
  await rt.padel.incrementMissionProgress(p.id, 'equip_item').catch(() => {});
  return { profile: await localGame.entities.PlayerProfile.get(p.id), bought: true, paid: purchase.price, appliedBonus: { ...(item.attribute_bonus || {}) } };
}

// ── Investimento (Economy.jsx) ──────────────────────────────────────────────
export async function invest(rt, A, profile, investmentId, amount) {
  const inv = A.economy.INVESTMENTS.find((i) => i.id === investmentId);
  if (!inv || amount < inv.min_amount || (profile.coins || 0) < amount) return profile;
  await A.economy.makeInvestment(profile, inv, amount);
  return rt.localGame.entities.PlayerProfile.get(profile.id);
}

// ── Treino (TrainingView.jsx) ───────────────────────────────────────────────
export async function train(rt, A, profile, activityId, intensityId, coach) {
  const activity = A.training.TRAINING_ACTIVITIES.find((a) => a.id === activityId) || A.training.TRAINING_ACTIVITIES[0];
  const res = await A.training.executeTraining(profile, activity, intensityId, coach?.training_bonus || {}).catch((e) => ({ error: e.message }));
  return { profile: res?.profile || await rt.localGame.entities.PlayerProfile.get(profile.id), res };
}

// ── Inscrição (TournamentRegistrationModal) ─────────────────────────────────
export async function registrationCandidates(rt, A, profile) {
  const tournaments = (await rt.localGame.entities.Tournament.list('-start_date', 400).catch(() => [])) || [];
  // Torneios em que já há inscrição ativa aparecem como "Inscrito" na tela.
  const regs = (await rt.localGame.entities.TournamentRegistration.filter({ profile_id: profile.id }).catch(() => [])) || [];
  const registered = new Set(regs.filter((r) => A.registration.ACTIVE_REGISTRATION_STATUSES.has(r.status)).map((r) => r.tournament_id));
  return tournaments.filter((t) => {
    if (!t || registered.has(t.id) || t.status === 'finalizado' || !A.circuit.isOfficialRankedTournament?.(t) && t.tier !== 'Exibição') return false;
    const w = A.registration.getTournamentRegistrationWindow(t);
    return w.opensAt && w.closesAt && profile.career_date >= w.opensAt && profile.career_date <= w.closesAt;
  });
}
// CLOUD-6H — fonte de verdade da seleção: a MESMA da tela (Tournaments.jsx /
// TournamentRegistrationModal): teamRank = getTeamRank(perfil, parceiro).rank e
// elegibilidade = evaluateTournamentEntry(buildAthleteEntryContext(perfil, teamRank, torneio)).
// Sem rank da dupla (0), buildAthleteEntryContext recai no rank individual, como no jogo.
export async function resolveGameTeamRank(A, profile) {
  const bot = profile.partner_id ? A.career.getPartnerBot(profile) : null;
  return bot ? Number((await A.teamRanking.getTeamRank(profile, bot).catch(() => ({ rank: 0 })))?.rank) || 0 : 0;
}
export function gameEntryFor(A, profile, teamRank, tournament) {
  return A.entryManager.evaluateTournamentEntry(tournament, A.entryManager.buildAthleteEntryContext(profile, teamRank, tournament));
}
// Comportamento histórico (rank INDIVIDUAL, só entrada direta; esconde o Gold por qualifying).
// Mantido apenas para reproduzir relatórios anteriores à CLOUD-6H: PL526_LEGACY_INDIVIDUAL_RANK_SELECTION=1.
export function legacyIndividualRankSelection() { return process.env.PL526_LEGACY_INDIVIDUAL_RANK_SELECTION === '1'; }
// Filtro "respeita o ranking exibido no card" (perfis atentos) e rank usado pela política de encaixe.
export function selectionRankFilter(A, profile, teamRank, individualRank) {
  if (legacyIndividualRankSelection()) {
    const rank = individualRank || 9999;
    return {
      rank,
      allows: (t) => { const min = Number(A.circuit.getTournamentTierConfig(t.tier)?.minRanking) || 0; return !min || rank <= min; },
    };
  }
  return {
    rank: A.entryManager.buildAthleteEntryContext(profile, teamRank, {}).rank || 9999,
    allows: (t) => gameEntryFor(A, profile, teamRank, t).eligible,
  };
}
export async function tryRegister(rt, A, profile, tournament, partner) {
  try {
    // Igual a Tournaments.jsx → registerForTournament: parceiro = getPartnerBot(perfil)
    // e teamRank = getTeamRank(perfil, parceiro).rank (sem ele, a elegibilidade
    // trata a dupla como "sem ranking" e só o Silver aceita).
    const bot = profile.partner_id ? A.career.getPartnerBot(profile) : null;
    const teamRank = await resolveGameTeamRank(A, profile);
    const res = await A.registration.registerTournament({ player: profile, partner: bot || { id: partner.id, status: 'active', name: partner.name }, tournament, teamRank });
    // registerTournament devolve {success:false, reasons} (não lança) e é idempotente.
    if (!res?.success) return { ok: false, reason: (res?.reasons || []).map((x) => (typeof x === 'string' ? x : x?.code || x?.message || '?')).join('; ') || 'recusado', profile };
    if (res.idempotent) return { ok: false, reason: 'já inscrito', profile };
    return { ok: true, profile: await rt.localGame.entities.PlayerProfile.get(profile.id) };
  } catch (e) { return { ok: false, reason: e.message, profile }; }
}
