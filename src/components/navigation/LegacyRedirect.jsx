import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Playthrough 5.20, Parte AH — REDIRECT DE ROTA LEGADA.
 *
 * A Parte AH é explícita: não apagar rota sem redirect, e não quebrar
 * notificações antigas, saves, deep links nem links internos. Um
 * `<Navigate to="/novo?tab=x">` cru resolveria o caminho, mas DESCARTARIA os
 * query params do link original — e várias telas do jogo são abertas com
 * parâmetro (`?offer=`, `?view=`, `?tournament=`), inclusive por notificação.
 * Um deep link de proposta que caísse na aba certa sem o id da proposta
 * chegaria "no lugar certo e sem contexto", que é o defeito que a 5.19 acabou
 * de corrigir noutra superfície.
 *
 * Então: preserva tudo o que veio, acrescenta a aba de destino, e só
 * sobrescreve a aba se o link original não trouxer uma.
 */
export default function LegacyRedirect({ to, tab = null, paramName = 'tab' }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const legacyPressTabs = new Set(['interviews', 'journalists', 'feed']);
  const currentTab = params.get(paramName);

  if (currentTab && legacyPressTabs.has(currentTab)) {
    params.set(paramName, 'press');
  } else if (tab && !currentTab) {
    params.set(paramName, tab);
  }

  const query = params.toString();
  return <Navigate to={`${to}${query ? `?${query}` : ''}${location.hash || ''}`} replace />;
}
