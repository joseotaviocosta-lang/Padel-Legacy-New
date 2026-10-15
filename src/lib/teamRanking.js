import { localGame } from '@/api/localGameClient.js';
import { BOTS_BY_DIFFICULTY, simulateMatch } from '@/lib/bots';
// Playthrough 5.11, Parte S — a fórmula canônica mora em módulo próprio
// (sem dependências) para poder ser usada também por rankingPopulation.js,
// que este arquivo já importa. Reexportada aqui para que os consumidores
// continuem importando de '@/lib/teamRanking'.
import { computeCanonicalTeamRankingPoints, resolveTeamRankingMemberPoints } from '@/lib/teamRankingFormula.js';
// Playthrough 5.16, Parte R — o reparo de save legado precisa saber quem é
// atleta REAL para identificar dupla fantasma. Mesmo registro que
// saveFoundation.js já consome; é um módulo de dados puro, sem ciclo.
import { getRealAthleteRegistry } from '@/players/realAthleteRegistry.js';
// 5.26-C, Bloco C — mesma resolução de identidade da materialização de parceiros.
import { findMaterializedPartnerAthlete } from '@/lib/partnerAthlete.js';

export { computeCanonicalTeamRankingPoints, resolveTeamRankingMemberPoints };

const PRO_TEAMS = [];
for (let i = 0; i < 10; i += 2) {
  PRO_TEAMS.push([BOTS_BY_DIFFICULTY.lenda[i], BOTS_BY_DIFFICULTY.lenda[i + 1]]);
}
for (let i = 0; i < 10; i += 2) {
  PRO_TEAMS.push([BOTS_BY_DIFFICULTY.elite[i], BOTS_BY_DIFFICULTY.elite[i + 1]]);
}
for (let i = 0; i < 10; i += 2) {
  PRO_TEAMS.push([BOTS_BY_DIFFICULTY.avancado[i], BOTS_BY_DIFFICULTY.avancado[i + 1]]);
}

export function teamKey(id1, id2) {
  return [id1, id2].sort().join('_');
}

// Playthrough 4.5C, itens 7/8 — "Top duplas" (Journal.jsx) e a aba Duplas
// (Ranking.jsx) mostravam Coello/Tapia e Galán/Chingotto duplicados. Causa:
// múltiplos pontos de escrita de TeamRanking (saveFoundation.js na
// semeadura, circuitLifecycle.js:updateTeamRankings toda semana,
// tournamentLifecycle.js/partnershipSystem.js/ranking.js pontualmente) —
// cada um faz seu próprio "filter por team_key, senão cria", em leituras
// e escritas SEPARADAS (não uma transação atômica). Se duas dessas
// gravações correm entrelaçadas na mesma janela (a MESMA classe de corrida
// já corrigida para `ai_partner_id` na Playthrough 4.5A — ex.:
// ensureWorldSeed2025, fire-and-forget, ainda em voo quando
// processWorldCircuit/updateTeamRankings roda no mesmo avanço de dia),
// nenhuma das duas vê a escrita da outra a tempo, e as duas criam uma
// linha nova para o MESMO par — dois documentos, `team_key` igual,
// `id` diferente. `TeamRanking.list()` não deduplica sozinho.
//
// Identidade canônica: recalculada de player1_id/player2_id via `teamKey`
// (ids ordenados) — não confia no campo `team_key` armazenado, que pode
// ter sido gravado por um caminho antigo/divergente. Nunca deduplica só
// por nome (dois pares diferentes podem ter nomes parecidos; o pedido é
// explícito: identidade por id, não string). Mantém a linha mais completa
// (mais pontos e, empatado, mais recente) — nunca soma pontos entre as
// duas linhas duplicadas.
export function canonicalPairId(id1, id2) {
  return teamKey(id1, id2);
}

const normalizeMemberName = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');

// Recupera linhas legadas apenas quando cada membro resolve por um alias de
// ID explícito ou por um nome único no AthleteProfile. Ambiguidade não é
// "adivinhada": a linha permanece preservada, mas fora do ranking atual.
export function buildLegacyTeamRankingRepair(row = {}, athletes = []) {
  const byName = new Map();
  for (const athlete of athletes || []) {
    const name = normalizeMemberName(athlete?.name || athlete?.sport_name);
    if (!name || !athlete?.id) continue;
    const matches = byName.get(name) || [];
    matches.push(athlete.id);
    byName.set(name, matches);
  }
  const resolve = (canonical, aliases, name) => {
    const explicit = canonical || aliases.find(Boolean);
    if (explicit) return explicit;
    const matches = byName.get(normalizeMemberName(name)) || [];
    return matches.length === 1 ? matches[0] : null;
  };
  const id1 = resolve(row.player1_id, [row.athlete1_id, row.player_a_id], row.player1_name);
  const id2 = resolve(row.player2_id, [row.athlete2_id, row.player_b_id], row.player2_name);
  if (!id1 || !id2 || id1 === id2) return null;
  const key = canonicalPairId(id1, id2);
  const patch = {};
  if (row.player1_id !== id1) patch.player1_id = id1;
  if (row.player2_id !== id2) patch.player2_id = id2;
  if (row.team_key !== key) patch.team_key = key;
  const matches = Number(row.matches_played);
  if (!Number.isFinite(matches) || matches < 0) {
    const wins = Number(row.wins);
    const losses = Number(row.losses);
    if (Number.isFinite(wins) && wins >= 0 && Number.isFinite(losses) && losses >= 0) patch.matches_played = wins + losses;
  }
  if (!Object.keys(patch).length) return null;
  return { ...patch, integrity_status: 'legacy-repaired-v56' };
}

