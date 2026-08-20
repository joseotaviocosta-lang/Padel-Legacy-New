# Hotfix UI Shell — Remover itens redundantes do rodapé da sidebar

Hotfix de limpeza de navegação, exclusivo. Não altera rotas, save,
Achievement Engine, tutorial, Home, ou qualquer outro sistema — só a
apresentação do rodapé da sidebar/drawer em `src/components/AppLayout.jsx`.

## Auditoria

"Gerenciar carreiras" e "Sair da conta" eram hardcoded diretamente em
`AppLayout.jsx`, em DOIS lugares (não vinham de `navigationConfig.js`,
que só define os grupos de navegação principais):

- Rodapé do drawer mobile (`<div className="space-y-2 border-t ... p-3">`,
  dentro do `<motion.aside id="mobile-navigation-drawer">`).
- Rodapé da sidebar desktop (`<div className="space-y-1 border-t ... p-2.5">`,
  dentro do `<aside aria-label="Navegação principal">`), condicional a
  `!sidebarCollapsed` — quando a sidebar já estava recolhida, esse rodapé
  renderizava vazio (só a borda/padding, sem conteúdo visível), um sintoma
  a mais de que o wrapper nunca deveria ter sido reservado incondicionalmente.

"Gerenciar carreiras" chamava `openCareerManager()` (função de módulo,
`AppLayout.jsx:123` — fecha a carreira ativa via `careerManager.close()` e
navega pra `/careers`). "Sair da conta" era `<LogoutButton variant="sidebar">`
— e `LogoutButton`'s `handleLogout` chama `localGame.auth.logout(...)`, cuja
implementação local (`localGameClient.js`) ignora o parâmetro de redirect e
sempre manda pra `/` — sem fluxo de conta/login real neste jogo, a ação era
puramente vestigial, exatamente como o briefing descreveu.

## O que foi removido

Os dois blocos de rodapé inteiros (wrapper `<div>` + botões), nos dois
lugares (mobile e desktop) — nunca deixados vazios. Imports agora não
usados em `AppLayout.jsx` (`BriefcaseBusiness` do lucide-react,
`LogoutButton`) também removidos.

## O que NÃO foi tocado

- `openCareerManager()` continua definida e é a MESMA função passada pra
  `<FloatingUtilityRail onOpenCareers={openCareerManager} />` (lado
  direito) — nunca duplicada, nunca reescrita.
- `FloatingUtilityRail.jsx` (o botão de maleta/carreiras da utility rail)
  não foi tocado — arquivo diferente, prop própria, já funcionava
  independente dos botões da sidebar esquerda.
- A rota `/careers` (`App.jsx:77`, `<Route path="/careers"
  element={<CareerManager />} />`) e a página `src/pages/CareerManager.jsx`
  continuam intactas.
- `LogoutButton.jsx` (o componente em si) não foi deletado — continua
  usado em `src/pages/PlayerProfile.jsx`, fora do escopo deste hotfix.

## Espaço vertical liberado

Os dois `<nav>` (drawer mobile e sidebar desktop) já eram `flex-1` dentro
de containers `flex-col` — ao remover o `<div>` de rodapé irmão que
reservava altura fixa (border-t + padding + conteúdo), o `<nav>` passou a
ocupar automaticamente todo o espaço vertical restante, sem precisar de
nenhuma mudança de CSS adicional (o layout flex já resolve isso sozinho).

## Achado incidental, não corrigido (fora de escopo)

`test:ui-shell` (um teste antigo, "Fase 3") falha por um motivo
completamente não relacionado a este hotfix: espera uma rota `/achievements`
que foi deliberadamente removida numa fase MUITO anterior (unificação
Missões+Conquistas, Tutorial 4.0). Confirmado via `git stash` que a falha é
idêntica com ou sem as mudanças deste hotfix — pré-existente, não corrigida
aqui por estar fora do escopo ("hotfix de limpeza da navegação da sidebar",
não uma auditoria de rotas antigas).

## Testes

`test:sidebar-footer-cleanup` (novo, 18 gates) — prova a remoção dos dois
itens, ausência de wrapper/footer órfão, `<nav>` como último filho de cada
shell, rota/página de gerenciamento intactas, atalho da utility rail
intocado (mesmo handler), e que `LogoutButton.jsx` sobrevive por ser usado
em outro lugar.
