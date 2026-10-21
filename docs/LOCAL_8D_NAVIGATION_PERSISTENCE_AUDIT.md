# LOCAL-8D — Auditoria de escritas e efeitos colaterais da navegação

Branch `integracao/cloud-6o` · base `6bdf8af` (LOCAL-8C) · **sem commit** · **nenhum código de produção alterado** (só scripts de auditoria e relatórios).

Princípio auditado: *navegar por uma tela não deve alterar silenciosamente o estado esportivo, econômico ou contratual da carreira.*

## 1. Escopo

Todas as rotas reais do `App.jsx` (63, incluindo redirecionamentos legados) e as 26 abas dos 10 hubs consolidados. Na auditoria dinâmica, 59 alvos navegáveis (rotas + abas + variantes de `?view=`/`?tab=` + detalhe de torneio, chave de torneio encerrado e detalhe de clube), em 5 saves.

## 2. Inventário de rotas (resumo)

Carreira: `/game` (Home), `/career/athlete` (perfil/aparência), `/career/training` (treinos/inventário/**loja**), `/career/team` (**técnico**/staff), `/career/relations` (pessoas/fãs), `/partners` (visão geral/mercado: recebidas/busca/caixa/contrato/histórico), `/game/missions` (+ conquistas), `/game/legacy` (+ hall/mensal/anual), `/game/stats`, `/game/economy`, `/game/training`, `/game/matches`, `/development`, `/team-hub`, `/management`.
Competição: `/tournaments` (+ calendário, detalhe `?tournament=`, chave `&openBracket=true`), `/ranking` (Mundial/Race × Individual/Duplas, temporada), `/competitions`.
Mundo: `/world`, `/world/circuit` (notícias/**circuito**/**imprensa**/comunidade), `/world/directory` (atletas/**clubes**/países), `/clubs/:id`, `/world-market`, `/weather`, `/encyclopedia` (+ história).
Outros: `/communications`, `/settings`, `/careers`, `/admin`, `/database`.
Lista completa e funções por tela: `reports/local-8d-navigation-persistence-audit/static-audit.json`.

## 3. Metodologia

1. **Estática** (`tools/static-audit.mjs`): por tela, funções chamadas com `await`, definição resolvida e procura de escrita (`create/bulkCreate/update/bulkUpdate/delete/upsert/batch/mutateActiveCareer/updatePlayerProfile`) e de `Math.random`, um nível abaixo. Triagem — 70 funções; a maioria é ação explícita do jogador.
2. **Dinâmica** (`tools/route-audit.mjs`, Chrome real, save **em memória**, IndexedDB do usuário intocado): para cada rota, `open1` (1ª abertura vinda da página neutra — o Diretório, somente leitura pela LOCAL-8C), `open2` (2ª abertura, idempotência). Snapshot canônico **por registro e por campo** de todas as entidades e das seções do save; contagem de gravações efetivas do save (`careerWrites`) e de `Math.random`.
3. **Recarga** (`tools/reload-audit.mjs`): boot direto em cada rota × boot na página neutra (dois boots de referência idênticos: ruído zero).
4. **Determinismo** (`tools/determinism.mjs`): A = carregar → avançar 1 dia; A' = repetir A (ruído); B = carregar → navegar por todas as rotas → avançar 1 dia. Comparação por conteúdo (ids de relógio/aleatórios e carimbos removidos) e por campo.
5. **Sondas reproduzíveis**: `scripts/test-local-8d-partner-offers-probe.mjs` (propostas), `scripts/test-local-8d-shop-catalog-probe.mjs` (Loja).
6. `tools/analyze.mjs` consolida a matriz (`matrix.json`).

Exclusões: nenhuma às cegas. A introdução de página vista (onboarding) é identificada por conteúdo (`tutorial.pageIntroductionsSeen` + espelho em `player.tutorial_onboarding` + carimbo do save) e separada das demais.

## 4. Saves utilizados (todos só em memória)