export function isCanonicalTeamRankingRow(row = {}) {
  return Boolean(row.player1_id && row.player2_id && row.player1_id !== row.player2_id
    && row.team_key === canonicalPairId(row.player1_id, row.player2_id)
    && Number.isFinite(Number(row.ranking_points)) && Number(row.ranking_points) >= 0
    && Number.isFinite(Number(row.matches_played)) && Number(row.matches_played) >= 0);
}

export function validateTeamRankingIntegrity(rows = [], athletes = []) {
  const issues = [];
  const canonicalCounts = new Map();
  for (const row of rows || []) {
    if (!isCanonicalTeamRankingRow(row)) {
      issues.push({ id: row?.id || null, team_key: row?.team_key || null, issue: 'non-canonical-team-row', recoverable: Boolean(buildLegacyTeamRankingRepair(row, athletes)) });
      continue;
    }
    canonicalCounts.set(row.team_key, (canonicalCounts.get(row.team_key) || 0) + 1);
  }
  for (const [teamKeyValue, count] of canonicalCounts) {
    if (count > 1) issues.push({ id: null, team_key: teamKeyValue, issue: 'duplicate-canonical-pair', recoverable: false, count });
  }
  return { ok: issues.length === 0, checked: (rows || []).length, issues };
}

// Playthrough 5.10, Partes M/N/O — a versão anterior filtrava por
// `isCanonicalTeamRankingRow`, que EXIGE `team_key` persistido igual ao
// canônico. Isso contradizia o comentário de contrato acima ("não confia no
// campo team_key armazenado, que pode ter sido gravado por um caminho
// antigo/divergente"): na prática a função confiava, e toda linha legada
// com key divergente ou ausente SUMIA da aba Duplas em vez de ser
// deduplicada. Provado por sonda: divergent/missing key -> dedupeKeeps=0.
//
// Autoridade agora é `canonicalPairId(player1_id, player2_id)` — sempre
// recalculada. `team_key` divergente/ausente é NORMALIZADO, nunca motivo de
// descarte. O único critério de exclusão é estrutural (Parte O): sem os
// dois ids de membro, a linha não tem identidade de par e não pode entrar
// na classificação atual — o dado bruto segue intacto no banco.
export function normalizeTeamRankingRow(row = {}) {
  const id1 = row?.player1_id;
  const id2 = row?.player2_id;
  if (!id1 || !id2 || id1 === id2) return null;
  const key = canonicalPairId(id1, id2);
  if (row.team_key === key) return row;
  // Parte N — reconstrói a key a partir dos ids ordenados, sem inventar
  // membro nenhum e sem tocar em pontos/estatísticas.
  return { ...row, team_key: key, team_key_normalized_from: row.team_key ?? null };
}

// Parte P — prioridade determinística entre duas linhas do MESMO par
// canônico. NUNCA soma pontos (somar duplicata é exatamente o bug que a
// dedupe existe para evitar). Ordem: mais pontos > mais partidas >
// atualização mais recente > key já canônica na origem.
function pickPreferredTeamRankingRow(current, candidate) {
  const points = (row) => Number(row.ranking_points) || 0;
  const matches = (row) => Number(row.matches_played) || 0;
  const updated = (row) => String(row.updated_date || '');
  const canonicalOrigin = (row) => (row.team_key_normalized_from == null ? 1 : 0);
  const rank = (row) => [points(row), matches(row), updated(row), canonicalOrigin(row)];
  const a = rank(candidate);
  const b = rank(current);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] > b[i]) return candidate;
    if (a[i] < b[i]) return current;
  }
  return current;
}

export function dedupeTeamRankingsByCanonicalPair(rows = []) {
  const byPair = new Map();
  for (const row of rows) {
    const normalized = normalizeTeamRankingRow(row);
    if (!normalized) continue;
    const key = normalized.team_key;
    const current = byPair.get(key);
    if (!current) { byPair.set(key, normalized); continue; }
    byPair.set(key, pickPreferredTeamRankingRow(current, normalized));
  }
  return [...byPair.values()];
}

export async function updateTeamRanking(profile, partner, won, bonusPoints = 0) {
  if (!profile?.id || !partner?.id) return;

  const key = teamKey(profile.id, partner.id);
  const basePoints = won ? 50 : 20;
  const totalPoints = basePoints + bonusPoints;

  try {
    const existing = await localGame.entities.TeamRanking.filter({ team_key: key });

    if (existing && existing.length > 0) {
      const team = existing[0];
      await localGame.entities.TeamRanking.update(team.id, {
        ranking_points: (team.ranking_points || 0) + totalPoints,
        matches_played: (team.matches_played || 0) + 1,
        wins: (team.wins || 0) + (won ? 1 : 0),
        losses: (team.losses || 0) + (won ? 0 : 1),
      });
    } else {
      const [p1, p2] = [profile, partner].sort((a, b) => a.id.localeCompare(b.id));
      await localGame.entities.TeamRanking.create({
        team_key: key,
        player1_id: p1.id,
        player1_name: p1.sport_name || p1.name,
        player2_id: p2.id,
        player2_name: p2.sport_name || p2.name,
        ranking_points: totalPoints,
        matches_played: 1,
        wins: won ? 1 : 0,
        losses: won ? 0 : 1,
        titles: [],
      });
    }
  } catch (e) { console.error('updateTeamRanking', e); }
}

