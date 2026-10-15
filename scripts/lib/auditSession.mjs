// Playthrough 5.20-B — SESSAO DE AUDITORIA: cria a carreira uma vez e navega.
import { launch, newPage, goto } from './visualAuditDriver.mjs';

export const PAGES = [
  { id: 'home', label: 'Home', path: '/game' },
  { id: 'athlete', label: 'Meu Atleta', path: '/career/athlete' },
  { id: 'training', label: 'Treinos e Equipamentos', path: '/career/training' },
  { id: 'partners', label: 'Minha Dupla', path: '/partners' },
  { id: 'team', label: 'Equipe', path: '/career/team' },
  { id: 'relations', label: 'Relações', path: '/career/relations' },
  { id: 'tournaments', label: 'Torneios', path: '/tournaments' },
  { id: 'ranking', label: 'Ranking', path: '/ranking' },
  { id: 'circuit', label: 'Central do Circuito', path: '/world/circuit' },
  { id: 'directory', label: 'Atletas e Clubes', path: '/world/directory' },
  { id: 'economy', label: 'Finanças', path: '/game/economy' },
  { id: 'market', label: 'Mercado', path: '/world-market' },
  { id: 'notifications', label: 'Notificações', path: '/communications' },
  { id: 'missions', label: 'Objetivos', path: '/game/missions' },
  { id: 'stats', label: 'Estatísticas', path: '/game/stats' },
];

/** Cria a carreira pela UI e devolve a pagina pronta para navegar. */
export async function openCareer(browser, viewport) {
  const page = await newPage(browser, viewport);
  await goto(page, '/', { settle: 1800 });
  const needsCareer = await page.evaluate(() => /Nova carreira|Criar primeira/i.test(document.body.innerText || ''));
  if (needsCareer) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Nova carreira/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
    await page.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      for (const input of document.querySelectorAll('input')) {
        if (!input.type || ['text', 'search'].includes(input.type)) {
          setter.call(input, 'Auditoria 520B');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^Criar carreira$/i.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 6000));
  }
  // O app mostra um modal de boas-vindas da beta ("feature freeze") que cobre
  // TODA a tela. Sem dispensa-lo, os screenshots fotografam o modal e nao a
  // pagina — descoberto olhando a captura, nao os numeros.
  await dismissOverlays(page);
  return page;
}

export { launch, goto };

/** Fecha modais de boas-vindas/onboarding que cobrem a tela. */
export async function dismissOverlays(page) {
  for (let i = 0; i < 4; i += 1) {
    const closed = await page.evaluate(() => {
      const labels = [/Comecar a testar/i, /Começar a testar/i, /Entendi/i, /Fechar/i, /Pular/i, /Continuar/i];
      const btns = [...document.querySelectorAll("button")];
      for (const re of labels) {
        const b = btns.find((x) => re.test((x.textContent || "").trim()));
        if (b) { b.click(); return true; }
      }
      const x = document.querySelector("[aria-label*=Fechar], [aria-label*=fechar], [aria-label*=Close]");
      if (x) { x.click(); return true; }
      return false;
    }).catch(() => false);
    if (!closed) break;
    await new Promise((r) => setTimeout(r, 700));
  }
}