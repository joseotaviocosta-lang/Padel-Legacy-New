# LOCAL-8C — Integridade do catálogo de atletas ao consultar o Diretório

Branch `integracao/cloud-6o` · base `510311d` (5.32-C/C.1) · **sem commit** (aguardando validação).

Regra: **abrir uma tela de consulta não pode modificar silenciosamente o universo persistido.**

## 1. Causa raiz (comprovada)

A montagem da página `/world/directory?tab=athletes` (`src/pages/Athletes.jsx`) executava, a cada abertura:

```
Athletes (useEffect de montagem)
 ├─ ensureAthleteProfiles()   src/lib/athleteBehavior.js
 │    lista o catálogo de MODELOS de parceiro (getAllBotsAsProfiles, src/lib/bots.js,
 │    ids player-real-* / player-fictional-*) e cria como AthleteProfile todo modelo
 │    que ainda não existe na coleção — com personalidade, idade, traços, fase e
 │    OVR derivados do modelo (AthleteProfile.bulkCreate)
 └─ generateRelationships()   src/lib/athleteBehavior.js
      reescreve `relationships` dos 200 atletas de maior OVR (AthleteProfile.bulkUpdate);
      o score de "mentor" usa Math.random → cada abertura muda o save
```

Esse comportamento é anterior ao redesign (o código antigo da página já fazia as duas chamadas); a 5.32-C só o tornou visível ao listar o catálogo inteiro.

Medido com o teste de navegador **antes da correção** (`readonly-before-fix.json`), save em memória:

| | Carreira nova | Temporada 10 |
|---|---|---|
| Atletas | 1000 → **1240** | 1141 → **1423** |
| Atletas com `relationships` regravado | 163 | 170 |
| Estado persistente | +308 KB | +359 KB |
| 2ª abertura | ainda muda (Math.random) | ainda muda |

Entre os perfis criados: um **2º "Alejandro Galán"** (`player-real-1ljqig6`, modelo do catálogo) além do real do mundo (`real_alejandro_galan`) e fictícios com OVR 92–98. Na temporada 10, **4 dos perfis criados reutilizavam ids já referenciados por `TeamRanking`/`PartnershipLegacy`** (identidades históricas sem perfil, p.ex. pares semeados antigos) — a montagem colava um atleta inventado a uma identidade que o ranking de duplas já referenciava.

## 2. Respostas da auditoria

1. **Quando os atletas são criados?** Na semeadura do mundo da carreira (`saveFoundation`/`ensureWorldSeed2025`, população do circuito com ids `real_*`, `athlete-NNN`, `athleteprofile-*`), na evolução (novas safras) e, para o parceiro do jogador, por `materializePartnerAthlete` (src/lib/partnerAthlete.js) só quando o modelo é escolhido como parceiro.
2. **Fonte canônica:** a coleção `AthleteProfile` da carreira.
3. **Reais / bots / gerados / aposentados:** reais do mundo `real_*` (+ `is_real`), catálogo de parceiros `player-real-*`/`player-fictional-*` (`source_type`, `template_id`), gerados do mundo `athlete-*`/`athleteprofile-*`, aposentados por `retired`/`career_status` (+ `AthleteCareerLegacy`).
4. **Por que duplicados?** Os atletas reais existem duas vezes no projeto: no mundo (`real_*`) e no catálogo de modelos (`player-real-*`). `ensureAthleteProfiles` compara só por id/`template_id`, não reconcilia com o mundo, e materializava o modelo como um segundo atleta. `materializePartnerAthlete` faz a reconciliação certa para o parceiro escolhido.
5. **Identidade estável:** o `id` do AthleteProfile (nunca o nome — há 39 a 137 grupos de homônimos legítimos por save).
6. **Quando gerar relacionamentos?** `relationships` no AthleteProfile é dado **derivado/narrativo**: só `generateRelationships` o escreve; `updateRelationshipAfterMatch` não tem chamadores. As relações do jogador são outra entidade (`Relationship`, `processRelationshipWeek` no avanço semanal), intocada.
7. **Quem depende deles?** Só a seção "Relações no circuito" do perfil (leitura). Nenhum sistema do motor lê `AthleteProfile.relationships`.
8. **Por que a consulta chamava funções mutáveis?** Herança de quando o jogo não tinha mundo semeado: o Diretório "garantia" atletas a partir do catálogo. No motor, as mesmas funções só rodam como **fallback de save sem nenhum atleta** (`evolveAthletesMonthly`, `initializeWorldMarket`).
9. **Outras telas:** várias páginas chamam funções `ensure*/generate*` na montagem (ver §9). Fora do escopo desta fase; inventariadas como risco.
10. **Memória × save:** as escritas iam para a carreira ativa e eram persistidas pelo pipeline normal de save (aparecem no export e após recarregar).
11. **Repete após save/load?** Sim: cada abertura regravava relações; atletas eram criados só na 1ª (depois já existiam).
12. **Risco em torneios:** os perfis criados entram no `AthleteProfile` sem pontos; os 4 sobre ids históricos tornavam "resolvíveis" (com dados inventados) identidades que o `TeamRanking` referenciava.
13. **Custo de remover do fluxo de leitura:** nenhum funcional — o motor não depende delas; abrir o Diretório ficou ~6,8× mais rápido na temporada 10.
14. **Compatibilidade:** saves antigos carregam igual; perfis/relacionamentos já gravados por aberturas anteriores **permanecem** (sem limpeza).
15. **Progressão/motor:** intocados (nenhum arquivo de `game-core`, `gameplay`, `athleteBehavior.js` ou regras alterado).