export async function addTeamTitle(profile, partner, title) {
  if (!profile?.id || !partner?.id) return;

  const key = teamKey(profile.id, partner.id);
  try {
    const existing = await localGame.entities.TeamRanking.filter({ team_key: key });
    if (existing && existing.length > 0) {
      const team = existing[0];
      await localGame.entities.TeamRanking.update(team.id, {
        titles: [...(team.titles || []), title],
      });
    }
  } catch (e) { console.error('addTeamTitle', e); }
}

export async function addTeamRankingPoints(profile, partner, points) {
  if (!profile?.id || !partner?.id) return;
  const key = teamKey(profile.id, partner.id);
  try {
    const existing = await localGame.entities.TeamRanking.filter({ team_key: key });
    if (existing && existing.length > 0) {
      const team = existing[0];
      await localGame.entities.TeamRanking.update(team.id, {
        ranking_points: (team.ranking_points || 0) + points,
      });
    } else {
      const [p1, p2] = [profile, partner].sort((a, b) => a.id.localeCompare(b.id));
      await localGame.entities.TeamRanking.create({
        team_key: key,
        player1_id: p1.id,
        player1_name: p1.sport_name || p1.name,
        player2_id: p2.id,
        player2_name: p2.sport_name || p2.name,
        ranking_points: points,
        matches_played: 0,
        wins: 0,
        losses: 0,
        titles: [],
      });
    }
  } catch (e) { console.error('addTeamRankingPoints', e); }
}

// Playthrough 5.22-E, Partes O/X/Y/Z — MATERIALIZAÇÃO IMEDIATA da dupla.
//
// Regra nova: o ranking de uma dupla nasce da soma dos pontos individuais
// ATUAIS dos dois membros. Portanto uma parceria recém-formada não pode
// ficar "Ativa sem ranking · 0 pts" enquanto os indivíduos já têm pontos.
//
// Esta função é o ponto único de materialização/recalc:
//   * resolve os pontos atuais dos dois membros (jogador + atleta);
//   * grava `ranking_points = A + B` (fórmula canônica);
//   * cria a linha com V/D/títulos ZERADOS quando ela ainda não existe
//     (Parte P — histórico da parceria começa na formação; nunca copia
//     vitórias/títulos de parcerias anteriores);
//   * quando a linha já existe, só atualiza os pontos, preservando o
//     histórico real da dupla (V/D/títulos não são tocados).
//
// Idempotente: rodar de novo produz o mesmo `ranking_points`. 0 + 0 => 0,
// que rankForTeamKey já trata como "sem ranking" (Parte Y).
export async function materializeTeamRankingForPair(profile, partner, options = {}) {
  if (!profile?.id || !partner?.id || profile.id === partner.id) return null;
  const key = teamKey(profile.id, partner.id);
  const profilePoints = Number.isFinite(Number(options.profilePoints))
    ? Math.max(0, Number(options.profilePoints))
    : Math.max(0, Number(profile.rank_points ?? profile.ranking_points ?? profile.world_ranking_points) || 0);
  const partnerPoints = Math.max(0, Number(partner.world_ranking_points ?? partner.ranking_points) || 0);
  const points = computeCanonicalTeamRankingPoints(profilePoints, partnerPoints);
  const players = [profile, partner].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  try {
    const rows = (await localGame.entities.TeamRanking.filter({ team_key: key }).catch(() => [])) || [];
    const existing = rows[0];
    if (existing?.id) {
      // Só os pontos mudam — V/D/títulos são histórico da parceria e nunca
      // são recalculados a partir dos indivíduos (Partes P/Q).
      // Playthrough 5.24-B, Parte E — pontos já canônicos: nada a gravar.
      // Ranking.jsx chama isto a cada montagem; o update incondicional
      // custava uma gravação da carreira INTEIRA (stringify + validação +
      // escrita atômica) por visita — ~3s dos 4,7s medidos no Ranking com
      // CPU 4x. O valor resultante é idêntico, então pular é seguro.
      if (Number(existing.ranking_points) === points) return { points, created: false, id: existing.id };
      await localGame.entities.TeamRanking.update(existing.id, { ranking_points: points });
      return { points, created: false, id: existing.id };
    }
    const created = await localGame.entities.TeamRanking.create({
      team_key: key,
      player1_id: players[0].id,
      player1_name: players[0].sport_name || players[0].name,
      player1_country: players[0].country || players[0].nationality || null,
      player2_id: players[1].id,
      player2_name: players[1].sport_name || players[1].name,
      player2_country: players[1].country || players[1].nationality || null,
      ranking_points: points,
      race_points: 0,
      matches_played: 0,
      wins: 0,
      losses: 0,
      titles: [],
      stats_source: 'unavailable',
    });
    return { points, created: true, id: created?.id || null };
  } catch (error) {
    console.error('materializeTeamRankingForPair', error);
    return null;
  }
}

