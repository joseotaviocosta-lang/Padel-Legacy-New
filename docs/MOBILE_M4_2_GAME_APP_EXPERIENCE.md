# M4.2 — Game/App Experience: Auditoria de Fluxos + Mudanças

Fase mobile-first de UX/navegação sobre a base M4.1.3 (aprovada em aparelho
físico). Nenhuma lógica de gameplay/RNG/economia/progressão/ranking/
calendário/torneio/match engine/save/persistência/tutorial foi alterada —
só composição, hierarquia, densidade e atalhos.

## Achado central da auditoria

Antes de qualquer mudança, a auditoria estrutural revelou algo importante:
**boa parte do "sentimento de site" que o briefing descreve já tinha sido
corrigida em fases anteriores** (Fase 4 "Home Redesign", M4 Compact UX,
Starter Coach Flow, M3.7.2). Isso muda o formato certo desta fase: em vez
de reescrever cada página do zero, o trabalho real foi **auditar,
confirmar o que já está certo, e corrigir só os gaps concretos** —
seguindo a mesma regra de "não desfazer o que já funciona" que M4.1.3
estabeleceu.

## Fluxos auditados (Parte 2)

### A. Rotina diária — Home → treino → partida → pendências → avançar dia

**Antes/depois estrutural**: já era enxuto. Home (`CareerHub.jsx`, Fase 4)
já consolida ~20 painéis antigos em 7 regiões com hierarquia clara:
identidade → próximo objetivo/evento → "o que fazer agora" → jornada →
evolução/atenção → mundo/atalhos → ferramentas (recolhidas). Quick Actions
(Treinar/Competir/Agenda) já existiam no cabeçalho da Home como botões de
comando, sem precisar de menu. **Gap real encontrado**: "Competir" era um
link fixo para `/tournaments`, mesmo quando havia uma partida de torneio
disponível agora — corrigido (ver Parte 6/7 abaixo). Toques estruturais
estimados pra "ver o que fazer e agir": Home carregada → 1 toque no CTA
principal — já era baixo antes desta fase.

### B. Torneio — Home → torneio → inscrição → aguardar → rodada → jogar → conclusão

**Este era o gap mais real da auditoria.** `Tournaments.jsx` sempre foi,
estruturalmente, uma página de catálogo primeiro: header com HUD do
próximo evento (bom), depois abas (Calendário/Estatísticas/Circuito/
Notícias), depois — mesmo quando o jogador já estava DISPUTANDO um
torneio — esse torneio aparecia só como mais um `TournamentCard` na grade,
com um selo "Em torneio" discreto dentro do card, competindo visualmente
com todos os outros torneios do mês. Nenhuma tela dizia "você está
disputando X" antes de dizer "aqui está o catálogo inteiro". Corrigido com
Tournament Focus Mode (Parte 10/11 abaixo).

### C. Evolução — Home → treino → atributos → evolução → objetivos

Treinos já tinha sido revisado a fundo em M4.1.3 (botão compacto,
`CompactActionCard`, densidade de card). Evolução/objetivos já são
consolidados na aba Conquistas (Fase 12) e no card "Evolução" da Home.
Nenhum gap estrutural novo encontrado — auditado, não alterado.

### D. Dupla — Home → parceiro → proposta → negociação/aceite → química

`PartnerHub.jsx` já usa `PageHeader` com HUD compacto (status da dupla,
entrosamento, confiança, ofertas) + abas (Propostas/Buscar/Minha dupla/
Inbox/Assessores/Contrato/Histórico), abrindo por padrão na aba
"Propostas" quando não há dupla ativa. Isso já satisfaz boa parte do
"status primeiro, ação primeiro, detalhes depois" pedido pelo briefing.
Auditado — nenhuma mudança estrutural feita nesta fase (ver Fora do
Escopo Restante).

### E. Equipe — Home → treinador → comissão → contratação/gestão