## 3. Dados canônicos × derivados

- **Canônicos:** `AthleteProfile` (identidade, OVR, idade, pontos, parceria `ai_partner_id`), `Partnership`, `TeamRanking`, `Tournament`, `AthleteRankingResult`, `AthleteCareerLegacy`.
- **Derivados na leitura:** posição Mundial/Race (snapshot), parceiro atual (resolução mútua), histórico de parcerias, rótulos — calculados em memória pela UI, nunca gravados.
- **Derivado narrativo persistido (legado):** `AthleteProfile.relationships` — permanece como está nos saves que o têm; não é mais regenerado por consulta.

## 4. Políticas

- **Inicialização de atletas:** só no ciclo de vida legítimo (semeadura do mundo; fallback do motor para save vazio; materialização do parceiro escolhido). Consultas não criam atletas.
- **Relacionamentos:** consultas não geram nem reescrevem. Nenhuma fonte aleatória nova foi introduzida; `generateRelationships` continua existindo (fallback do motor) sem alteração de regra.
- **Duplicados:** nada é apagado, deduplicado, reatribuído ou reescrito. Classificação (só leitura) em `save-integrity.json`:
  - A — homônimos legítimos (ids distintos): 39 (t1), 112 (t5), 137 (t10) grupos;
  - B — modelos do catálogo materializados **sem** uso esportivo: 0 nos saves da LOCAL-8A (nunca abriram o Diretório); 240/278 após a montagem antiga;
  - C — modelos do catálogo **com** uso (parceria, ranking, resultados): 58–100 por save — legítimos (parceiros materializados e população semeada), mais os 4 ids históricos "sequestrados" pela montagem antiga.
  - Conclusão: pertencer ao catálogo não torna um perfil ilegítimo; limpeza automática seria destrutiva. Uma eventual migração (remover B de saves de usuários que já abriram o Diretório) fica como **proposta separada**, a autorizar.

## 5. Correção

`src/pages/Athletes.jsx`: a montagem deixa de chamar `ensureAthleteProfiles()`/`generateRelationships()`; as leituras ficam numa função exportada e testável, `loadAthleteDirectory(profile)` (lista do catálogo + snapshot do ranking). Nada mais mudou na página (5.32-C preservada). Nenhum outro arquivo de produção alterado.

## 6. Testes

| Teste | Resultado |
|---|---|
| `scripts/test-local-8c-directory-readonly.mjs` (Chrome real, 5 cenários: carreira nova, com dupla, t1, t5, t10) | antes: **8 FAIL** (2 cenários); depois: **35/35 PASS** |
| `scripts/test-local-8c-save-integrity.mjs` (SSR, 5 saves) | **22/22 PASS** |

O teste de navegador tira snapshots canônicos (hash de **cada registro de cada entidade** + seções de topo) e percorre: Diretório, busca com/sem acento, todos os recortes, todas as ordenações, carregar mais, perfil do líder (todas as seções, parceiro → voltar), aposentado, homônimos, duas voltas completas; depois recarrega com deep link `?athlete=` e repete; depois navega para Ranking e Mundo.

- Contagem de atletas por volta: 1000/1118/1072/1118/1141 — **constante**.
- Registros alterados em qualquer entidade: **0**; relacionamentos: **inalterados**; após recarregar: **0**; navegação cruzada: **0** no universo esportivo.
- **Única escrita existente, verificada por conteúdo (não excluída às cegas):** o onboarding grava a introdução de página vista na 1ª visita de qualquer tela (`tutorial.pageIntroductionsSeen` e o espelho em `player.tutorial_onboarding`, + carimbo `save_version/updated_at`). O teste aceita só isso, só com rotas efetivamente visitadas, e exige o resto de `player`/`tutorial` idêntico; a 2ª visita produz zero.

O teste SSR espiona **toda** chamada de escrita (`create/bulkCreate/update/bulkUpdate/delete/bulkDelete/upsert/batch`) durante a consulta ×3 (Diretório + recortes + ordenações + busca + perfis de líder, homônimos, aposentado e parceiro): **0 escritas**; carreira idêntica (JSON completo); **save → load → consulta → save idêntico**; ids de atleta únicos; e um **controle** que roda a montagem antiga numa cópia e confirma que o teste a detecta.

