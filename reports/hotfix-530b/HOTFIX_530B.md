# Hotfix 5.30-B — autoridade única do "próximo evento"

**Base:** `742ee4a`. **Sem commit, push ou tag.**

**Reprodução:** app desktop real (Tauri/WebView2 + puppeteer), em duas carreiras de teste novas criadas pela UI:
- "Smoke 530B — pode apagar";
- "Smoke 530B2 — pode apagar".

Evidências em `runs/`:
- `before-fix.json`;
- `after-fix-same-career.json` (com reload);
- `after-fix-new-career.json`;
- `header-click.json`.

## O bug, reproduzido (antes da correção)

| Passo | Header | Torneios | Home |
|---|---|---|---|
| Carreira nova, Home | Londres Challenge · 28d | — | "Próximo no calendário: Londres" |
| Abre Torneios | **Londres Challenge · 28d** | **Roma Pré-Temporada · 11d** | — |
| Volta à Home | **Londres Challenge · 28d** | — | "Próximo no calendário: **Roma**" |

## Causa raiz

**Nenhum filtro excluía a Pré-Temporada por não dar ranking.** A causa foi a combinação de dois comportamentos legados:
1. **A Pré-Temporada nasce tarde.**
   - A carreira nova é semeada só com a temporada regular (`localSeed.js` → `buildSeasonTournaments`).
   - "Roma Pré-Temporada" só é criada por `ensureFutureTournaments`, que roda quando a página **Torneios** abre (ou na virada de mês).
2. **O header não relia o calendário.**
   - Desde a Fase 15.6 (performance), o header só buscava torneios quando o **dia** ou o **jogador** mudavam, ou no `focus` da janela, que quase nunca dispara no Android.
   - Ele ficava com a lista de antes de Roma existir e anunciava Londres.

Também havia três regras diferentes para a mesma pergunta:

| Superfície | Regra antiga |
|---|---|
| Header | Primeiro por data entre todos os torneios; consulta ascendente, limite 2000 |
| Torneios | Primeiro por data **com inscrição aberta** |
| Home | `upcomingTournaments[0]`: primeiro por data, incluindo evento em curso sem o jogador e evento inalcançável |

Havia ainda um defeito latente no header: os `CalendarEvent` do jogador eram lidos em ordem **ascendente com limite 30**. Numa carreira longa, a campanha atual e a próxima inscrição ficariam de fora.

## Correção

- **Autoridade canônica:** `selectNextRelevantEvent` em `src/lib/nextEventAuthority.js`. É função pura, independente da ordem dos dados. A ordem de escolha é:
  1. evento em andamento (campanha com partida pendente);
  2. evento inscrito mais próximo;
  3. evento com inscrição aberta mais próximo;
  4. próximo evento futuro do calendário.
- **Fica de fora:**
  - evento sem data;
  - evento finalizado ou com campeão;
  - campanha encerrada (campeão, eliminado, desistência);
  - inscrição cancelada;
  - evento que já começou sem o jogador (o que começa **hoje** ainda conta como "Hoje · X");
  - evento inalcançável desde o início da carreira;
  - evento ilustrativo do seed ("Torneio (exemplo do calendário)", sem inscrição real).
- **As três superfícies usam a autoridade:**
  - **header** (`buildCareerHeaderContext`);
  - **Home** (`nextTournament` em `CareerHub.jsx`);
  - **Torneios** (`selectNextOpenTournament`, a etapa "inscrição aberta" da mesma autoridade).
- **Atualização do header:**
  - recarrega ao trocar de tela;
  - recarrega no aviso `padel:tournaments-changed`, disparado quando `ensureFutureTournaments` cria ou altera torneios e quando o jogador se inscreve ou cancela;
  - a busca continua presa a jogador e dia (regra da 15.6 preservada).
- **Consultas do header:** torneios e eventos do jogador passaram a ser lidos em ordem **descendente**, igual a Torneios e Home.
- **Sem mudança de layout, estilo, botões ou navegação.**

## Depois da correção (app real)

- **Carreira nova** (`after-fix-new-career`):
  - na Home, os três concordam em Londres, porque Roma ainda não existe;
  - ao abrir Torneios, o header passa **na hora** para Roma Pré-Temporada · 11d;
  - de volta à Home, os três dizem Roma.
- **Save/reload** (`after-fix-same-career`, com `page.reload()`): header, Home e Torneios dizem Roma em todos os passos.
- **Clique real no atalho** (`header-click.json`): abre `/tournaments`, sem abrir detalhe. A página mostra "PRÓXIMO EVENTO Roma Pré-Temporada".
- **Erros de JS: 0.**