| Cenário | Origem | Características |
|---|---|---|
| carreira-nova | fixture 5.32 (criada pela UI) | 2026-01-01, sem parceiro, sem histórico |
| t5-com-dupla | fixture 5.32 (t5 + dupla aceita + dias jogados) | parceiro ativo, Race com pontos, temporada em andamento |
| t1 | LOCAL-8A temporada 1 | início de 2027, sem parceiro |
| t5 | LOCAL-8A temporada 5 | aposentados, histórico médio |
| t10 | LOCAL-8A temporada 10 | 67 MB, 10 temporadas, 149 aposentados |

Lacunas (não inventadas): não havia save com **contrato perto do vencimento**, **recusa de renovação**, **torneio inscrito/em andamento** do jogador nem **mercado do jogador ativo com negociação**. A recarga só foi medida na carreira nova (na t10 cada boot recarrega 67 MB e o protocolo do Chrome estourou o tempo — as aberturas da t10 foram medidas sem recarga).

## 5. Números

- **588** operações de abertura (5 cenários × ~59 alvos × 2) + **59** recargas + **6** execuções de determinismo + **2** sondas.
- **193** operações com alguma escrita: **111** só onboarding (legítima) e **82** com escrita de registros (**6.378** registros no total).
- **22** segundas aberturas não idempotentes.
- **695** gravações efetivas do save; **186.261** chamadas de `Math.random` (quase todas geração de id de registros criados).

## 6. Matriz de achados

