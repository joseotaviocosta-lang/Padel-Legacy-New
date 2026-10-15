// Playthrough 5.17, Partes B/C — AUTORIDADE DA DUPLA REGISTRADA.
//
// Bug P0 reproduzido no playtest: o jogador se inscreveu em um torneio com
// Pedro Teixeira, a parceria terminou antes do evento, e a chave passou a
// mostrar "<jogador> & Parceiro" — com o parceiro sumindo durante a partida.
//
// Causa medida (não presumida): TODO o caminho do torneio do jogador
// resolvia a dupla DINAMICAMENTE, a partir de `profile.partner_id`:
//   - career.js:getPartnerBot -> null assim que partner_id é limpo;
//   - tournamentLifecycle.js:146 -> `partner?.name || 'Parceiro'`;
//   - TournamentModal.jsx:158 -> mesmo resolver, para chave e partida;
//   - tournamentLifecycle.js:373/470/476 -> sem partner, o settlement não
//     monta rankingKey, não credita race_points do parceiro e não grava
//     linha de TeamRanking.
// Ou seja: o "Parceiro" genérico era a ponta visível de uma perda de
// identidade que também zerava o crédito competitivo do evento.
//
// O dado, porém, NUNCA se perdeu: `TournamentRegistration.partner_id` é
// gravado na inscrição (tournamentRegistration.js:316) e o CalendarEvent
// carrega `metadata.partner_id`. O que faltava era uma autoridade que
// dissesse "para ESTE torneio, a dupla é a que se inscreveu" — e não "a
// dupla que existe hoje".
//
// Este módulo é essa autoridade. Regra: um compromisso já assumido tem
// roster próprio, imutável. A parceria atual só responde por torneios
// ainda não assumidos.

/**
 * ID do parceiro com quem o jogador REALMENTE se inscreveu neste torneio.
 * Puro: não toca em storage, para poder ser testado e reusado nos dois
 * consumidores (UI e settlement) sem duplicar lógica.
 */
export function resolveCommittedPartnerId(tournamentId, {
  registrations = [], calendarEvents = [], fallbackPartnerId = null,
} = {}) {
  if (!tournamentId) return fallbackPartnerId || null;

  const registration = (registrations || []).find((row) => (
    row && row.tournament_id === tournamentId
    && !['cancelled', 'cancelado', 'withdrawn'].includes(String(row.status || '').toLowerCase())
  ));
  if (registration?.partner_id) return registration.partner_id;

  const event = (calendarEvents || []).find((row) => (
    row && row.event_type === 'tournament' && row.related_id === tournamentId
  ));
  if (event?.metadata?.partner_id) return event.metadata.partner_id;

  return fallbackPartnerId || null;
}

/**
 * Um compromisso é "assumido" quando existe inscrição confirmada e o evento
 * ainda não terminou para o jogador. É o conjunto que a Parte C protege.
 */
export function findCommittedTournaments({
  registrations = [], tournaments = [], careerDate = null, partnerId = null,
} = {}) {
  const byId = new Map((tournaments || []).filter((t) => t?.id).map((t) => [t.id, t]));
  const today = careerDate ? String(careerDate).slice(0, 10) : null;

  return (registrations || [])
    .filter((row) => {
      if (!row?.tournament_id) return false;
      const status = String(row.status || '').toLowerCase();
      if (['cancelled', 'cancelado', 'withdrawn', 'completed', 'concluido'].includes(status)) return false;
      // Só conta como compromisso DESTA parceria.
      if (partnerId && row.partner_id && row.partner_id !== partnerId) return false;
      const tournament = byId.get(row.tournament_id);
      if (!tournament) return false;
      const end = String(tournament.end_date || tournament.start_date || '').slice(0, 10);
      if (!end) return false;
      // Já terminou: não é mais compromisso pendente.
      return !today || end >= today;
    })
    .map((row) => {
      const tournament = byId.get(row.tournament_id);
      return {
        registrationId: row.id,
        tournamentId: row.tournament_id,
        name: tournament.name,
        startDate: String(tournament.start_date || '').slice(0, 10),
        endDate: String(tournament.end_date || tournament.start_date || '').slice(0, 10),
      };
    })
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}

/**
 * Data real de separação (Parte C).
 *
 * Sem compromisso pendente, a parceria termina na data nominal do contrato —
 * nada é prolongado. Com compromisso, ela termina depois do ÚLTIMO já
 * assumido: a extensão existe para honrar o que a dupla assinou junto, não
 * para esticar o contrato.
 */
export function resolveScheduledSeparationDate(originalEndDate, commitments = []) {
  const original = originalEndDate ? String(originalEndDate).slice(0, 10) : null;
  if (!commitments.length) return { date: original, extended: false, until: null };
  const last = commitments.reduce((latest, item) => (
    item.endDate > latest.endDate ? item : latest
  ), commitments[0]);
  if (!original || last.endDate <= original) return { date: original, extended: false, until: null };
  return { date: last.endDate, extended: true, until: last };
}

/**
 * A extensão competitiva NÃO reabre o mercado: depois da data nominal, a
 * dupla honra o que já assumiu e nada mais. Sem isto, a extensão viraria uma
 * renovação silenciosa e infinita (explicitamente proibido na Parte C).
 */
/**
 * Resolve o PARCEIRO REGISTRADO de um torneio em um objeto utilizável
 * (nome/OVR/id), independentemente de a parceria ainda existir.
 *
 * Ordem: AthleteProfile por id -> AthleteProfile por bot_id -> catálogo de
 * bots -> parceiro vivo. Só cai no parceiro vivo quando não há compromisso
 * registrado; nunca devolve "Parceiro" genérico para um evento já assumido.
 */