`Coaches.jsx` já mostra o técnico atual (nome/especialidade/tier/salário/
status + Renovar/Ver detalhes) acima de um mercado curado por estágio de
carreira (Starter Coach Flow), com linhas compactas (`CoachCard`, não
cards grandes) — já satisfaz Parte 15 quase por completo. `StaffPanel.jsx`
("Comissão") mostra cada profissional contratado em um card individual
(com sub-componentes já compactos: `QualityBar`/`SummaryRow`/
`EffectPills`) — mais denso que os cards antigos de outras fases, mas
ainda não é a lista "por função" (Fisioterapia/Preparador/Psicologia)
sugerida no briefing. Auditado, não convertido nesta passada (ver Fora do
Escopo Restante — motivo: exigiria enumerar todas as funções do catálogo
cruzando com contratados, mudança estrutural maior que o orçamento desta
fase permite fazer com segurança e teste completo).

### F. Comunicação — Home/notificação → mensagem → decisão → retorno

`Communications.jsx` **já é** um inbox de app: linhas com ícone/remetente/
assunto/preview de 1 linha/tempo/status, não cards grandes (confirmado
lendo o código — cada mensagem é uma `<button>` de linha única com borda
inferior, exatamente o padrão que o briefing pede). Mensagens com decisão
pendente já recebem um `StatusBadge` de prioridade. Auditado — já
compliant, nenhuma mudança necessária.

### G. Calendário — Home → calendário → compromisso → avanço

Semana + avanço de dia já aparecem primeiro (confirmado em M4.1.3).
**Gap real encontrado**: o formulário completo de "Planejar atividade"
(`CalendarPlanner`, 4-5 campos + preview de impacto + lista de planejadas)
renderizava sempre aberto, abaixo da semana — o calendário virava
"formulário grande" por padrão. Corrigido com disclosure (Parte 13 abaixo).

## Mudanças implementadas

### Parte 6/7 — Home: "Competir" com destino inteligente

`CareerHub.jsx`: novo `competeRoute` (useMemo) reaproveita exatamente a
mesma condição/helper que `buildNextEvent` já usa pro card "Próximo
evento" (`buildTournamentPlayRoute`, `activeTournamentEvent`,
`hasTournamentRecoveryAction`) — se há uma partida de torneio disponível
agora, "Competir" vai direto a ela; senão, mantém o destino padrão
`/tournaments`. Nenhuma lógica de estado de torneio nova.

### Parte 10/11 — Torneios: Tournament Focus Mode

Novo componente `TournamentFocusMode` em `Tournaments.jsx`, renderizado
entre `CareerStatusBar` e as abas quando o jogador está disputando um
torneio ativo (`activeRunEvents`) ou já confirmou inscrição no próximo
torneio elegível (`registeredTournaments`/`nextTournament`) — mesmos dados
já computados nesta página, nenhuma consulta nova. Mostra nome do
torneio, rodada/data/adversário (via `match.opponent`, o mesmo campo que
`TournamentRunManager.js` já usa para montar `team_b`) e um botão de ação
(Jogar partida/Preparar/Ver evento) que reaproveita o `handlePlay`/
`setBracketTournament`/`setDetailsTournament` já existentes. Sem rota
nova, sem composição condicional de rota (mesma `/tournaments`, só
apresentação).

### Parte 13 — Calendário: planejamento vira disclosure

`CalendarPage.jsx`: `CalendarPlanner` agora fica dentro de um
`CollapsibleSection` (fechado por padrão) em vez de sempre expandido.
`CalendarPlanner.jsx` perdeu seu cabeçalho próprio (ficaria duplicado com
o do `CollapsibleSection` — Parte 28) e seu wrapper `glass` virou um
`space-y-4` simples (evita card dentro de card, já que `CollapsibleSection`
fornece a superfície). Nenhuma funcionalidade do formulário foi alterada.