## 7. Desempenho (mesma sessão, medianas, build de desenvolvimento — `perf.json`)

| | Antes (com as chamadas) | Depois |
|---|---|---|
| Abrir Diretório — carreira nova | 86 ms | 61 ms |
| Abrir Diretório — temporada 10 | 635 ms | **93 ms** |
| Buscar | 26–37 ms | 24–40 ms |
| Abrir perfil | 22–24 ms | 23–25 ms |
| Alternar seção | — | 13–14 ms |
| Atletas carregados (t10) | 1141 → 1423 na 1ª abertura | 1141 |
| Crescimento do estado (`state-size.json`) | +308 KB / +359 KB | **0 bytes** |

## 8. Regressões e falhas preexistentes

Bateria (`reports/local-8c-directory-save-integrity/tests.json`): seleções 5.32-A, 5.32-B, 5.32-C, 5.32-C.1 + LOCAL-7D…7H.1, CLOUD-7D1, 5.31, onboarding, Home, mercado de parceiros + os 2 testes da LOCAL-8C = **231 testes · 198 pass · 32 preexistentes · 1 marcado como regressão e descartado com evidência**. Mais `test-partner-choice-age-v532c1` rodado à parte: **49 PASS**.

- Todos os testes diretamente ligados passam: LOCAL-8C (2), 5.32-C (perfil 58, contenção 160), 5.32-C.1 (49), 5.32-B (2), 5.32-A (views/contenção), `test-athletes-page-data`, LOCAL-7D, 7E, 7F, 7G, 7G.1, 7H, 7H.1, CLOUD-7D1, mercado 5.31, onboarding v3, propostas v2.
- **`test-long-career-partner-ecology-v518` (marcado "REGRESSION" pelo executor) — intermitente, não regressão.** Isolado, com o MESMO código atual: 1ª execução passou (7/7), 2ª falhou (Parte H: churn Top10 da T3 = 50% contra limite 40%; na 1ª, 40%); com o `Athletes.jsx` do HEAD: passou. O teste carrega só módulos do motor (saveFoundation, WorldTourLifecycle, circuitLifecycle, aiPartnershipLifecycle) — nenhuma página; o mesmo par passa/falha já tinha sido observado na 5.32-B com código idêntico.
- **Timeout:** `test-partner-athlete-idempotency-v512` (simulação de 6 seeds) — igual no HEAD, como na 5.32-A/B/C.
- **Preexistentes (32):** os mesmos da 5.32-C (falham igual com o `Athletes.jsx` do HEAD).
- Gates: `npm run lint` ✓ · `npm run build` ✓ · `npm run validate:architecture` ✓ · `git diff --check` ✓.
- Efeito colateral da bateria: testes de simulação regravaram relatórios versionados de outras fases (`reports/progression-economy-526/*`, `reports/fase15-simulation.json`, `reports/phase15-3-simulation.json`, `reports/progression-integrity-526b/rank-jump-2027.json`) — restaurados ao HEAD; arquivos gerados removidos.

## 9. Riscos residuais e recomendações

1. **Saves que já abriram o Diretório** mantêm os perfis de modelos criados (classe B) e as relações gravadas. Não removidos (sem migração destrutiva). Recomendação: migração opcional, separada, que remova apenas perfis B (id do catálogo, sem nenhuma referência em Partnership/TeamRanking/resultados/torneios, sem pontos) — com análise e autorização.
2. **Outras telas escrevem na montagem** (inventário): `PartnerHub` (`ensureInitialPartnerOffers`, `generateAdvisorTips` — provável causa das propostas que mudam entre visitas, observado na 5.32-C.1), `Tournaments` (`ensureFutureTournaments`), `WorldEvents` (`ensureWorldEvents`/`generateWorldEvents`), `Journal` (`generateJournal`), `Coaches` (`ensureCoachMarketInitialized`), `Clubs` (`ensureWorldClubCatalog`), `Missions` (`ensureExtendedMissionCatalog`), `Communications` (`ensureContextualCareerCommunications`), `Relationships` (`ensurePlayerRelationships`), `Ranking` (`ensurePlayerTeamRanking`, com dupla). Muitas devem ser top-ups idempotentes legítimos; recomenda-se uma auditoria própria (mesmo teste de snapshot por tela).
3. `generateRelationships` continua com `Math.random` no score de mentor (só roda no fallback de save vazio). Se voltar a ser usado, trocar por `seededHash` (já usado na mesma função).
4. Divergência `ranking_position` gravado × Ranking: pendência separada, não misturada aqui.
5. LOCAL-8C.1 (negociação antecipada de parceiros): apenas registrada.