// Playthrough 5.22-G, Partes E/I/J — GARANTIA DA DUPLA ATIVA DO JOGADOR.
//
// Causa raiz do bug 39 + 978 = 0: a linha de TeamRanking da dupla do
// jogador só era criada na FORMAÇÃO (startPartnership) ou na finalização de
// um torneio. Um save cuja parceria nasceu antes da 5.22-E (ou cuja linha
// ficou em 0) não tinha NENHUM caminho de load que a materializasse — o
// reparo legado resolvia apenas membros de AthleteProfile e nunca criava
// linha ausente. Resultado: getTeamRank encontrava a chave errada/ausente e
// a UI mostrava "0 pts · Sem ranking" com os dois membros pontuados.
//
// Esta função resolve a parceria ATIVA (partner_bot_id canônico), recalcula
// A + B com os rolling atuais e faz upsert idempotente — preservando o
// histórico (V/D/títulos) da parceria. É o ponto único de reparo da dupla
// do jogador e roda no load, sem esperar torneio/dia/mês.
export async function ensurePlayerTeamRanking(profile) {
  if (!profile?.id) return null;
  try {
    // Id canônico do parceiro: a parceria ativa manda; `profile.partner_id`
    // é só fallback para saves sem linha de Partnership.
    let partnerId = profile.partner_id || null;
    const partnerships = await localGame.entities.Partnership
      .filter({ profile_id: profile.id, status: 'ativa' }, null, 5).catch(() => []);
    const active = (partnerships || [])[0];
    if (active) partnerId = active.partner_bot_id || active.athlete_b_id || partnerId;
    if (!partnerId) return null;

    const partnerAthlete = await localGame.entities.AthleteProfile.get(partnerId).catch(() => null);
    if (!partnerAthlete?.id) return null;

    // Autoridade individual do jogador: rolling de Circuito (rank_points/
    // ranking_points/world_ranking_points), nunca posição/Race/OVR.
    const playerPoints = Math.max(0, Number(
      profile.rank_points ?? profile.ranking_points ?? profile.world_ranking_points,
    ) || 0);
    return await materializeTeamRankingForPair(profile, partnerAthlete, { profilePoints: playerPoints });
  } catch (error) {
    console.error('ensurePlayerTeamRanking', error);
    return null;
  }
}

// Fase 4 (ranking rolling de 52 semanas), item 1: applyTeamRankingSeasonCarryover
// removido — cortava 20% do ranking da dupla do jogador uma vez por ano,
// sem nenhum registro de intenção de design encontrado (commit "v36" sem
// mensagem descritiva, nenhum comentário, nenhuma menção além de "funciona
// e é idempotente" em docs/BETA_READINESS_PHASE10.md §15). Redundante com
// race_points (que já reseta no ano civil) e, com a janela rolling agora
// no lugar, um segundo mecanismo de decaimento por cima do primeiro. A
// chamada em seasonLifecycle.js:finalizeSeason foi substituída por um
// recálculo de ranking_points como média dos dois totais rolling atuais —
// mesmo padrão que tournamentLifecycle.js e as duplas de IA
// (circuitLifecycle.js:updateTeamRankings) já seguem.