| ID | Tela / gatilho | Causa (comprovada) | Entidades | Qtde | Persiste | Idempotente | Determinismo | Classe | Prioridade |
|---|---|---|---|---|---|---|---|---|---|
| **8D-01** | Mercado mundial `/world-market` (abrir) | `getGlobalMarketSnapshot` → `ensureWorldMarket` grava `normalizeAthlete` em todo atleta sem campos de mercado (`career_status`, `potential`, `current_form`, `world_rank` próprio por OVR+forma, valor/salário/tendência, `last_market_month`); `updateCoachMarket` regrava todos os técnicos a cada abertura. **O motor não chama `ensureWorldMarket`** — só a tela. | AthleteProfile, Coach | 500 atletas + 118 técnicos por save | sim | atletas sim; técnicos **não** (118 a cada abertura) | **altera o dia seguinte**: no A×B, 500 atletas diferem (`world_rank`, `career_status` 444, `potential`/`current_form` 5) | D | **P1** |
| **8D-02** | Notícias `/world/circuit` (aba Notícias / `generateJournal`) | `(m.team_a || []).sort()` ordena **no próprio registro** (o repositório devolve cópia rasa) — a ordem dos membros em partidas históricas é reescrita e gravada | Match | 23–81 partidas | sim | sim (já ordenado) | — | D | **P1** |
| | consequência medida | Torneios identifica as partidas do jogador por `team_a[0] === nome`: das 30 mais recentes (t5-com-dupla), **23 → 0** reconhecidas depois de abrir Notícias | | | | | | | |
| **8D-03** | Loja `/career/training?tab=shop` (abrir) | `seedMarket` (repara itens históricos por `release_year+category`) e `ensureExpandedShopCatalog` (sincroniza por nome) disputam os mesmos itens: a cada visita o catálogo recria 2 itens e o reparo os **renomeia para itens raros históricos** (ex.: "Bola Dourada WPT Final (2023)", 73.000) | ShopItem | +111 na 1ª; **+2 e ~111 reescritos a cada visita** (115→117→119→121) | sim | **não** | — | D | **P1** |
| | | `seedMarket` usa `new Date()` (data do computador) | | | | | | | |
| **8D-04** | Torneios `/tournaments` (abrir) | chama `simulatePastTournaments` (no-op nos saves modernos: ignora `world_tour_event`) e `ensureFutureTournaments` — o MESMO job da virada de mês do motor (15 meses à frente), antecipado | Tournament, Season | +27/+40 torneios, +1 temporada (id aleatório) | sim | sim | volume de torneios difere no A×B; nenhuma partida/resultado/ranking/inscrição/chave alterado em nenhum cenário | C | P3 |
| **8D-05** | Parcerias `/partners` (todas as abas, sem dupla) | `ensureInitialPartnerOffers` gera o lote inicial na **1ª abertura** (não na criação da carreira) | PartnerOffer (+ CareerMessage) | 4 | sim | sim enquanto houver pendente | lote depende do perfil no momento da abertura (lado/XP) | C | P2 |
| | "propostas mudaram entre visitas" (5.32-C.1) | **mesmas propostas, ordem diferente**: a 1ª abertura mostra a ordem de criação; as seguintes, `-created_date` | | | | | | P3 |
| | aberturas simultâneas | a 2ª chamada **lança erro de id duplicado** (a tela mostra "não foi possível carregar"); nada duplicado | | | | | | P3 |
| | todas recusadas | reabrir a página **gera novo lote** sem avanço do calendário (recusadas em cooldown ficam fora) | | 4 | | | | C | P2 |
| **8D-06** | Objetivos `/game/missions` (abrir) | `syncExtendedMissionCatalog` = migração de catálogo na tela: 1ª abertura troca tipo e **recompensas (XP/moedas)** de missões via aliases; 2ª as arquiva | Mission | 3–12 | sim | não (2 etapas) | missões diferem no A×B (`xp_reward`, `coins_reward`, `mission_type`) | B | P2 |
| **8D-07** | Conquistas `?tab=achievements` (abrir) | `syncPlayerAchievements` desbloqueia conquistas já merecidas **e credita moedas** (`FinancialTransaction` "conquista") ao abrir; `unlocked_date` = data do computador | PlayerAchievement, FinancialTransaction, player | +1 a +6, +1 transação | sim | sim (ids determinísticos) | economia depende de abrir a aba | B | P2 |
| **8D-08** | Notícias › Circuito `?tab=circuit` | `ensureWorldEvents`/`generateWorldEvents` criam notícias ao abrir | WorldEvent | +2 a +46 | sim | sim | notícias a mais no A×B | C | P2 |
| **8D-09** | Clubes `?tab=clubs` | `ensureWorldClubCatalog` cria o catálogo com **uma gravação do save por clube** | Club | +71 / **71 gravações** (t10: 71 serializações do save de 67 MB) | sim | sim | — | B | P2 (desempenho) |
| **8D-10** | Técnico `/career/team` | `ensureCoachMarketInitialized` cria o catálogo de técnicos na 1ª abertura | Coach | +118 | sim | sim | — | B | P3 |
| **8D-11** | Imprensa `?tab=press` | catálogo de jornalistas na 1ª abertura (12 gravações) | PressJournalist | +14 | sim | sim | — | B | P3 |
| **8D-12** | Enciclopédia | catálogo na 1ª abertura | EncyclopediaEntry | +62 | sim | sim | — | B | P3 |
| **8D-13** | Home `/game` (boot) e Comunicações | boot na Home cria `MissionProgress` + `FinancialTransaction` (recompensa de missão de tutorial); Home/Comunicações tocam `updated_date` de entrevistas a cada abertura | MissionProgress, FinancialTransaction, PressInterview | 1–4 | sim | entrevistas **não** | ruído de 1 MissionProgress também no A×A' | A/C | P3 |
| **8D-14** | Todas as telas (1ª visita) | onboarding grava a introdução de página vista | tutorial, player | 1 lista | sim | sim | — | **A (legítima)** | — |
| **8C** | Diretório de atletas | corrigido na LOCAL-8C | — | 0 | — | — | — | — | resolvido |

Sem escrita de registros em nenhum cenário: Ranking (todas as views, temporada), Mundo, Diretório (atletas/países), perfis, clubes (detalhe), Torneios › calendário/detalhe/chave encerrada, Legado (todas as abas), Estatísticas, Finanças, Treinos, Partidas, Perfil/Aparência, Inventário, Staff, Relações/Fãs, Clima, Configurações, Carreiras, Admin, Banco de dados, hubs de navegação. **Nenhuma** abertura alterou TeamRanking, AthleteRankingResult, resultados, inscrições, chaves, contratos (`Partnership`) ou pontos.