export async function resolveCommittedPartnerAthlete({
  profile, tournamentId, registrations = null, calendarEvents = [], localGameClient = null,
} = {}) {
  const { localGame } = localGameClient
    ? { localGame: localGameClient }
    : await import('@/api/localGameClient.js');
  const { getPartnerBot } = await import('@/lib/career');

  let rows = registrations;
  if (!rows && profile?.id) {
    rows = await localGame.entities.TournamentRegistration
      .filter({ profile_id: profile.id }).catch(() => []);
  }

  const partnerId = resolveCommittedPartnerId(tournamentId, {
    registrations: rows || [],
    calendarEvents,
    fallbackPartnerId: profile?.partner_id || null,
  });
  if (!partnerId) return getPartnerBot(profile);

  const direct = await localGame.entities.AthleteProfile.get(partnerId).catch(() => null);
  if (direct) return direct;

  const byBotId = await localGame.entities.AthleteProfile
    .filter({ bot_id: partnerId }).catch(() => []);
  if (byBotId?.[0]) return byBotId[0];

  // Último recurso antes do parceiro vivo: o catálogo estático de bots, que
  // é de onde `getPartnerBot` leria de qualquer forma.
  const fromCatalog = getPartnerBot({ partner_id: partnerId });
  if (fromCatalog) return fromCatalog;

  return getPartnerBot(profile);
}

// Playthrough 5.27-J — AUTORIDADE ÚNICA de inscrição nova com a dupla atual.
//
// Achado: esta regra existia (5.17) mas não era chamada por NENHUM caminho de
// inscrição, e não cobria `encerra_apos_compromisso` (o estado em que a dupla
// só existe para cumprir compromissos). Resultado medido: a dupla com saída
// decidida seguia se inscrevendo, cada inscrição nova virava compromisso e o
// fim da parceria era empurrado de novo (limbos de 155–330 dias).
//
// Regra canônica (avaliada ANTES de qualquer escrita, por
// tournamentRegistration.evaluateTournamentRegistration):
//   A. parceria ativa sem saída decidida → permitido (demais regras decidem);
//      inclui contrato vencido em carência (`vencido`, renovação disponível) —
//      vencer a data não é decisão de saída;
//   B. saída decidida (`nao_renovara`, `encerrar_ao_final`): até a data nominal
//      a dupla segue "normalmente" (contrato 5.17 e mensagem do jogo), mas
//      nenhuma inscrição nova pode terminar depois da data nominal — seria um
//      compromisso novo estendendo a parceria;
//   C. `encerra_apos_compromisso` (data nominal passou; a dupla só cumpre o
//      que já assumiu) → nenhuma inscrição nova;
//   D. parceria encerrada → nenhuma inscrição nova com ela.
// Compromissos anteriores nunca são tocados aqui (roster imutável).
export const PARTNERSHIP_EXIT_STATUSES = Object.freeze(['nao_renovara', 'encerrar_ao_final', 'encerra_apos_compromisso']);
export const PARTNERSHIP_REGISTRATION_BLOCK = Object.freeze({ EXIT_PENDING: 'PARTNERSHIP_EXIT_PENDING', INACTIVE: 'PARTNERSHIP_INACTIVE' });

export function evaluatePartnershipRegistrationAuthority(partnership, { careerDate = null, tournament = null } = {}) {
  // Sem linha de Partnership (saves antigos com parceiro só no perfil): esta
  // autoridade não tem o que decidir; as regras de parceiro disponível decidem.
  if (!partnership) return { allowed: true, code: null, exitDecided: false };
  const status = String(partnership.contract_status || '');
  if (partnership.status && partnership.status !== 'ativa') {
    return { allowed: false, code: PARTNERSHIP_REGISTRATION_BLOCK.INACTIVE, exitDecided: true, reason: 'Esta parceria já foi encerrada.' };
  }
  if (!PARTNERSHIP_EXIT_STATUSES.includes(status)) return { allowed: true, code: null, exitDecided: false };
  const today = String(careerDate || '').slice(0, 10);
  const nominalEnd = String(partnership.contract_end_date || partnership.scheduled_end_date || '').slice(0, 10);
  const block = (reason) => ({ allowed: false, code: PARTNERSHIP_REGISTRATION_BLOCK.EXIT_PENDING, exitDecided: true, exitDecidedAt: partnership.exit_decided_at || null, nominalEnd: nominalEnd || null, reason });
  if (status === 'encerra_apos_compromisso') return block('A separação já foi decidida: a dupla só cumpre os torneios já assumidos.');
  if (nominalEnd && today && today >= nominalEnd) return block('O contrato chegou ao fim e a separação já foi decidida.');
  const tournamentEnd = tournament ? String(tournament.end_date || tournament.start_date || '').slice(0, 10) : '';
  if (nominalEnd && tournamentEnd && tournamentEnd > nominalEnd) return block(`A separação está marcada para ${nominalEnd}; este torneio terminaria depois disso.`);
  return { allowed: true, code: null, exitDecided: true, exitDecidedAt: partnership.exit_decided_at || null, nominalEnd: nominalEnd || null };
}

/** Atalho booleano (assinatura da 5.17 preservada; `tournament` opcional). */
export function canRegisterNewTournamentWithPartnership(partnership, careerDate, tournament = null) {
  if (!partnership) return false;
  return evaluatePartnershipRegistrationAuthority(partnership, { careerDate, tournament }).allowed;
}