// Playthrough 5.10, Parte L — reparo idempotente para saves JÁ EXISTENTES.
//
// A Parte K corrigiu a ORIGEM (saveFoundation.js forma as duplas depois de
// os atletas terem id), mas um save criado antes disso continua com linhas
// cujos membros são `ranking-bot-NNNN`. Aqui elas são remapeadas pelo único
// vínculo determinístico que já existe no dado: AthleteProfile.bot_id.
//
// Regras (Partes J/L/P): nunca inventa membro, nunca soma pontos de
// duplicatas, nunca apaga linha válida. Uma linha que não resolve os dois
// membros por um mapeamento seguro é apenas MARCADA (fica fora da
// classificação atual, o dado bruto permanece).
export async function repairLegacyTeamRankings() {
  const summary = {
    checked: 0, remapped: 0, keyNormalized: 0, duplicatesMerged: 0, unresolved: 0,
    ghostsRemoved: 0, pointsRecalculated: 0,
  };
  try {
    // Playthrough 5.22-G — o jogador é um PlayerProfile, não um
    // AthleteProfile. Sem carregá-lo, o membro-jogador nunca resolvia e a
    // linha da dupla ativa era pulada (nunca recalculada). Passa a entrar no
    // contexto de resolução abaixo.
    const [rows, athletes, profiles] = await Promise.all([
      localGame.entities.TeamRanking.list(null, 5000).catch(() => []),
      localGame.entities.AthleteProfile.list(null, 5000).catch(() => []),
      localGame.entities.PlayerProfile.list(null, 5).catch(() => []),
    ]);
    const player = (profiles || [])[0] || null;
    const playerId = player?.id || null;
    const playerPoints = Math.max(0, Number(
      player?.rank_points ?? player?.ranking_points ?? player?.world_ranking_points,
    ) || 0);
    const byId = new Set((athletes || []).map((a) => a.id).filter(Boolean));
    const athletesById = new Map((athletes || []).map((a) => [a.id, a]));
    const byBotId = new Map();
    for (const athlete of athletes || []) {
      if (athlete?.bot_id && athlete?.id && !byBotId.has(athlete.bot_id)) byBotId.set(athlete.bot_id, athlete.id);
    }
    const resolveMember = (id) => {
      if (!id) return null;
      if (playerId && id === playerId) return id;
      if (byId.has(id)) return id;
      return byBotId.get(id) || null;
    };

    // Playthrough 5.16, Partes P/Q/R/T — o que faltava para um SAVE ANTIGO.
    //
    // A 5.15 corrigiu a ORIGEM (buildSupplementalTeamRows deixou de parear
    // atletas já comprometidos e passou a gravar pontos canônicos), então
    // todo mundo NOVO nasce limpo. Mas este reparo — o único caminho que
    // toca um save existente — só remapeava ids: nunca removia dupla
    // fantasma e nunca recalculava ponto. Por isso a carreira do playtest
    // continuava com Masters de campo artificial mesmo depois da 5.15: o
    // mundo dela foi criado antes, e nada reparava aquelas linhas.
    //
    // Duas regras novas, ambas idempotentes:
    //
    // 1. FANTASMA (Parte R): uma linha entre dois atletas REAIS que não se
    //    declaram parceiros (`ai_partner_id` mútuo) é uma dupla que nunca
    //    existiu — o mesmo critério que a 5.15 usa para medir ghostRR. Ela
    //    é removida. Duplas curadas (as que se declaram) nunca são tocadas,
    //    e nada que envolva atleta procedural entra nesta regra.
    // 2. PONTO FORA DA AUTORIDADE (Parte T/U — Playthrough 5.22-E): o valor
    //    gravado é substituído pela SOMA canônica dos pontos ATUAIS dos dois
    //    membros (a fórmula vigente desde a 5.22-E; antes era média
    //    geométrica). Quando um membro não resolve,
    //    `resolveTeamRankingMemberPoints` devolve null e a linha fica como
    //    está, em vez de ser zerada por engano. Idempotente: rodar de novo
    //    converge para o mesmo valor.
    const realBotIds = new Set(getRealAthleteRegistry().map((entry) => entry?.id).filter(Boolean));
    const isRealAthlete = (athleteId) => {
      const athlete = athletesById.get(athleteId);
      return Boolean(athlete?.bot_id && realBotIds.has(athlete.bot_id));
    };
    const declaresPartner = (aId, bId) => athletesById.get(aId)?.ai_partner_id === bId;

    const seen = new Map();
    for (const row of rows || []) {
      summary.checked += 1;
      const id1 = resolveMember(row.player1_id);
      const id2 = resolveMember(row.player2_id);
      if (!id1 || !id2 || id1 === id2) { summary.unresolved += 1; continue; }

      if (isRealAthlete(id1) && isRealAthlete(id2)
        && !declaresPartner(id1, id2) && !declaresPartner(id2, id1)) {
        if (row.id) {
          await localGame.entities.TeamRanking.delete(row.id).catch(() => {});
          summary.ghostsRemoved += 1;
        }
        continue;
      }

      const patch = {};
      if (id1 !== row.player1_id || id2 !== row.player2_id) {
        patch.player1_id = id1;
        patch.player2_id = id2;
        summary.remapped += 1;
      }
      const key = canonicalPairId(id1, id2);
      if (row.team_key !== key) { patch.team_key = key; summary.keyNormalized += 1; }

      const previous = seen.get(key);
      if (previous) {
        // Duplicata: mantém a preferida pela MESMA regra da leitura e apaga
        // a outra. Nunca soma — somar era o bug original.
        const winner = dedupeTeamRankingsByCanonicalPair([previous.row, { ...row, ...patch }])[0];
        const loserId = winner.id === previous.row.id ? row.id : previous.row.id;
        if (loserId) {
          await localGame.entities.TeamRanking.delete(loserId).catch(() => {});
          summary.duplicatesMerged += 1;
        }
        seen.set(key, { row: winner, id1, id2 });
        continue;
      }
      seen.set(key, { row: { ...row, ...patch }, id1, id2 });
      if (Object.keys(patch).length && row.id) {
        patch.integrity_status = 'legacy-repaired-v510';
        await localGame.entities.TeamRanking.update(row.id, patch).catch(() => {});
      }
    }

    // Parte T — SEGUNDA passada: ponto de seed inflado volta para a fórmula
    // canônica.
    //
    // Isto acontece depois do dedupe, e não dentro do laço, por um motivo
    // medido: quando uma linha era duplicata, o caminho de fusão fazia
    // `continue` ANTES de gravar o patch, então o recálculo se perdia. Pior,
    // `pickPreferredTeamRankingRow` prefere quem tem MAIS pontos — ou seja,
    // a linha inflada era exatamente a que vencia a fusão e sobrevivia com o
    // valor congelado. O resultado era um reparo não idempotente, que
    // recalculava as mesmas linhas a cada execução sem nunca corrigi-las.
    //
    // Recalcular só os SOBREVIVENTES elimina as duas falhas de uma vez.
    const memberContext = { athletesById, playerId, playerPoints };
    for (const { row, id1, id2 } of seen.values()) {
      const pointsA = resolveTeamRankingMemberPoints(id1, memberContext);
      const pointsB = resolveTeamRankingMemberPoints(id2, memberContext);
      if (pointsA === null || pointsB === null) continue;
      const canonical = computeCanonicalTeamRankingPoints(pointsA, pointsB);
      if (Number(row.ranking_points) === canonical || !row.id) continue;
      await localGame.entities.TeamRanking.update(row.id, {
        ranking_points: canonical,
        integrity_status: 'legacy-repaired-v516',
      }).catch(() => {});
      summary.pointsRecalculated += 1;
    }
  } catch (error) { console.warn('[repairLegacyTeamRankings]', error); }
  return summary;
}

