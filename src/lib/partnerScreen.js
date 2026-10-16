// Fase 5.31 — apresentação da Dupla (Minha dupla / Contrato / Mercado).
//
// Funções PURAS de exibição. Nenhuma regra de parceria nova: o estado do
// contrato vem de `getContractDecisionState` (partnerLifecycle.js, passado
// pelo chamador) e dos campos que o próprio lifecycle grava
// (`contract_status`, `renewal_available`, `contract_end_date`). "Perto de
// vencer" é o `renovacao_proxima` que o lifecycle marca a 15 dias do fim;
// aqui não se calcula janela nenhuma.

const DAY_MS = 86400000;

export function daysUntilIso(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

export function shortDateBr(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** "47 dias restantes" / "último dia" / "venceu há 3 dias". */
export function remainingLabel(days) {
  if (days == null) return null;
  if (days > 1) return `${days} dias restantes`;
  if (days === 1) return '1 dia restante';
  if (days === 0) return 'último dia';
  return `venceu há ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`;
}

/**
 * Estado do contrato da dupla em linguagem de jogo.
 *
 * @param {object} input
 * @param {object|null} input.partnership Parceria ativa (ou null).
 * @param {string} input.careerDate Data da carreira.
 * @param {string} input.decisionState Resultado de getContractDecisionState(partnership).
 * @param {Array<object>} [input.commitments] findCommittedTournaments (para a separação pendente).
 * @param {string|null} [input.separationDate] resolveScheduledSeparationDate (quando estende).
 */
export function buildPartnerContractStatus({ partnership = null, careerDate = null, decisionState = null, commitments = [], separationDate = null } = {}) {
  if (!partnership) {
    return { key: 'none', label: 'Sem parceiro', tone: 'warning', endDate: null, daysLeft: null, remaining: null, until: null, line: 'Nenhum contrato ativo' };
  }
  const endDate = partnership.contract_end_date || partnership.scheduled_end_date || null;
  const status = String(partnership.contract_status || 'ativo');
  let key = 'active'; let label = 'Contrato ativo'; let tone = 'success';
  let effectiveEnd = endDate;

  if (decisionState === 'ENDING_AFTER_COMMITMENTS') {
    key = 'ending_after_commitments'; label = 'Encerra após compromissos'; tone = 'warning';
    if (separationDate) effectiveEnd = separationDate;
  } else if (decisionState === 'ENDING_AT_EXPIRY') {
    key = status === 'nao_renovara' ? 'renewal_refused' : 'ending_at_expiry';
    label = status === 'nao_renovara' ? 'Parceiro não vai renovar' : 'Encerra no fim do contrato';
    tone = 'warning';
  } else if (decisionState === 'ENDED') {
    key = 'ended'; label = 'Parceria encerrada'; tone = 'neutral';
  } else if (status === 'vencido') {
    key = 'renewal_needed'; label = 'Renovação necessária'; tone = 'danger';
  } else if (status === 'renovacao_proxima' || partnership.renewal_available) {
    key = 'expiring'; label = 'Perto de vencer'; tone = 'warning';
  } else if (decisionState === 'RENEWED') {
    key = 'renewed'; label = 'Contrato renovado'; tone = 'success';
  }

  const daysLeft = daysUntilIso(careerDate, effectiveEnd);
  const remaining = remainingLabel(daysLeft);
  const until = shortDateBr(effectiveEnd);
  // Uma linha só: "47 dias restantes · até 03/03/2026" (nunca data + dias +
  // status em três blocos).
  const line = [remaining, until ? `até ${until}` : null].filter(Boolean).join(' · ') || 'Sem data de término';
  return { key, label, tone, endDate: effectiveEnd, daysLeft, remaining, until, line, commitmentsCount: (commitments || []).length };
}

/**
 * O ÚNICO alerta contextual da tela da dupla (máx. 1 por tela), escolhido
 * por gravidade. Devolve null quando não há nada que mereça destaque.
 */
export function selectPartnerAlert({ contract = null, partnerName = 'seu parceiro', commitments = [], switchCount = 0, instability = null, conflicts = [] } = {}) {
  const key = contract?.key;
  if (key === 'ending_after_commitments') {
    return { id: 'separation-pending', tone: 'warning', title: 'Separação após compromissos', text: `A parceria esportiva com ${partnerName} segue até o último torneio já assumido${contract.until ? ` (até ${contract.until})` : ''}.`, commitments };
  }
  if (key === 'renewal_needed') return { id: 'renewal-needed', tone: 'danger', title: 'Renovação necessária', text: 'O contrato venceu. Renove dentro da carência para não perder a dupla.' };
  if (key === 'renewal_refused') return { id: 'renewal-refused', tone: 'warning', title: 'Renovação recusada', text: `${partnerName} decidiu encerrar a dupla ao fim do contrato.` };
  if (key === 'ending_at_expiry') return { id: 'ending', tone: 'warning', title: 'Encerramento programado', text: 'A dupla segue ativa até o fim do contrato, sem renovação automática.' };
  if (key === 'expiring') return { id: 'expiring', tone: 'warning', title: 'Contrato perto do fim', text: `${contract.line}. Decida se renova antes do vencimento.` };
  if (switchCount >= 2 && instability) return { id: 'instability', tone: 'warning', title: instability.label, text: instability.desc };
  const open = (conflicts || []).filter((item) => !item?.resolved);
  if (open.length) return { id: 'conflict', tone: 'warning', title: 'Conflito na dupla', text: open[0].title };
  return null;
}

/**
 * Ação principal da Visão geral, conforme o estado (no máximo 1 primária).
 * `target` é uma aba/filtro do próprio PartnerHub.
 */
export function selectPartnerPrimaryAction({ contract = null, pendingOffers = 0 } = {}) {
  const key = contract?.key || 'none';
  if (key === 'none') {
    return pendingOffers > 0
      ? { label: `Analisar propostas (${pendingOffers})`, target: { tab: 'market', filter: 'received' } }
      : { label: 'Buscar parceiro', target: { tab: 'market', filter: 'search' } };
  }
  if (key === 'renewal_needed' || key === 'expiring') return { label: 'Renovar parceria', target: { tab: 'contract' } };
  if (key === 'ending_after_commitments' || key === 'ending_at_expiry' || key === 'renewal_refused') {
    return { label: 'Buscar próximo parceiro', target: { tab: 'market', filter: 'search' } };
  }
  return null;
}
