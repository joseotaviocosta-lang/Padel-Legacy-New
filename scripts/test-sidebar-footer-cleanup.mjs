// Hotfix UI Shell — Remover itens redundantes do rodapé da sidebar
// (docs/HOTFIX_SIDEBAR_FOOTER_CLEANUP.md).
//
// Puramente estrutural: prova que "Gerenciar carreiras" e "Sair da conta"
// saíram do rodapé da sidebar (desktop) e do drawer (mobile) em
// AppLayout.jsx, que nenhum wrapper/footer/separador órfão ficou pra trás,
// que a rota /careers e a página CareerManager continuam intactas, e que o
// atalho de carreiras da FloatingUtilityRail (lado direito) continua
// exatamente funcional — mesmo handler (openCareerManager), nunca tocado.
import { readFileSync, existsSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const appLayout = readFileSync('src/components/AppLayout.jsx', 'utf8');
const app = readFileSync('src/App.jsx', 'utf8');
const rail = readFileSync('src/components/system/FloatingUtilityRail.jsx', 'utf8');

// ── Sidebar/drawer não renderizam mais os dois itens ──────────────────────
gate('AppLayout.jsx não renderiza mais "Gerenciar carreiras"', !appLayout.includes('Gerenciar carreiras'));
gate('AppLayout.jsx não renderiza mais "Sair da conta" (não importa mais LogoutButton)', !appLayout.includes('Sair da conta') && !/import LogoutButton/.test(appLayout));
gate('Import do ícone BriefcaseBusiness foi removido (ficava só nos 2 botões removidos)', !/BriefcaseBusiness/.test(appLayout));

// ── Nenhum footer/wrapper órfão ────────────────────────────────────────────
gate('Footer do drawer mobile (div com border-t + os 2 botões) foi removido por completo, não deixado vazio', !/space-y-2 border-t border-border\/50 p-3/.test(appLayout));
gate('Footer da sidebar desktop (div com border-t + os 2 botões) foi removido por completo, não deixado vazio', !/space-y-1 border-t border-border\/40 p-2\.5/.test(appLayout));

// ── O <nav> de cada shell aproveita o espaço liberado (flex-1, sem sibling reservando altura) ──
gate('<nav> do drawer mobile continua flex-1 (ocupa o espaço todo, sem footer reservando altura)', /scrollbar-premium flex-1 overflow-y-auto p-3/.test(appLayout));
gate('<nav> da sidebar desktop continua flex-1 (ocupa o espaço todo, sem footer reservando altura)', /scrollbar-none flex-1 overflow-y-auto px-2\.5 py-4/.test(appLayout));
gate('<nav> da sidebar desktop é o último filho de <aside> (nada depois dele reservando espaço)', /<\/nav>\s*<\/aside>/.test(appLayout));
gate('<nav> do drawer mobile é o último filho de <motion.aside> (nada depois dele reservando espaço)', /<\/nav>\s*<\/motion\.aside>/.test(appLayout));

// ── Rota de gerenciamento continua registrada e intacta ────────────────────
gate('Rota /careers continua registrada em App.jsx', /<Route path="\/careers" element=\{<CareerManager \/>\}/.test(app));
gate('Página CareerManager (componente da rota) continua existindo como arquivo', existsSync('src/pages/CareerManager.jsx') || existsSync('src/careers/CareerManager.jsx'));

// ── Atalho de carreiras da utility rail (lado direito) — intocado ────────
gate('FloatingUtilityRail continua com o botão de carreiras (aria-label "Gerenciar carreiras")', /aria-label="Gerenciar carreiras"/.test(rail));
gate('Botão da rail continua chamando onOpenCareers (prop, não uma cópia local)', /onClick=\{onOpenCareers\}/.test(rail));
gate('AppLayout.jsx ainda define openCareerManager (mesma função, não removida)', /async function openCareerManager\(\)/.test(appLayout));
gate('AppLayout.jsx ainda passa openCareerManager pra FloatingUtilityRail — mesmo handler, nunca duplicado', /<FloatingUtilityRail onOpenCareers=\{openCareerManager\}/.test(appLayout));
gate('openCareerManager continua fechando a carreira ativa e navegando pra /careers (comportamento intocado)', /await careerManager\.close\(\)/.test(appLayout) && /window\.location\.href = '\/careers'/.test(appLayout));

// ── LogoutButton (o componente em si) não foi deletado — só a chamada daqui saiu ──
gate('Componente LogoutButton.jsx continua existindo (usado em outro lugar, fora de escopo remover)', existsSync('src/components/LogoutButton.jsx'));
const playerProfile = readFileSync('src/pages/PlayerProfile.jsx', 'utf8');
gate('LogoutButton continua usado em PlayerProfile.jsx (prova que só a chamada da sidebar saiu, não o componente)', /LogoutButton/.test(playerProfile));

console.log(`\n${gates} gates executados, todos PASS — Limpeza do rodapé da sidebar (Hotfix UI Shell).`);