// Playthrough 5.10, Parte U — a aba Duplas numerava pelo ÍNDICE do array
// (`i + 1`) enquanto `rankForTeamKey` (que alimenta "Minha Dupla"/
// PartnerOverview) conta quantas duplas têm ESTRITAMENTE mais pontos. Com
// empates, as duas superfícies mostravam posições diferentes para a MESMA
// dupla (medido: aba #531 vs Minha Dupla #525, ambos com 122 pts).
//
// Autoridade única: ranking de competição padrão — duplas empatadas
// dividem a mesma posição, e a próxima posição pula o bloco empatado
// (1, 2, 2, 4...). É a mesma contagem que rankForTeamKey já fazia.
export function assignTeamRankingPositions(rows = []) {
  let lastPoints = null;
  let lastPosition = 0;
  return rows.map((row, index) => {
    const points = Number(row.ranking_points) || 0;
    if (lastPoints === null || points !== lastPoints) {
      lastPosition = index + 1;
      lastPoints = points;
    }
    return { ...row, ranking_display_position: lastPosition };
  });
}

export async function getTeamRankings(limit = 50) {
  try {
    const rows = await localGame.entities.TeamRanking.list('-ranking_points', Math.max(limit, 600));
    const ordered = dedupeTeamRankingsByCanonicalPair(rows)
      .sort((a, b) => (Number(b.ranking_points) || 0) - (Number(a.ranking_points) || 0));
    return assignTeamRankingPositions(ordered);
  } catch (e) { return []; }
}

// Playthrough 4.6B, itens 1-3 — cálculo compartilhado entre `getTeamRank`
// (dupla do JOGADOR) e `getCanonicalTeamWorldRank` (qualquer dupla, ex.: o
// adversário da campanha do jogador) — mesma fonte (TeamRanking por
// team_key), mesma convenção de "sem ranking" (item 8, comentário abaixo),
// nenhuma fórmula divergente pros dois casos.
// Teto de LEITURA para cálculo de posição. Não é o teto de EXIBIÇÃO (a aba
// Duplas mostra os primeiros 600); precisa cobrir a população inteira de
// duplas, que passa de 900 numa temporada.
const TEAM_RANK_LOOKUP_CAP = 5000;

async function rankForTeamKey(key) {
  // Playthrough 5.11 — antes lia só 600 linhas, o MESMO corte que a UI usa
  // para exibir. Uma dupla legítima fora desse corte não era encontrada e
  // caía no ramo "sem ranking": `points = 0`, `unranked = true`,
  // `displayRank = '—'`, mesmo tendo pontos e partidas reais. Ficou
  // evidente com a média geométrica, que baixa o valor de duplas muito
  // assimétricas (a dupla nova do jogador com parceiro de elite saiu do
  // top-600 e passou a exibir "sem ranking"), mas o defeito é do corte de
  // leitura, não da fórmula. A posição agora é calculada sobre a população
  // inteira; a UI segue exibindo quantas linhas quiser.
  const rankings = await getTeamRankings(TEAM_RANK_LOOKUP_CAP);
  const own = rankings.find(t => t.team_key === key);
  const points = Math.max(0, Number(own?.ranking_points) || 0);
  const rankedCompetitors = rankings.filter(t => t.team_key !== key && Math.max(0, Number(t.ranking_points) || 0) > 0);
  // Playthrough 5.22-E, Partes Y/Z — com a regra da soma, uma dupla com
  // pontos (A+B > 0) tem posição compatível mesmo sem partidas jogadas: o
  // valor vem dos membros. "Sem ranking" passa a significar estritamente
  // "0 + 0 = 0 pontos" (ou linha inexistente). Exigir matches_played > 0
  // esconderia justamente a parceria recém-materializada que a Parte X
  // manda mostrar.
  const unranked = points <= 0;
  // Item 8 — uma dupla SEM ranking (0 pontos, 0 partidas — toda dupla nova do
  // jogador) não tem posição real nenhuma pra reportar. A fórmula antiga
  // ("quantos times com pontos > meus 0 pontos, +1") colapsava pra
  // `rankedCompetitors.length + 1` — com o mundo seedado a
  // TEAM_RANKING_TARGET (rankingPopulation.js) times, sempre com
  // ranking_points>=1, isso é SEMPRE o tamanho fixo da população + 1 (ex.:
  // 501), não uma posição de verdade. `rank: 0` segue a MESMA convenção que
  // o early-return acima (`!profile?.id`) já usa pra "sem rank" — e que
  // resolveEntryRank (EntryManager.js) e o restante do jogo já tratam como
  // "sem rank", não como "pior rank possível da população inteira".
  // Playthrough 5.10, Parte U — a posição vem da MESMA autoridade que a aba
  // Duplas usa (assignTeamRankingPositions, aplicada em getTeamRankings),
  // em vez de ser recontada aqui. Antes as duas superfícies discordavam
  // sempre que havia empate de pontos.
  const rank = unranked ? 0 : (Number(own?.ranking_display_position) || 0);
  return { rank, total: rankedCompetitors.length + 1, points, unranked, displayRank: unranked ? '—' : String(rank) };
}

export async function getTeamRank(profile, partner) {
  if (!profile?.id || !partner?.id) return { rank: 0, total: 0, points: 0, unranked: true, displayRank: '—' };
  return rankForTeamKey(teamKey(profile.id, partner.id));
}

