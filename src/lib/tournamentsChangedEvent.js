// Hotfix 5.30-B — aviso de "o calendário de torneios do jogador mudou".
//
// Módulo sem imports de propósito: é chamado por quem GRAVA torneios ou
// inscrições (career.js, tournamentRegistration.js) e ouvido pelo header,
// sem criar ciclo de import entre eles. O header só busca o calendário quando
// o dia ou o jogador mudam; sem este aviso ele continuava com a lista de
// antes de a Pré-Temporada existir (criada só quando Torneios reconcilia o
// calendário) e anunciava o torneio seguinte.
export const TOURNAMENTS_CHANGED_EVENT = 'padel:tournaments-changed';

export function notifyTournamentsChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(TOURNAMENTS_CHANGED_EVENT));
}