## 7. Investigações especiais

### Parcerias (seção 11)
1. Propostas iniciais são geradas na **1ª abertura de `/partners`** (qualquer aba), não na criação da carreira. 2. Durante o mesmo dia ficam estáveis (ids = perfil+candidato; idempotente enquanto há pendente). 3. Reabrir não gera novas. 4. Trocar entre Visão geral/Mercado não altera. 5. Recarregar não altera. 6. Seleção determinística (mesma carreira → mesmos candidatos), mas depende do perfil no instante da 1ª abertura (lado/XP). 7. Pendentes preservadas ao recusar uma. 8. Recusadas em cooldown não voltam; com **todas** recusadas, reabrir gera novo lote sem passar o dia. 9. Contratos não mudam. 10. Mercado (propostas) não muda sem avanço — exceto o caso 8. 11. Carreira carregada × nova: mesmo comportamento (o gatilho é a ausência de pendentes). 12. Sem efeito em relações; cria mensagens de proposta. **A "mudança" vista na 5.32-C.1 era ORDEM de exibição**, não candidatos. Negociação antecipada (LOCAL-8C.1): não implementada.

### Torneios (seção 12)
Abrir lista, calendário, detalhe e chave **não** cria chaves, não altera inscrições, resultados, pontos, ranking, histórico nem parceiro inscrito (em nenhum dos 5 saves). A única escrita é `ensureFutureTournaments` (job do motor antecipado) e uma `Season` nova; `simulatePastTournaments` é no-op em calendário moderno. Regras CLOUD-7D1 e LOCAL-7E…7H.1 intactas (testes verdes).

### Mundo e Ranking (seção 13)
Ranking, Race, Duplas, Temporada, Mundo, Diretório e perfis: **somente leitura** (só onboarding). Notícias: 8D-02 e 8D-08. **Divergência de posição**: o Mercado mundial **grava um terceiro "ranking"** (`world_rank`, ordenado por OVR+forma) em 500 atletas — mais uma fonte divergente do `ranking_position` do circuito e da posição do Ranking. Não corrigido nem recalculado nesta fase.

## 8. RNG e determinismo (seção 14)

O motor usa hashes determinísticos (FNV por id/data) para resultados; `Math.random` aparece sobretudo na geração de ids de registros novos e em pontos legados. Resultado do teste A/A'/B:

| Cenário | A × A' (ruído) | A × B (navegar antes de avançar 1 dia) |
|---|---|---|
| carreira-nova | 1 MissionProgress | AthleteProfile 500, Tournament +27, Season +1, Coach +118, Club +71, ShopItem +111, PartnerOffer +4, WorldEvent +5, PressJournalist +14, EncyclopediaEntry +62 |
| t5-com-dupla | **zero** | AthleteProfile **500** (campos `last_market_month`, `market_months_elapsed`, `world_rank`, `career_status` 444, `potential` 5, `current_form` 5), Mission 3 (recompensas/tipo), Tournament +11, WorldEvent +15, catálogos; **Match: 0 campos diferentes** |

Conclusão: o avanço do dia é determinístico; **navegar muda o estado que entra no dia seguinte** — principalmente pelo Mercado mundial (8D-01: `current_form`/`potential` entram na simulação) e pelas missões (8D-06). Nenhuma partida do dia avaliado mudou, mas a forma alterada de atletas tem efeito em simulações futuras.

## 9. Persistência e desempenho (seção 15)