## Respostas (19)

1. **Header:** `buildCareerHeaderContext` (`src/lib/careerHeaderContext.js`), com dados de `CareerHeaderContext.jsx`. Regra: primeiro por data, buscado só ao mudar dia ou jogador.
2. **Torneios:** cálculo inline `nextTournament` em `Tournaments.jsx`: primeiro por data com `isRegistrationOpen`, depois de `ensureFutureTournaments`.
3. **Home:** `upcomingTournaments[0]` em `CareerHub.jsx`. O bloco "O que vem agora" usa `buildHomeCommitment` (compromisso → `suggestableTournament` → agenda livre com `nextTournament`).
4. **Filtro que excluía Roma:** **nenhum** filtro de ranking, tier ou categoria. O header simplesmente não tinha Roma na lista: ela é criada depois, ao abrir Torneios, e o header não relia.
5. **Intencional ou legado?** **Legado, não intencional.** É a junção de dois comportamentos antigos:
   - a Pré-Temporada lazy (Fase 3);
   - o header que só relê ao mudar o dia (Fase 15.6).

   O próprio comentário do header dizia "a pergunta 'qual é o próximo torneio?' não pode ter duas respostas".
6. **Autoridade canônica:** `selectNextRelevantEvent` (`src/lib/nextEventAuthority.js`), mais `selectNextOpenTournament` para o cartão de Torneios.
7. **Pré-temporada é elegível?** **Sim.**
8. **Exibição sem ranking é elegível?** **Sim.** Teste com `rank_points = 0`, tier Exibição e `world_tour_event = false`.
9. **Roma aparece antes de Londres?** **Sim**: 11d contra 28d (teste e app real).
10. **Já inscrito funciona?** **Sim.** Vence até depois de a inscrição fechar; inscrito num evento posterior vence evento só aberto.
11. **Em andamento funciona?** **Sim.** Rodada atual, "Hoje" ou "Amanhã", acima de fadiga e energia.
12. **Evento concluído sai?** **Sim**: eliminado, campeão, finalizado, data passada e campanha antiga.
13. **Header, Home e Torneios concordam?** **Sim**, nos 5 estados (A–E) e nos passos do app real.
14. **Clique continua indo para Torneios?** **Sim** (clique real; rota `/tournaments`).
15. **Save/reload funciona?** **Sim**: app real com reload e teste de serialização.
16. **Testes criados (5), todos passando:**
    - `test-header-next-event-includes-preseason-v530b` (11 gates);
    - `test-header-next-event-registered-preseason-v530b` (8);
    - `test-header-next-event-active-preseason-v530b` (6);
    - `test-header-next-event-after-preseason-v530b` (5);
    - `test-next-event-authority-consistency-v530b` (36);
    - kit: `scripts/lib/v530bNextEventKit.mjs`.
17. **Regressão?** **Não.** Seleção de 149 testes que leem os arquivos tocados: 109 passam, 38 preexistentes (iguais no `742ee4a`) e 2 marcados como regressão, ambos esclarecidos:
    - **`test-header-next-tournament`:** a mudança de regra que esta fase pede. Um evento a 3 dias com inscrição **fechada**, sem o jogador, deixou de vencer um evento com inscrição aberta.
      - O gate foi ajustado mantendo a intenção ("o mais próximo, não o primeiro da lista") com dois eventos no mesmo degrau.
      - Ganhou um gate novo para a regra nova.
      - 30/30 PASS.
    - **`test-tier-strength-distribution`:** instável sob carga. A execução tinha dois corredores simultâneos e conflito de porta do Vite. Rodado sozinho: **5/5 PASS**.
18. **lint ✓ · build ✓ · `git diff --check` ✓.**
19. **VEREDITO: HOTFIX 5.30-B = A.**

## Ressalva

Numa carreira **recém-criada**, até o calendário ser reconciliado pela primeira vez (abrir Torneios, ou a virada de mês), a Pré-Temporada ainda não existe. Nesse intervalo, as três superfícies concordam em Londres.

Abrir Torneios é exatamente o passo "Inscreva-se em um torneio" do tutorial, e no mesmo instante as três passam para Roma.

Criar a Pré-Temporada já na criação da carreira resolveria de vez. Mas isso muda os dados iniciais de toda carreira nova e pode afetar o harness de balanceamento (proibido rodar simulação longa nesta fase). Fica como recomendação, não feito.

## Carreiras de teste criadas
"Smoke 530B — pode apagar" e "Smoke 530B2 — pode apagar". Nenhuma ação de jogo foi feita nelas; só navegação e a criação do calendário ao abrir Torneios.