// Playthrough 4.6B, itens 1-3 — fonte CANÔNICA do world rank de uma dupla
// qualquer, identificada só por IDs de atleta (nunca nome, seed, slot de
// chave ou fórmula tipo `rank - 8*N`). Usada pro adversário do jogador na
// própria campanha (TournamentModal.jsx/tournamentDraw.js) — os oponentes
// procedurais do catálogo de bots (src/lib/bots.js) quase sempre NÃO fazem
// parte do circuito mundial de duplas canônicas (não têm TeamRanking
// nenhum), e isso é esperado: devolve unranked:true, nunca inventa uma
// posição. Se o adversário sorteado coincidir com uma dupla que realmente
// disputou o circuito (ex.: um atleta real do catálogo, ranking_position
// real), a mesma fonte (TeamRanking por team_key) já resolve certo.
//
// Playthrough 5.26-C, Bloco C — IDENTIDADE antes da chave. Os membros chegam
// como ids de TEMPLATE do catálogo (`player-real-*`/`player-fictional-*`),
// mas a TeamRanking é chaveada pelo id do AthleteProfile do mundo. Para um
// fictício materializado os dois coincidem; para um atleta REAL o mundo usa
// outro id (`athlete-NNN`), e a chave por template nunca encontrava a dupla
// mesmo quando ela existia. Cada membro passa pela MESMA resolução da
// materialização de parceiros (`findMaterializedPartnerAthlete`: id, bot_id
// e, só para reais, nome). Aceita ids ou objetos `{ id, name }` (o roster
// gravado na partida). `source` diz de onde veio a resposta, sem inventar
// posição: 'team-ranking' (dupla canônica com pontos), 'unranked' (dupla sem
// pontos ou inexistente no circuito) ou 'missing-roster' (menos de 2 membros).
async function resolveCanonicalMemberId(member) {
  const template = typeof member === 'string' ? { id: member } : (member || {});
  if (!template.id) return null;
  const athlete = await findMaterializedPartnerAthlete(template).catch(() => null);
  return athlete?.id || template.id;
}

export async function getCanonicalTeamWorldRank(members = []) {
  const list = (members || []).filter((member) => (typeof member === 'string' ? member : member?.id));
  if (list.length < 2) return { rank: 0, total: 0, points: 0, unranked: true, displayRank: '—', source: 'missing-roster', memberIds: [] };
  const ids = await Promise.all(list.slice(0, 2).map(resolveCanonicalMemberId));
  const result = await rankForTeamKey(teamKey(ids[0], ids[1]));
  return { ...result, source: result.unranked ? 'unranked' : 'team-ranking', memberIds: ids };
}

// Playthrough 5.26-C, Bloco C — a regra de zebra num lugar só (antes inline
// em TournamentModal.jsx e copiada no harness). Regra INALTERADA: vitória
// sobre uma dupla com posição canônica MELHOR (número menor) que a da dupla
// do jogador; dupla do jogador sem ranking conta como a pior posição (9999).
// Adversário sem ranking canônico nunca é zebra (4.6B: sem posição real não
// existe comparação) e empate de posição também não.
export function isUpsetResult({ won, teamRank, opponentRank } = {}) {
  if (!won || !opponentRank || opponentRank.unranked) return false;
  const opponent = Number(opponentRank.rank) || 0;
  if (opponent <= 0) return false;
  const own = Number(teamRank?.rank) || 9999;
  return opponent < own;
}

export async function simulateProRankingWeek() {
  // Fase 15: a classificação profissional não recebe mais partidas
  // invisíveis semanais. WorldTourLifecycle concede pontos a partir dos
  // torneios reais do calendário e circuitLifecycle projeta esses pontos na
  // tabela de duplas. Mantemos a exportação apenas para compatibilidade.
  return { skipped: true, reason: 'world-tour-is-canonical' };
}

// Runs a single-elimination bracket using the match engine — stronger teams
// advance naturally via the sigmoid win probability, so favorites win often.
function teamName(team) {
  return `${team?.[0]?.name || 'Jogador 1'} & ${team?.[1]?.name || 'Jogador 2'}`;
}

function syntheticScore(result, roundIndex, matchIndex) {
  const seed = Math.abs((result?.setsA || 0) * 31 + (result?.setsB || 0) * 17 + roundIndex * 13 + matchIndex * 7);
  const close = seed % 3 === 0;
  return result?.winner === 'A'
    ? (close ? '6-4 4-6 6-3' : '6-3 6-4')
    : (close ? '4-6 6-4 3-6' : '3-6 4-6');
}

function simulateTournamentBracket(teams) {
  let bracket = [...teams].sort(() => Math.random() - 0.5);
  let runnerUp = null;
  const history = [];
  let roundIndex = 0;

  while (bracket.length > 1) {
    const nextRound = [];
    const pairs = Math.floor(bracket.length / 2);
    const hasBye = bracket.length % 2 === 1;
    const roundMatches = [];

    for (let i = 0; i < pairs; i++) {
      const teamA = bracket[i * 2];
      const teamB = bracket[i * 2 + 1];
      const result = simulateMatch(teamA, teamB);
      const winner = result.winner === 'A' ? teamA : teamB;
      const loser = result.winner === 'A' ? teamB : teamA;
      nextRound.push(winner);
      if (bracket.length === 2) runnerUp = loser;

      roundMatches.push({
        team_a: teamName(teamA),
        team_b: teamName(teamB),
        winner: teamName(winner),
        score: syntheticScore(result, roundIndex, i),
      });
    }
    if (hasBye) nextRound.push(bracket[bracket.length - 1]);

    const roundName = bracket.length === 2
      ? 'Final'
      : bracket.length === 4
        ? 'Semifinais'
        : bracket.length === 8
          ? 'Quartas de final'
          : `Rodada de ${bracket.length}`;
    history.push({ round: roundName, matches: roundMatches });
    bracket = nextRound;
    roundIndex += 1;
  }
  return { champion: bracket[0], runnerUp: runnerUp || bracket[0], history };
}

