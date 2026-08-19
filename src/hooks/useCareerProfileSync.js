import { useEffect } from 'react';

// Mobile M3.7.2 (docs/MOBILE_M3_7_2_MATCH_DAY_REFRESH.md): páginas com seu
// próprio `profile` local (useState, buscado uma vez no mount) ficavam
// desatualizadas depois de um avanço de dia disparado em OUTRO lugar do
// app (o atalho global "Avançar dia" em CareerDayControl.jsx) — só
// atualizavam ao sair e voltar para a rota. `dayAdvanceCoordinator.js` já
// transmite `padel:profile-updated` de forma confiável após cada commit
// bem-sucedido (`broadcastProfileUpdate`, com `detail.profile` sempre
// preenchido); este hook só assina esse sinal já existente — mesmo padrão
// já usado em CareerHub.jsx/CalendarPage.jsx/Tournaments.jsx — para
// qualquer outra página que precise do mesmo comportamento, sem duplicar
// o listener em cada arquivo.
//
// A lógica de inscrição vive em `subscribeCareerProfileSync`, separada do
// hook em si, de propósito: sem jsdom neste repositório, é o jeito de
// testar o comportamento real do listener (registrar, disparar, limpar)
// sem precisar montar um componente React.
export function subscribeCareerProfileSync(setProfile) {
  const refreshProfileOnly = (event) => {
    if (event?.detail?.profile) setProfile(event.detail.profile);
  };
  window.addEventListener('padel:profile-updated', refreshProfileOnly);
  window.addEventListener('padel:career-advanced', refreshProfileOnly);
  return () => {
    window.removeEventListener('padel:profile-updated', refreshProfileOnly);
    window.removeEventListener('padel:career-advanced', refreshProfileOnly);
  };
}

export function useCareerProfileSync(setProfile) {
  useEffect(() => subscribeCareerProfileSync(setProfile), [setProfile]);
}