- Gravações do save por abertura (pior caso): Clubes **71** (t10: 71 serializações de 67 MB), Loja **5–13 a cada visita**, Imprensa 12, Parcerias 5, Torneios 3, Mercado 1–3 (sempre 1 nas reaberturas).
- Crescimento: Loja sem limite (+2 itens/visita); catálogos (técnicos 118, clubes 71, enciclopédia 62, jornalistas 14) uma vez.
- Tempos de abertura medidos em fases anteriores: Mundo +17–25 ms (5.32-B), Diretório 635→93 ms na t10 (LOCAL-8C). Tempo por rota nesta fase **não** foi medido individualmente (limitação); o custo dominante observado é o número de gravações do save.

## 10. Compatibilidade com saves

Saves que já visitaram essas telas carregam normalmente, mas carregam os efeitos: partidas com `team_a` reordenado (8D-02), itens históricos duplicados na Loja (8D-03), atletas com campos de mercado preenchidos (8D-01). Nenhuma correção de dados foi feita; qualquer reparo precisa de migração própria, autorizada (ex.: restaurar o jogador em `team_a[0]` é reconstruível pelo nome; duplicatas da Loja identificáveis por nome/coleção).

## 11. Limitações de cobertura

- Cenários ausentes: contrato perto do vencimento, recusa de renovação, torneio inscrito/em andamento, negociação de mercado em curso.
- Recarga medida só na carreira nova; determinismo em 2 cenários (1 dia).
- Ações explícitas (botões) não foram auditadas — só abrir/navegar.
- A auditoria estática é triagem (um nível de chamadas); a classificação vem da dinâmica.
- Tempo de abertura por rota não medido nesta fase.

## 12. Testes e gates desta fase

Nenhum código de produção alterado (`git diff -- src` vazio). Verificados: LOCAL-8C (save-integrity 22/22), 5.32-C (58), 5.32-A (64), 5.32-B (69), LOCAL-7D (33), 7E (38), 7G (24), 7H.1 (15), CLOUD-7D1 (38) — todos verdes; `npm run lint` ✓, `npm run build` ✓, `npm run validate:architecture` ✓, `git diff --check` ✓. Sondas: propostas 6 PASS + 4 achados; Loja: não idempotente comprovado.

## 13. Priorização e plano recomendado

**LOCAL-8E — corrigir P1 (pequeno, alto retorno):**
1. 8D-02: `generateJournal` sem ordenação in-place (copiar arrays). Teste: abrir Notícias não muda `Match`. Migração opcional separada para saves já afetados.
2. 8D-03: unificar a chave de reconciliação da Loja (`seedMarket` × `ensureExpandedShopCatalog`) e tirar o seed da abertura; data da carreira em vez da do computador. Teste: N aberturas = 0 escritas.
3. 8D-01: Mercado mundial somente leitura — normalização de mercado no ciclo do motor (virada de mês) ou calculada em memória; técnicos sem regravação por abertura. Teste A×B de determinismo zerado para o Mercado.

**LOCAL-8F — ciclo de vida (P2):** mover para criação/carregamento da carreira ou avanço de dia, com gravação em lote: propostas iniciais (+ trava, ordem estável), migração de missões, reconciliação de conquistas, notícias do circuito, catálogo de clubes (1 gravação em vez de 71).

**LOCAL-8G — P3:** catálogos de técnicos/jornalistas/enciclopédia na criação; `updated_date` de entrevistas sem toque por abertura; `Season` com id determinístico; datas da carreira em vez do relógio.

**Depois:** investigação dedicada da divergência de posições (agora com 3 fontes: circuito, Ranking, Mercado); LOCAL-8C.1 (negociação antecipada).

## 14. Arquivos desta fase

- `docs/LOCAL_8D_NAVIGATION_PERSISTENCE_AUDIT.md`
- `reports/local-8d-navigation-persistence-audit/` — `static-audit.json`, `dynamic/*.json`, `reload/carreira-nova.json`, `determinism/*.json`, `matrix.json`, `partner-offers-probe.json`, `shop-catalog-probe.json`, logs, `tools/` (static-audit, route-audit, reload-audit, determinism, analyze)
- `scripts/test-local-8d-partner-offers-probe.mjs`, `scripts/test-local-8d-shop-catalog-probe.mjs`
