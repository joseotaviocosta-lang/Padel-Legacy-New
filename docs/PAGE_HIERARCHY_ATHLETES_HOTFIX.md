# Hotfix pré-beta — Página Atletas (dados) + Hierarquia global de páginas

Dois problemas reais reportados por QA antes do beta, sem relação de causa
entre si mas entregues no mesmo hotfix: (A) a página `Mundo → Atletas`
mostrava "Nenhum atleta encontrado com esses filtros" mesmo com todos os
filtros em estado neutro; (B) até 5 camadas repetiam o título/identidade da
página no mesmo carregamento (cabeçalho global, bloco de introdução do
onboarding, `PageHeader` da própria página). Nenhuma mudança em Match
Engine, Ciclo de vida de torneio ou lógica de Ranking — os dois problemas
são de dados de exibição (A) e de composição visual (B).

## Parte A — Atletas sem resultados

### Investigação

A hipótese óbvia era a Fase 11 (unificação do ranking individual,
`docs/RANKING_INTEGRITY_PHASE11.md`) — descartada por leitura de código:
`Athletes.jsx`/`getAthletes()` (`src/lib/athleteBehavior.js`) nunca filtram
por nenhum campo de ranking; `ranking_position` só era usado como
desempate de ordenação, nunca como filtro. A Fase 11 não é a causa.

### Causa raiz

`ensureAthleteProfiles()` (`src/lib/athleteBehavior.js`) decide quais bots
já existem lendo `localGame.entities.AthleteProfile.list('-overall_rating',
500)` — os 500 primeiros por overall. Se o catálogo total ultrapassa 500
registros, atletas reais "somem" dessa amostra parcial, parecem ausentes, e
a função tenta recriá-los via `bulkCreate`. `CareerEntityRepository.
bulkCreate` (`src/gameplay/repositories/CareerEntityRepository.js`) lança
no primeiro id duplicado do lote e **aborta o lote inteiro** — não só o
duplicado — deixando `ensureAthleteProfiles()` rejeitada e a página Atletas
com a lista vazia, exibida com a mensagem genérica de "filtros sem
resultado" (que na verdade era uma falha de carregamento, não um filtro
restritivo).

Não é reproduzível com o catálogo real de hoje (256 bots — 240 fictícios +
16 reais, via `src/players/athleteCatalog.js` — bem abaixo de 500), então o
bug era **latente**: real, determinístico e comprovado ao inflar a
população além de 500 num teste (Cenário 8 de
`scripts/test-athletes-page-data.mjs`), mas não disparava sozinho hoje.

### Correção

Removido o limite de `500` da leitura de existência —
`ensureAthleteProfiles()` agora lê o catálogo completo antes de decidir o
que falta criar, então nenhum atleta real cai fora da amostra por mais que
o catálogo cresça.

`src/pages/Athletes.jsx` ganhou tratamento de estado defensivo, sem tocar
em filtros/lógica de jogo:

- `sourceError`: uma falha real na fonte (exceção) tem sua própria tela
  ("Não foi possível carregar os atletas do circuito." + "Tentar
  novamente"), nunca mais reaproveita a mensagem de "filtros sem
  resultado".
- `athletes.length === 0` vs. `filtered.length === 0`: a lista vazia por
  fonte genuinamente sem atletas ("O circuito ainda não tem atletas
  cadastrados.") agora é uma mensagem diferente de "os filtros excluíram
  todo mundo" ("Nenhum atleta encontrado com esses filtros.").
- Ordenação por "ranking" passou a usar `buildWorldRankingSnapshot`
  (fonte canônica da Fase 11) em vez do campo bruto `ranking_position`, que
  só é atualizado semanalmente para uma amostra dos atletas de maior
  Overall — reaproveita o `profile` já carregado na mesma passada, sem
  fetch extra.

## Parte B — Hierarquia global de páginas

### Investigação

O relato ("Imprensa" repetindo até 5 vezes na mesma tela: "Mundo / Imprensa"
no topo, "Imprensa" de novo num bloco logo abaixo, "Imprensa Esportiva" no
hero da página) foi auditado arquivo por arquivo antes de qualquer correção.

Achado central: **nenhuma das páginas auditadas** (Imprensa, Atletas,
Calendário, Treinos, Centro de treinamento, Torneios) tem um segundo hero
próprio — cada uma já usa exatamente um `PageHeader`
(`src/components/design-system/PageHeader.jsx`, a única implementação; o
`PageHeader` exportado por `src/components/padel/ui.jsx` é um wrapper fino
que só renomeia props, não uma segunda implementação). A duplicação vinha
inteira de dois componentes **globais**, montados em toda rota:

1. **`AppLayout.jsx`** — o cabeçalho fixo (mobile) e a barra sticky
   (desktop, visível a partir de `xl:`) reimprimiam
   `{activeGroup?.label} / {currentTitle}` — um breadcrumb + título
   derivado da rota atual (`navigation/navigationConfig.js`), redundante
   com o que a própria página já mostra no seu `PageHeader`.
2. **`OnboardingGuide.jsx` → `PageIntroduction`** — bloco montado em toda
   rota (exceto `/game/missions`) que renderizava `<h2>{intro.title}</h2>`
   (`src/onboarding/pageIntroductions.js`) — para `/press`, literalmente
   "Imprensa", igual ao breadcrumb do cabeçalho global e quase igual ao
   título do próprio `PageHeader` ("Imprensa Esportiva").

Para `/press` especificamente, isso somava: "Mundo" 2x (eyebrow do
cabeçalho global + breadcrumb do `PageHeader`), "Imprensa" 3x (título do
cabeçalho global + `<h2>` do guia + breadcrumb do `PageHeader`) e "Imprensa
Esportiva" 1x (`<h1>` do `PageHeader`) — o exemplo relatado por QA batendo
exatamente com o código.

### Correção — estrutural, não página por página

Nova regra aplicada nos dois componentes globais (não em cada página):

- **Sidebar** = só navegação (não tocado).
- **Cabeçalho global** (`AppLayout.jsx`) = só contexto operacional —
  ranking/moedas/energia/fadiga (`CareerHud`, já existente), data/avançar
  dia (`CareerDayControl`, já existente), sino (`CommunicationBell`, já
  existente) e o alerta contextual (`CareerHeaderContext`, já existente:
  próximo torneio, fadiga alta, energia baixa). Removida a reimpressão de
  `activeGroup.label`/`currentTitle` — nem o cabeçalho mobile nem a barra
  desktop imprimem mais o título da rota; no espaço que sobrou, o
  cabeçalho mobile passou a mostrar `CareerHeaderContext` (compacto) —
  antes só aparecia a partir de `xl:` no desktop, e ficava montado (só
  visualmente oculto) entre `md:` e `xl:`, sem nenhum benefício.
- **`PageHeader` de cada página** = única fonte de identidade da página
  (eyebrow/título/descrição/breadcrumb). Nenhuma página precisou de
  edição — já eram a implementação correta.
- **Guia de onboarding** (`OnboardingGuide.jsx` → `PageIntroduction`) =
  orientação de ação, não reidentificação da página. O `<h2>{intro.title}`
  foi removido; a linha recolhida (visitas seguintes) mostra a descrição
  de uso (o que fazer aqui), e a linha expandida (primeira visita) mostra
  um rótulo genérico de ação ("Como usar esta página") — a grade de
  descrição/porquê/dica abaixo continua intacta, sem perder conteúdo.
  Estado minimizado, `isMissionCenter` e o comportamento de
  recolher/expandir por página não foram tocados.

Como as duas correções são nos componentes globais, toda rota do app se
beneficia numa única mudança — nenhuma página precisou de cirurgia
individual (confirmado por varredura em todos os 50 arquivos de
`src/pages/*.jsx`: nenhum tem mais de um `PageHeader` próprio fora dos
casos documentados como mutuamente exclusivos).

### Classificação (antes → depois)

| Página | Antes | Depois | Motivo |
| --- | --- | --- | --- |
| Imprensa, Atletas, Calendário, Treinos, Centro de treinamento, Torneios, Ranking, Missões, Loja, Inventário, Parceiros, Economia, Comissão técnica, Legado, Clubes, Jornal, Mercado mundial, Aparência, e demais rotas mapeadas em `pageIntroductions.js` | **A** (severo — 3 camadas: cabeçalho global + guia + `PageHeader` próprio) | **C** (correto — 1 camada: só o `PageHeader` próprio) | Cabeçalho global e guia paravam de reimprimir a identidade da página |
| `/game/missions` (não passa pelo guia — `isMissionCenter`) | **B** (moderado — 2 camadas: cabeçalho global + `PageHeader` próprio) | **C** | Mesma correção do cabeçalho global |
| `PlayerProfile.jsx`, `ClubDetail.jsx` e demais páginas de detalhe (`Atletas > Ale Galán`, `Clubes > Barcelona Padel Club`) | **D** (detalhe, breadcrumb legítimo pai > filho) | **D** (sem mudança) | Breadcrumb de detalhe é hierarquia real, não duplicação — preservado |

Nenhuma página caiu na categoria "hero standalone redundante" que exigisse
remoção individual — a causa era 100% estrutural/global.

## Testes

- `npm run test:athletes-page-data` (`scripts/test-athletes-page-data.mjs`,
  29 gates): pipeline real (GameStorage → CareerRepository → CareerManager),
  sem mocks. Cobre: fonte carrega com dados reais; filtros neutros retornam
  a população inteira; nenhum pseudo-atleta de `TeamRanking` aparece;
  filtros de fase/personalidade/estilo funcionam com os enums realmente
  persistidos; busca por nome e país funciona; ordenação por ranking usa a
  fonte canônica da Fase 11; limpar filtros restaura a população; e a
  reprodução direta da causa raiz (Cenário 8 — 600 atletas de enchimento
  empurrando o catálogo além do antigo limite de 500). Confirmado via
  `git stash` que o teste falha contra o código pré-correção (erro exato:
  `"AthleteProfile já existe com o id: player-fictional-7i55ge"`) e passa
  com a correção restaurada.
- `npm run test:page-hierarchy` (`scripts/test-page-hierarchy.mjs`, 32
  gates): análise estática de código-fonte (sem jsdom neste projeto — não
  há como montar componentes React). Cobre: `AppLayout` não reimprime mais
  título/breadcrumb de rota; contexto operacional (`CareerHud`,
  `CareerDayControl`, `CommunicationBell`, `CareerHeaderContext`)
  preservado; checagens estruturais mobile (sem altura fixa nova, safe-area
  preservada, um único cabeçalho/barra, `BottomNav` preservada, overflow
  normal); `PageIntroduction` não imprime mais o título da página mas
  preserva descrição/porquê/dica e o recolher/expandir; varredura em todos
  os 50 arquivos de `src/pages/*.jsx` confirmando que nenhuma página comum
  tem mais de um `PageHeader` (com exceção documentada de `Athletes.jsx`,
  cujos dois usos são ramos mutuamente exclusivos de erro vs. conteúdo);
  breadcrumbs de páginas de detalhe (`PlayerProfile`, `ClubDetail`)
  preservados. Confirmado via `git stash` que o teste falha contra o
  código pré-correção (`currentTitle` presente em `AppLayout.jsx`) e passa
  com a correção restaurada.