### Parte 19/20/21/22 — Hubs: Career/Competir/Gestão compactados

`NavigationHub.jsx` — o componente compartilhado por `/development`
(Carreira), `/team-hub`, `/competitions` (Competir) e `/management`
(Gestão) — trocou seu grid de cards grandes (`Surface` + `ArrowRight`, um
card por item, `sm:grid-cols-2 xl:grid-cols-3`) por uma lista compacta de
linhas (`CompactListItem`, o mesmo primitive já usado em Comunicações/
listas de concluídas). Mesmos itens, mesmas rotas, mesmo ícone por item —
só a densidade visual mudou. Um único componente corrige os 4 hubs de
uma vez.

## Fora do escopo restante (auditado, não alterado — disclosed)

- **Comissão técnica** (`StaffPanel.jsx`, aba "Minha comissão"): cards
  individuais por profissional continuam mais densos que a era pré-M4,
  mas ainda não são a lista "por função" (Vago/Contratado) sugerida no
  briefing. Converter exigiria enumerar `STAFF_ROLE_DEFINITIONS` inteiro
  cruzado com `activeStaff`, uma mudança estrutural maior — não feita
  nesta passada por orçamento de tempo/teste, documentada como pendência
  de UX separada, não uma regressão.
- **Dupla** (`PartnerHub.jsx`): já usa HUD + abas; não redesenhado a fundo
  nesta fase — auditado como já razoavelmente alinhado ao objetivo.
- **Ranking/Atletas** (Parte 17): páginas de consulta, o briefing já diz
  que não precisam imitar as operacionais — auditadas, sem mudança.
- **Hamburger/mobile drawer** (Parte 23): a arquitetura já direciona
  Carreira/Competir da BottomNav para um HUB (`/development`,
  `/competitions`), não para o menu — combinado com os Quick Actions da
  Home, a rotina diária normal (treinar, checar torneio, avançar dia) já
  não depende do hambúrguer. Confirmado, não alterado.
- **FloatingUtilityRail/GuideButton** (Parte 24/25): auditados — M4.1.3 já
  corrigiu posição/z-index/safe-zone; nenhuma mudança de comportamento
  ou remoção de item feita, por não haver evidência forte de necessidade
  (Parte 24: "não fazer mudança arriscada apenas por estética").
- **Escala formal de densidade/spacing** (Parte 26): não formalizada como
  tokens novos nesta fase — os valores usados nas páginas tocadas (padding
  12-16px, gap 6-10px, `CompactListItem`/`CollapsibleSection` já compactos)
  já ficam dentro da faixa pedida, mas não foi criado um token dedicado.

## Diversidade de containers (Parte 27) — medido nas páginas tocadas

| Página | Antes | Depois |
|---|---|---|
| Tournaments.jsx | Header + Tabs + grade de cards (sem destaque de torneio ativo) | Header + Tabs + **Tournament Focus** (só quando relevante) + grade |
| CalendarPage.jsx | Semana + formulário sempre aberto + inscrições | Semana + **disclosure fechado** + inscrições — 1 card a menos visível por padrão |
| NavigationHub.jsx | N cards grandes (1 por item, `Surface` + ícone + texto + seta) | 1 container com N linhas compactas — reduz de N containers pra 1 |

## Duplicação de informação (Parte 28)

Nenhuma duplicação NOVA introduzida. A única removida nesta fase foi o
cabeçalho duplicado do `CalendarPlanner` (título "Planejar atividade"
repetido entre o componente e o `CollapsibleSection` que passou a
envolvê-lo).

## Performance (Parte 42)

Nenhum observer novo, nenhum listener global novo, nenhuma animação
contínua. `TournamentFocusMode`/`competeRoute` são puramente derivados de
estado já buscado (sem nova chamada de rede). `NavigationHub.jsx`
continua sem buscar nenhum dado (nunca buscou) — só trocou a composição
visual de uma lista estática de itens já conhecida em build-time.