// Simulates champions for past tournaments the player didn't win.
// Updates tournament records, team rankings, and feeds results to the journal.
const TIER_MULT = { Silver:0.28, Gold:0.65, Platinum:1.15, Masters:2.1, Elite:3.2, Crown:5 };
const CHAMP_RANK_POINTS = 200;
const RUNNER_RANK_POINTS = 85;

export async function simulatePastTournaments(careerDate) {
  if (!careerDate) return;
  const currentMonth = new Date(careerDate + 'T00:00:00').getMonth() + 1;

  try {
    const [tournaments, registrations, calendarEvents] = await Promise.all([
      localGame.entities.Tournament.list('-created_date', 200),
      localGame.entities.TournamentRegistration.list('-created_date', 300).catch(() => []),
      localGame.entities.CalendarEvent.filter({ status: 'scheduled', event_type: 'tournament' }).catch(() => []),
    ]);
    const activeTournamentIds = new Set([
      ...(registrations || []).filter((item) => ['pending', 'confirmed'].includes(item.status)).map((item) => item.tournament_id),
      ...(calendarEvents || []).filter((event) => {
        const status = event.metadata?.tournament_run?.status;
        return !status || !['eliminated', 'champion', 'finished'].includes(status);
      }).map((event) => event.related_id),
    ].filter(Boolean));
    const needsSimulation = tournaments.filter(t => {
      if (activeTournamentIds.has(t.id)) return false;
      // Eventos do circuito mundial pertencem exclusivamente ao
      // WorldTourLifecycle. O simulador legado fica restrito a calendários
      // antigos sem essa marca e não pode sobrescrever campeão nem pontos.
      if (t.world_tour_event) return false;
      if (t.champion) return false;
      if (t.status === 'finalizado') return false;
      // A data canônica vence o fallback legado de mês. Sem isso, uma
      // edição de janeiro do ano seguinte podia ser simulada em junho.
      if (t.start_date) return t.start_date < careerDate;
      if ((t.month || 0) < currentMonth) return true;
      return false;
    });

    if (needsSimulation.length === 0) return;

    // Antes, cada torneio pendente disparava seu próprio Tournament.update
    // MAIS dois addTeamRankingPoints e um addTeamTitle individuais (cada um
    // com sua própria leitura + escrita) — em meses com vários torneios
    // acumulados isso chegava a dezenas de escritas completas do save.
    // Acumula tudo (torneios e patches de dupla) e grava em no máximo duas
    // transações ao final.
    const existingTeams = (await localGame.entities.TeamRanking.list('-ranking_points', 500)) || [];
    const teamsByKey = new Map(existingTeams.map((team) => [team.team_key, team]));
    const teamPatches = new Map(); // team_key -> operação acumulada

    const applyTeamPoints = (teamA, teamB, points) => {
      if (!teamA?.id || !teamB?.id) return;
      const key = teamKey(teamA.id, teamB.id);
      const pending = teamPatches.get(key);
      if (pending) {
        pending.data.ranking_points = (pending.data.ranking_points || 0) + points;
        return;
      }
      const existing = teamsByKey.get(key);
      if (existing?.id) {
        teamPatches.set(key, { type: 'update', entityName: 'TeamRanking', id: existing.id, data: { ranking_points: (existing.ranking_points || 0) + points } });
      } else {
        const [p1, p2] = [teamA, teamB].sort((a, b) => a.id.localeCompare(b.id));
        teamPatches.set(key, {
          type: 'create',
          entityName: 'TeamRanking',
          data: {
            team_key: key, player1_id: p1.id, player1_name: p1.sport_name || p1.name,
            player2_id: p2.id, player2_name: p2.sport_name || p2.name,
            ranking_points: points, matches_played: 0, wins: 0, losses: 0, titles: [],
          },
        });
      }
    };
    const applyTeamTitle = (teamA, teamB, title) => {
      if (!teamA?.id || !teamB?.id) return;
      const key = teamKey(teamA.id, teamB.id);
      const pending = teamPatches.get(key);
      if (pending) {
        pending.data.titles = [...(pending.data.titles || teamsByKey.get(key)?.titles || []), title];
        return;
      }
      const existing = teamsByKey.get(key);
      if (existing?.id) {
        teamPatches.set(key, { type: 'update', entityName: 'TeamRanking', id: existing.id, data: { titles: [...(existing.titles || []), title] } });
      }
    };

    const tournamentUpdates = [];
    for (const t of needsSimulation) {
      const { champion: champTeam, runnerUp, history } = simulateTournamentBracket(PRO_TEAMS);

      const champName = `${champTeam[0].name} & ${champTeam[1].name}`;
      const mult = TIER_MULT[t.tier] || 1;

      tournamentUpdates.push({
        id: t.id,
        status: 'finalizado',
        champion: champName,
        runner_up: teamName(runnerUp),
        bracket_history: history,
        current_phase: 'concluido',
      });

      applyTeamPoints(champTeam[0], champTeam[1], Math.round(CHAMP_RANK_POINTS * mult));
      applyTeamPoints(runnerUp[0], runnerUp[1], Math.round(RUNNER_RANK_POINTS * mult));
      applyTeamTitle(champTeam[0], champTeam[1], t.name);
    }
    if (tournamentUpdates.length) {
      await localGame.entities.Tournament.bulkUpdate(tournamentUpdates);
    }
    if (teamPatches.size) {
      await localGame.batch([...teamPatches.values()]);
    }
  } catch (e) { console.error('simulatePastTournaments', e); }
}
