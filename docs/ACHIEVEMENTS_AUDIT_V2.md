# Auditoria do Catálogo de Conquistas — Fase 12

Gerado mecanicamente a partir de `src/lib/achievementsData.js` (175 entradas) cruzado com `EVALUABLE_TRIGGER_TYPES` real de `src/lib/achievementEngine.js` após a Fase 12 — não uma estimativa. Antes desta fase: 31/175 funcionais. Depois: 90/175.

## Achados principais (evidência, não suposição)

- **A correção central**: `play_match`/`win_match` (13 entradas, renomeadas `play_official_match`/`win_official_match`) sempre estiveram implementáveis — só nunca foram avaliadas contra a fonte certa. `profile.matches_played`/`wins` só contam partida de TREINO (`game-core/progression.js`). A fonte real e já persistida é a linha de `Match` criada na finalização oficial (`competition_type:'tournament'`, `is_official:true`, `result:'vitória'|'derrota'` — `TournamentModal.jsx`), computada sob demanda via `src/lib/achievementContext.js` — nenhum contador novo.
- **Economia**: `reach_coins` nunca deve ler `profile.coins` (saldo, sobe e desce). Fonte real: soma das `FinancialTransaction` com `type:'income'`, já persistidas em múltiplos pontos reais (prêmio de torneio, patrocínio, bônus de temporada).
- **Ranking**: `getWorldRank`/`buildWorldRankingSnapshot` (`src/lib/padel.js`) permanecem a única fonte — nenhuma mudança. Achado disclosed, **não corrigido** (algoritmo de ranking fora de escopo nesta fase): `buildWorldRankingSnapshot` nomeia uma variável local `officialMatches` mas a deriva de `profile.matches_played` — o mesmo contador de treino que esta fase contorna para conquistas. Fica registrado para uma futura fase focada em ranking.
- **15 "secretas" eram placeholders vazios**: todas com descrição idêntica ("Desbloqueie para revelar.") e `trigger_type` sem mecânica real por trás — nunca foram segredos de verdade. Arquivadas (`is_active:false`), nunca deletadas.
- **5 dependem de um sistema/mecânica que não existe ainda** — 4 de aposentadoria/gerações de carreira (só NPCs simulados do circuito têm `retirement_announced`) + 1 achado durante a revisão da UI (Parte P): "O Inatingível" (`all_achievements`, "Desbloqueie TODAS as outras conquistas") tinha `visibility:'secreto'` mas nenhum trigger implementável — sem correção, apareceria como "???" impossível de sempre, exatamente o anti-padrão que a Parte 28 proíbe (confundir impossível com secreta). Todas as 5 marcadas `future_system` — somem da lista normal (e da lista de secretas) até a mecânica existir.
- **2 novas ("beat_top10"/"beat_rank1")** ganharam um campo novo (`Match.opponent_rank`, escrito ao lado da própria criação da partida em `TournamentModal.jsx`) — feito nesta fase, não deixado pendente.
- **62 documentadas como "necessita novo evento leve"**: mecânica existe (partidas com estatísticas detalhadas, relacionamentos, mercado, Hall da Fama), mas falta um contador/flag incremental que ainda não existe — não implementado nesta fase por decisão de escopo (Parte 3 do briefing: "não implementar gatilhos cegamente").
- **4 candidatas a "ruim/artificial"** (`spending_spree`, `buy_flash_sale`, `buy_deep_discount`, `great_deal`) — leem como incentivo a comportamento de compra, não marcos de carreira; mantidas no catálogo (não removidas sem decisão explícita do design), sinalizadas para revisão.

## Resumo por classificação

| Classificação | Quantidade |
|---|---|
| A/B — Funcional (Fase 12) | 88 |
| C — Necessita novo evento leve | 61 |
| F — Obsoleta (placeholder vazio arquivado) | 15 |
| G — Ruim/artificial (candidata a revisão) | 4 |
| D — Depende de sistema inexistente (aposentadoria/gerações/completude) | 5 |
| C(feito) — Novo campo Match.opponent_rank (Fase 12) | 2 |

**Total presentável (exclui D e F):** 155 de 175.

## Tabela completa (175 conquistas)

| ID | Nome | Categoria | Secreta | Tier | Trigger | Alvo | XP | Moedas | Outra recompensa | Classificação |
|---|---|---|---|---|---|---|---|---|---|---|
| achv-primeiro-passo | Primeiro Passo | partidas | não | facil | play_official_match | 1 | 50 | 100 | — | A/B — Funcional (Fase 12) |
| achv-estreante-dedicado | Estreante Dedicado | partidas | não | facil | play_official_match | 10 | 100 | 200 | — | A/B — Funcional (Fase 12) |
| achv-veterano-de-quadra | Veterano de Quadra | partidas | não | medio | play_official_match | 50 | 300 | 500 | — | A/B — Funcional (Fase 12) |
| achv-centuriao | Centurião | partidas | não | medio | play_official_match | 100 | 500 | 1000 | — | A/B — Funcional (Fase 12) |
| achv-maratonista | Maratonista | partidas | não | dificil | play_official_match | 250 | 1500 | 3000 | — | A/B — Funcional (Fase 12) |
| achv-lenda-das-quadras | Lenda das Quadras | partidas | não | extremo | play_official_match | 500 | 5000 | 10000 | Maratonista Eterno | A/B — Funcional (Fase 12) |
| achv-imortal-do-padel | Imortal do Padel | partidas | não | lendario | play_official_match | 1000 | 20000 | 50000 | Imortal; O Imortal | A/B — Funcional (Fase 12) |
| achv-primeira-vitoria | Primeira Vitória | partidas | não | facil | win_official_match | 1 | 50 | 100 | — | A/B — Funcional (Fase 12) |
| achv-em-sequencia | Em Sequência | partidas | não | medio | win_streak | 5 | 200 | 400 | — | A/B — Funcional (Fase 12) |
| achv-dominador | Dominador | partidas | não | dificil | win_streak | 10 | 500 | 1000 | — | A/B — Funcional (Fase 12) |
| achv-imparavel | Imparável | partidas | não | extremo | win_streak | 20 | 2000 | 4000 | — | A/B — Funcional (Fase 12) |
| achv-maquina-implacavel | Máquina Implacável | partidas | não | lendario | win_streak | 50 | 15000 | 30000 | Invencível; O Invencível | A/B — Funcional (Fase 12) |
| achv-vencedor-iniciante | Vencedor Iniciante | partidas | não | facil | win_official_match | 25 | 150 | 300 | — | A/B — Funcional (Fase 12) |
| achv-competidor | Competidor | partidas | não | medio | win_official_match | 100 | 500 | 1000 | — | A/B — Funcional (Fase 12) |
| achv-campeao-nato | Campeão Nato | partidas | não | dificil | win_official_match | 250 | 1500 | 3000 | — | A/B — Funcional (Fase 12) |
| achv-titan | Titan | partidas | não | extremo | win_official_match | 500 | 5000 | 10000 | — | A/B — Funcional (Fase 12) |
| achv-semideus | Semideus | partidas | não | lendario | win_official_match | 1000 | 20000 | 50000 | Semideus do Padel; Semideus | A/B — Funcional (Fase 12) |
| achv-virada-epica | Virada Épica | partidas | não | dificil | comeback | 1 | 800 | 1500 | — | C — Necessita novo evento leve |
| achv-massacre-perfeito | Massacre Perfeito | partidas | não | dificil | perfect_match | 1 | 1000 | 2000 | — | C — Necessita novo evento leve |
| achv-resistencia-sobre-humana | Resistência Sobre-humana | partidas | não | extremo | long_match_win | 1 | 1200 | 2500 | — | C — Necessita novo evento leve |
| achv-rei-do-tie-break | Rei do Tie-Break | partidas | não | medio | tiebreak_win | 10 | 500 | 1000 | — | C — Necessita novo evento leve |
| achv-carrasco-de-lendas | Carrasco de Lendas | partidas | não | extremo | beat_top10 | 1 | 3000 | 6000 | Carrasco | C(feito) — Novo campo Match.opponent_rank (Fase 12) |
| achv-destruidor-de-1 | Destruidor de #1 | partidas | não | lendario | beat_rank1 | 1 | 10000 | 20000 | Destruidor de Reis; Destruidor de Reis | C(feito) — Novo campo Match.opponent_rank (Fase 12) |
| achv-apostador-de-risco | Apostador de Risco | partidas | não | dificil | risky_tactic_win | 1 | 600 | 1200 | — | C — Necessita novo evento leve |
| achv-estrategista-silencioso | Estrategista Silencioso | partidas | não | extremo | consistent_tactic | 50 | 2000 | 4000 | — | C — Necessita novo evento leve |
| achv-estreia-em-torneios | Estreia em Torneios | torneios | não | facil | join_tournament | 1 | 100 | 200 | — | A/B — Funcional (Fase 12) |
| achv-frequentador | Frequentador | torneios | não | facil | join_tournament | 10 | 300 | 500 | — | A/B — Funcional (Fase 12) |
| achv-circuitista | Circuitista | torneios | não | medio | join_tournament | 25 | 800 | 1500 | — | A/B — Funcional (Fase 12) |
| achv-globetrotter | Globetrotter | torneios | não | dificil | join_tournament | 50 | 2000 | 4000 | — | A/B — Funcional (Fase 12) |
| achv-nomade-do-padel | Nômade do Padel | torneios | não | extremo | join_tournament | 100 | 5000 | 10000 | — | A/B — Funcional (Fase 12) |
| achv-primeiro-titulo | Primeiro Título | torneios | não | medio | win_tournament | 1 | 500 | 1000 | Campeão Iniciante | A/B — Funcional (Fase 12) |
| achv-bicampeao | Bicampeão | torneios | não | medio | win_tournament | 2 | 800 | 1500 | — | A/B — Funcional (Fase 12) |
| achv-tricampeao | Tricampeão | torneios | não | medio | win_tournament | 3 | 1200 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-pentacampeao | Pentacampeão | torneios | não | dificil | win_tournament | 5 | 2000 | 4000 | Pentacampeão | A/B — Funcional (Fase 12) |
| achv-decacampeao | Decacampeão | torneios | não | dificil | win_tournament | 10 | 4000 | 8000 | Decacampeão; O Conquistador | A/B — Funcional (Fase 12) |
| achv-vinte-vezes-campeao | Vinte Vezes Campeão | torneios | não | extremo | win_tournament | 20 | 8000 | 16000 | Lenda dos Torneios; Lenda dos Torneios | A/B — Funcional (Fase 12) |
| achv-imperador | Imperador | torneios | não | lendario | win_tournament | 50 | 25000 | 50000 | Imperador do Padel; Imperador | A/B — Funcional (Fase 12) |
| achv-campeao-p2 | Campeão P2 | torneios | não | medio | win_tournament_tier | 1 | 500 | 1000 | — | C — Necessita novo evento leve |
| achv-campeao-p1 | Campeão P1 | torneios | não | dificil | win_tournament_tier | 2 | 1500 | 3000 | — | C — Necessita novo evento leve |
| achv-campeao-major | Campeão Major | torneios | não | extremo | win_tournament_tier | 3 | 5000 | 10000 | Campeão Major | C — Necessita novo evento leve |
| achv-grao-campeao | Grão-Campeão | torneios | não | extremo | win_all_tiers | 1 | 8000 | 15000 | Grão-Campeão; Grão-Campeão | C — Necessita novo evento leve |
| achv-defesa-de-trono | Defesa de Trono | torneios | não | extremo | defend_title | 1 | 3000 | 6000 | Defensor do Trono | C — Necessita novo evento leve |
| achv-triplice-coroa | Tríplice Coroa | torneios | não | lendario | triple_major | 1 | 15000 | 30000 | Tríplice Coroa; Portador da Tríplice Coroa | C — Necessita novo evento leve |
| achv-cinderela | Cinderela | torneios | não | extremo | cinderella_run | 1 | 5000 | 10000 | Cinderela | C — Necessita novo evento leve |
| achv-dominio-absoluto | Dominio Absoluto | torneios | não | extremo | flawless_tournament | 1 | 5000 | 10000 | Dominador Absoluto | C — Necessita novo evento leve |
| achv-gigante-em-quadra | Gigante em Quadra | torneios | não | lendario | major_as_beginner | 1 | 20000 | 40000 | Matador de Gigantes; Matador de Gigantes | C — Necessita novo evento leve |
| achv-primeiro-treino | Primeiro Treino | evolução | não | facil | complete_training | 1 | 50 | 100 | — | A/B — Funcional (Fase 12) |
| achv-disciplina-de-aco | Disciplina de Aço | evolução | não | medio | complete_training | 50 | 500 | 1000 | — | A/B — Funcional (Fase 12) |
| achv-treinador-nato | Treinador Nato | evolução | não | dificil | complete_training | 200 | 2000 | 4000 | — | A/B — Funcional (Fase 12) |
| achv-obcecado | Obcecado | evolução | não | extremo | complete_training | 500 | 5000 | 10000 | Obcecado por Treino | A/B — Funcional (Fase 12) |
| achv-maquina-de-treino | Máquina de Treino | evolução | não | lendario | complete_training | 1000 | 20000 | 40000 | Máquina de Treino; A Máquina | A/B — Funcional (Fase 12) |
| achv-potencia-pura | Potência Pura | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-muralha | Muralha | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-veloz-como-o-vento | Veloz como o Vento | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-genio-tatico | Gênio Tático | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-coracao-de-gelo | Coração de Gelo | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-saque-bomba | Saque Bomba | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-direita-mortal | Direita Mortal | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-esquerda-magica | Esquerda Mágica | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-voleador-perfeito | Voleador Perfeito | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-mestre-da-bandeja | Mestre da Bandeja | evolução | não | dificil | max_attribute | 100 | 1000 | 2000 | — | A/B — Funcional (Fase 12) |
| achv-perfeicao-absoluta | Perfeição Absoluta | evolução | não | lendario | all_max_attributes | 1 | 50000 | 100000 | Perfeição Absoluta; A Perfeição; Coroa da Perfeição | A/B — Funcional (Fase 12) |
| achv-nivel-lenda | Nível Lenda | evolução | não | extremo | reach_level | 5 | 10000 | 20000 | Lenda Viva; Lenda Viva | A/B — Funcional (Fase 12) |
| achv-ascensao-meteorica | Ascensão Meteórica | evolução | não | extremo | fast_level_up | 1 | 3000 | 6000 | — | C — Necessita novo evento leve |
| achv-polivalente | Polivalente | evolução | não | extremo | hybrid_max | 1 | 2500 | 5000 | — | C — Necessita novo evento leve |
| achv-social-butterfly | Social Butterfly | social | não | facil | make_friend | 10 | 200 | 400 | — | C — Necessita novo evento leve |
| achv-popular | Popular | social | não | medio | make_friend | 25 | 600 | 1200 | — | C — Necessita novo evento leve |
| achv-ima-de-pessoas | Ímã de Pessoas | social | não | dificil | make_friend | 50 | 1500 | 3000 | — | C — Necessita novo evento leve |
| achv-rival-eterno | Rival Eterno | social | não | medio | create_rivalry | 1 | 400 | 800 | — | C — Necessita novo evento leve |
| achv-mentor | Mentor | social | não | dificil | become_mentor | 1 | 800 | 1500 | — | C — Necessita novo evento leve |
| achv-quimica-perfeita | Química Perfeita | social | não | dificil | max_chemistry | 100 | 2000 | 4000 | Dupla Perfeita | C — Necessita novo evento leve |
| achv-parceiro-para-a-vida | Parceiro para a Vida | social | não | extremo | long_partner | 100 | 5000 | 10000 | Parceiro Eterno; Parceiro Eterno | C — Necessita novo evento leve |
| achv-coracao-partido | Coração Partido | social | não | medio | end_partnership | 1 | 500 | 1000 | — | C — Necessita novo evento leve |
| achv-inimigo-intimo | Inimigo Íntimo | social | não | dificil | max_hate | 1 | 1500 | 3000 | — | C — Necessita novo evento leve |
| achv-pacificador | Pacificador | social | não | extremo | reconcile | 5 | 2500 | 5000 | Pacificador | C — Necessita novo evento leve |
| achv-lider-de-torcida | Líder de Torcida | social | não | extremo | mega_fanbase | 1000000 | 5000 | 10000 | Líder de Multidões | C — Necessita novo evento leve |
| achv-viral | Viral | social | não | dificil | viral_post | 100000 | 1000 | 2000 | — | C — Necessita novo evento leve |
| achv-primeiro-lucro | Primeiro Lucro | economia | não | facil | reach_coins | 5000 | 100 | 0 | — | A/B — Funcional (Fase 12) |
| achv-confortavel | Confortável | economia | não | medio | reach_coins | 50000 | 500 | 0 | — | A/B — Funcional (Fase 12) |
| achv-rico | Rico | economia | não | dificil | reach_coins | 250000 | 2000 | 0 | — | A/B — Funcional (Fase 12) |
| achv-milionario | Milionário | economia | não | extremo | reach_coins | 1000000 | 10000 | 0 | Milionário; Milionário | A/B — Funcional (Fase 12) |
| achv-magnata | Magnata | economia | não | lendario | reach_coins | 5000000 | 50000 | 0 | Magnata do Padel; Magnata | A/B — Funcional (Fase 12) |
| achv-primeiro-imovel | Primeiro Imóvel | economia | não | facil | buy_property | 1 | 200 | 500 | — | A/B — Funcional (Fase 12) |
| achv-empresario | Empresário | economia | não | dificil | buy_property | 5 | 1500 | 3000 | — | A/B — Funcional (Fase 12) |
| achv-magnata-imobiliario | Magnata Imobiliário | economia | não | extremo | buy_property | 10 | 4000 | 8000 | Magnata Imobiliário | A/B — Funcional (Fase 12) |
| achv-investidor | Investidor | economia | não | facil | make_investment | 1 | 200 | 300 | — | A/B — Funcional (Fase 12) |
| achv-especulador | Especulador | economia | não | medio | make_investment | 5 | 800 | 1500 | — | A/B — Funcional (Fase 12) |
| achv-wall-street-do-padel | Wall Street do Padel | economia | não | dificil | make_investment | 10 | 2000 | 4000 | — | A/B — Funcional (Fase 12) |
| achv-primeiro-patrocinador | Primeiro Patrocinador | economia | não | facil | sign_sponsor | 1 | 200 | 500 | — | A/B — Funcional (Fase 12) |
| achv-cobicado | Cobiçado | economia | não | dificil | multi_sponsor | 3 | 1500 | 3000 | — | A/B — Funcional (Fase 12) |
| achv-embaixador | Embaixador | economia | não | extremo | gold_sponsor | 1 | 3000 | 6000 | Embaixador de Marca | C — Necessita novo evento leve |
| achv-comprador-compulsivo | Comprador Compulsivo | economia | não | extremo | spending_spree | 500000 | 3000 | 0 | — | G — Ruim/artificial (candidata a revisão) |
| achv-negociador-implacavel | Negociador Implacável | economia | não | dificil | great_deal | 50 | 1000 | 2000 | — | G — Ruim/artificial (candidata a revisão) |
| achv-falido-e-renascido | Falido e Renascido | economia | não | extremo | bankruptcy_recovery | 1 | 2500 | 5000 | Fênix Financeira | C — Necessita novo evento leve |
| achv-cacador-de-barganhas | Caçador de Barganhas | mercado | não | medio | buy_flash_sale | 10 | 500 | 1000 | — | G — Ruim/artificial (candidata a revisão) |
| achv-investidor-de-mercado | Investidor de Mercado | mercado | não | dificil | market_profit | 200 | 1500 | 3000 | — | C — Necessita novo evento leve |
| achv-colecionador-de-reliquias | Colecionador de Relíquias | mercado | não | extremo | buy_historical | 1 | 5000 | 10000 | Guardião da História | C — Necessita novo evento leve |
| achv-todos-os-heritage | Todos os Heritage | mercado | não | lendario | all_historical | 10 | 50000 | 100000 | Guardião do Padel; Guardião do Padel; Manto do Guardião | C — Necessita novo evento leve |
| achv-comprador-de-panico | Comprador de Pânico | mercado | não | dificil | buy_scarce | 1 | 800 | 1500 | — | C — Necessita novo evento leve |
| achv-oportunista | Oportunista | mercado | não | dificil | buy_deep_discount | 5 | 1000 | 2000 | — | G — Ruim/artificial (candidata a revisão) |
| achv-primeira-compra | Primeira Compra | coleção | não | facil | buy_item | 1 | 50 | 100 | — | C — Necessita novo evento leve |
| achv-colecionador | Colecionador | coleção | não | medio | own_items | 25 | 500 | 1000 | — | A/B — Funcional (Fase 12) |
| achv-acumulador | Acumulador | coleção | não | dificil | own_items | 50 | 1500 | 3000 | — | A/B — Funcional (Fase 12) |
| achv-museu-pessoal | Museu Pessoal | coleção | não | extremo | own_items | 100 | 4000 | 8000 | Colecionador Mestre | A/B — Funcional (Fase 12) |
| achv-arsenal-completo | Arsenal Completo | coleção | não | lendario | own_items | 250 | 15000 | 30000 | Arsenal Completo; O Colecionador | A/B — Funcional (Fase 12) |
| achv-toque-de-midas | Toque de Midas | coleção | não | medio | own_legendary | 1 | 500 | 1000 | — | A/B — Funcional (Fase 12) |
| achv-rei-mida | Rei Mida | coleção | não | dificil | own_legendary | 10 | 2500 | 5000 | — | A/B — Funcional (Fase 12) |
| achv-mito-vivo | Mito Vivo | coleção | não | extremo | own_mythic | 1 | 5000 | 10000 | Portador de Mitos | A/B — Funcional (Fase 12) |
| achv-exclusividade | Exclusividade | coleção | não | extremo | own_exclusive | 1 | 5000 | 10000 | — | A/B — Funcional (Fase 12) |
| achv-armeiro | Armeiro | coleção | não | medio | own_rackets | 20 | 800 | 1500 | — | C — Necessita novo evento leve |
| achv-sapateiro | Sapateiro | coleção | não | medio | own_shoes | 10 | 600 | 1200 | — | C — Necessita novo evento leve |
| achv-guarda-roupa | Guarda-Roupa | coleção | não | medio | own_apparel | 15 | 600 | 1200 | — | C — Necessita novo evento leve |
| achv-tecnologo | Tecnólogo | coleção | não | dificil | own_tech | 5 | 1000 | 2000 | — | C — Necessita novo evento leve |
| achv-fabricante-fiel | Fabricante Fiel | coleção | não | medio | brand_loyalty | 10 | 800 | 1500 | — | C — Necessita novo evento leve |
| achv-pau-para-toda-obra | Pau para Toda Obra | coleção | não | medio | all_categories | 1 | 600 | 1200 | — | A/B — Funcional (Fase 12) |
| achv-rainbow-collection | Rainbow Collection | coleção | não | dificil | all_rarities | 1 | 2000 | 4000 | Colecionador Arco-Íris | C — Necessita novo evento leve |
| achv-durabilidade-zero | Durabilidade Zero | coleção | não | medio | item_broken | 1 | 300 | 600 | — | C — Necessita novo evento leve |
| achv-veterano-de-equipamentos | Veterano de Equipamentos | coleção | não | dificil | long_equipped | 100 | 1000 | 2000 | — | C — Necessita novo evento leve |
| achv-estudante-de-historia | Estudante de História | história | não | facil | read_history | 10 | 200 | 400 | — | C — Necessita novo evento leve |
| achv-historiador | Historiador | história | não | medio | read_history | 39 | 1000 | 2000 | — | C — Necessita novo evento leve |
| achv-visitante-do-hall-da-fama | Visitante do Hall da Fama | história | não | facil | visit_hof | 1 | 100 | 200 | — | C — Necessita novo evento leve |
| achv-estudioso-das-lendas | Estudioso das Lendas | história | não | medio | read_hof_bio | 5 | 500 | 1000 | — | C — Necessita novo evento leve |
| achv-especialista-em-lendas | Especialista em Lendas | história | não | dificil | read_hof_bio | 20 | 2000 | 4000 | — | C — Necessita novo evento leve |
| achv-guardiao-da-memoria | Guardião da Memória | história | não | lendario | all_origins | 7 | 30000 | 60000 | Guardião da Memória; Guardião da Memória | C — Necessita novo evento leve |
| achv-conhece-os-fundadores | Conhece os Fundadores | história | não | facil | read_founder | 1 | 300 | 600 | — | C — Necessita novo evento leve |
| achv-especialista-em-decadas | Especialista em Décadas | história | não | medio | all_decades | 7 | 1000 | 2000 | — | C — Necessita novo evento leve |
| achv-nascido-para-vencer | Nascido para Vencer | carreira | não | facil | create_profile | 1 | 50 | 100 | — | A/B — Funcional (Fase 12) |
| achv-primeiro-dia | Primeiro Dia | carreira | não | facil | advance_day | 1 | 50 | 100 | — | A/B — Funcional (Fase 12) |
| achv-uma-semana | Uma Semana | carreira | não | facil | advance_day | 7 | 100 | 200 | — | A/B — Funcional (Fase 12) |
| achv-um-mes | Um Mês | carreira | não | facil | advance_day | 30 | 300 | 500 | — | A/B — Funcional (Fase 12) |
| achv-um-ano | Um Ano | carreira | não | medio | advance_day | 365 | 2000 | 4000 | — | A/B — Funcional (Fase 12) |
| achv-meia-decada | Meia Década | carreira | não | dificil | advance_day | 1825 | 8000 | 16000 | Veterano de 5 Anos | A/B — Funcional (Fase 12) |
| achv-decada-de-carreira | Década de Carreira | carreira | não | extremo | advance_day | 3650 | 30000 | 60000 | Década de Dedicação; Veterano de Década | A/B — Funcional (Fase 12) |
| achv-auge | Auge | carreira | não | medio | reach_age | 28 | 500 | 1000 | — | A/B — Funcional (Fase 12) |
| achv-veterano | Veterano | carreira | não | dificil | reach_age | 35 | 1500 | 3000 | — | A/B — Funcional (Fase 12) |
| achv-lenda-madura | Lenda Madura | carreira | não | extremo | reach_age | 40 | 5000 | 10000 | Lenda Madura | A/B — Funcional (Fase 12) |
| achv-top-100 | Top 100 | carreira | não | medio | reach_rank | 100 | 800 | 1500 | — | A/B — Funcional (Fase 12) |
| achv-top-50 | Top 50 | carreira | não | dificil | reach_rank | 50 | 2000 | 4000 | — | A/B — Funcional (Fase 12) |
| achv-top-10 | Top 10 | carreira | não | extremo | reach_rank | 10 | 5000 | 10000 | Top 10 Mundial; Top 10 Mundial | A/B — Funcional (Fase 12) |
| achv-top-3 | Top 3 | carreira | não | extremo | reach_rank | 3 | 10000 | 20000 | Pódio Mundial; Pódio Mundial | A/B — Funcional (Fase 12) |
| achv-numero-1-do-mundo | Número 1 do Mundo | carreira | não | lendario | reach_rank | 1 | 50000 | 100000 | #1 do Mundo; #1 do Mundo; Coroa de #1 | A/B — Funcional (Fase 12) |
| achv-indestrutivel | Indestrutível | carreira | não | dificil | injury_free | 100 | 1000 | 2000 | — | C — Necessita novo evento leve |
| achv-fenix | Fênix | carreira | não | medio | recover_injury | 5 | 500 | 1000 | — | A/B — Funcional (Fase 12) |
| achv-maratonista-de-energia | Maratonista de Energia | carreira | não | medio | full_energy_streak | 7 | 500 | 1000 | — | C — Necessita novo evento leve |
| achv-encontrou-um-guia | Encontrou um Guia | carreira | não | facil | hire_coach | 1 | 200 | 400 | — | A/B — Funcional (Fase 12) |
| achv-relacao-de-confianca | Relação de Confiança | carreira | não | dificil | max_coach_affinity | 100 | 1500 | 3000 | — | A/B — Funcional (Fase 12) |
| achv-mestre-e-aprendiz | Mestre e Aprendiz | carreira | não | extremo | long_coach | 500 | 4000 | 8000 | Dinastia de Treino | A/B — Funcional (Fase 12) |
| achv-investidor-em-infraestrutura | Investidor em Infraestrutura | carreira | não | facil | upgrade_facility | 1 | 200 | 400 | — | A/B — Funcional (Fase 12) |
| achv-instalacoes-de-elite | Instalações de Elite | carreira | não | extremo | max_all_facilities | 1 | 10000 | 20000 | Instalações de Elite | C — Necessita novo evento leve |
| achv-geracao-de-legado | Geração de Legado | carreira | não | extremo | retire | 1 | 5000 | 10000 | Fundador de Dinastia | D — Depende de sistema inexistente (aposentadoria/gerações) |
| achv-dinastia | Dinastia | carreira | não | lendario | generations | 3 | 25000 | 50000 | Fundador de Dinastia; Patriarca | D — Depende de sistema inexistente (aposentadoria/gerações) |
| achv-legado-eterno | Legado Eterno | carreira | não | lendario | generations | 5 | 100000 | 200000 | Legado Eterno; O Eterno; Manto da Eternidade | D — Depende de sistema inexistente (aposentadoria/gerações) |
| achv-152 | ??? | secreto | sim | lendario | secret_1 | 1 | 5000 | 10000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-153 | ??? | secreto | sim | lendario | secret_2 | 1 | 5000 | 10000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-154 | ??? | secreto | sim | lendario | secret_3 | 1 | 8000 | 15000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-155 | ??? | secreto | sim | lendario | secret_4 | 1 | 10000 | 20000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-156 | ??? | secreto | sim | lendario | secret_5 | 1 | 15000 | 30000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-157 | ??? | secreto | sim | lendario | secret_6 | 1 | 20000 | 40000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-158 | ??? | secreto | sim | lendario | secret_7 | 1 | 50000 | 100000 | ???; ???; ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-159 | ??? | secreto | sim | lendario | secret_8 | 1 | 30000 | 60000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-160 | ??? | secreto | sim | lendario | secret_9 | 1 | 10000 | 20000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-161 | ??? | secreto | sim | lendario | secret_10 | 1 | 25000 | 50000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-162 | ??? | secreto | sim | lendario | secret_11 | 1 | 15000 | 30000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-163 | ??? | secreto | sim | lendario | secret_12 | 1 | 20000 | 40000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-164 | ??? | secreto | sim | lendario | secret_13 | 1 | 12000 | 25000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-165 | ??? | secreto | sim | lendario | secret_14 | 1 | 18000 | 35000 | ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-166 | ??? | secreto | sim | lendario | secret_15 | 1 | 40000 | 80000 | ???; ???; ??? | F — Obsoleta (placeholder vazio arquivado) |
| achv-grande-slam-do-padel | Grande Slam do Padel | lendário | não | lendario | grand_slam | 1 | 50000 | 100000 | Grande Slam; Grande Slam; Troféu Grande Slam | C — Necessita novo evento leve |
| achv-temporada-perfeita | Temporada Perfeita | lendário | não | lendario | perfect_season | 1 | 100000 | 200000 | Temporada Perfeita; A Perfeição; Coroa da Perfeição | C — Necessita novo evento leve |
| achv-rainha-de-duplas | Rainha de Duplas | lendário | não | lendario | perfect_duo | 100 | 50000 | 100000 | Dupla Lendária; Dupla Lendária | C — Necessita novo evento leve |
| achv-imortal-das-quadras | Imortal das Quadras | lendário | não | lendario | rank1_at_40 | 1 | 100000 | 200000 | Imortal; O Imortal; Manto do Imortal | C — Necessita novo evento leve |
| achv-renascimento | Renascimento | lendário | não | lendario | comeback_rank | 1 | 80000 | 160000 | Fênix do Ranking; Fênix do Ranking | C — Necessita novo evento leve |
| achv-dominio-de-uma-era | Domínio de Uma Era | lendário | não | lendario | rank1_year | 365 | 100000 | 200000 | Domínio de Uma Era; O Dominador; Cetro do Dominador | C — Necessita novo evento leve |
| achv-multiverso-do-padel | Multiverso do Padel | lendário | sim | lendario | multi_generation_champ | 10 | 500000 | 1000000 | O Eterno; O Eterno; Coroa da Eternidade | D — Depende de sistema inexistente (aposentadoria/gerações) |
| achv-o-inatingivel | O Inatingível | lendário | sim | lendario | all_achievements | 1 | 1000000 | 2000000 | O Inatingível; O Inatingível; Coroa do Inatingível | D — Depende de sistema inexistente (future_system; achado na revisão da UI, evitando "???" impossível — Parte 28) |

## Addendum — Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 3/10)

Catálogo: 175 → **180** entradas (+5). Funcionais: 90 → **100** (+10).

**Parte 3 — 5 novos degraus na escada de reach_rank** (nenhum trigger novo, só preenchendo os degraus que faltavam entre Top 100 e a faixa real de um iniciante, ~#900-#1000): Top 500, Top 250, Top 30, Top 20, Top 5. Junto com as 5 já existentes (Top 100, Top 50, Top 10, Top 3, Número 1 do Mundo), a ladder completa passa a ser: 500→250→100→50→30→20→10→5→3→1 (10 degraus; o briefing pediu 500→250→100→50→30→20→10→5→#1, 9 degraus — o "Top 3" pré-existente foi mantido por não ser duplicata de nada, não removido). `achievementRelevance.js`/`findNextRelevantAchievements` e `achievementEngine.js`/`findNextLockedAchievement` já ordenavam por `percent` (não pelo threshold cru), o que já resolve a direção invertida do reach_rank — **zero mudança de código nessas duas funções**, confirmado com pipeline real em `test:ranking-milestone-ladder` (39 gates, incluindo os 9 exemplos numéricos do briefing e todos os 9 boundaries exatos, sem off-by-one).

**Parte 10 — reclassificação de C para A: `own_rackets`, `own_shoes`, `own_apparel`, `own_tech`, `all_rarities`.** Na Fase 12 estas 5 entradas foram documentadas como "C — necessita novo evento leve", mas a auditoria desta fase encontrou que o dado já existia: `fetchInventoryStats` (achievementContext.js) já cruzava `PlayerInventory` com `ShopItem.category`/`ShopItem.rarity` para alimentar `own_items`/`own_legendary`/`own_mythic`/`own_exclusive`/`all_categories` (já funcionais) — só não quebrava a contagem por categoria/raridade específica. Adicionado: contagem por categoria (`rackets`/`shoes`/`apparel`/`tech`, mapeadas das categorias canônicas já usadas pelo catálogo de loja — `raquete`/`tenis`/`roupa`/`acessorio_tec`, `storeCatalog.js`) e `totalRaritiesInCatalog` (mesmo padrão de `totalCategoriesInCatalog` já usado por `all_categories`). Nenhum campo novo persistido, nenhuma mecânica nova — leitura adicional sobre a mesma consulta que já rodava. "Rainbow Collection" (`all_rarities`, `visibility:'oculto'`) deixa de ser uma secreta sem trigger real e passa a ser uma secreta genuína e alcançável.

As demais entradas "C" (leituras narrativas de partida como `comeback`/`perfect_match`, o cluster de relacionamento, `read_history`/`visit_hof`, o cluster de mercado/histórico) permanecem C — continuam precisando de um contador/flag incremental que não existe hoje; não implementadas nesta fase por decisão de escopo (Parte 0: mudanças pequenas e testáveis, não uma varredura ampla do catálogo). As 4 candidatas G (`spending_spree`-like) permanecem sinalizadas, sem remoção.

**Nota sobre a citação do briefing** ("Fase 12 encontrou ~144 sem trigger"): esse número é o baseline PRÉ-Fase-12 (175 catalogadas − 31 funcionais = 144). O estado real ao final da Fase 12 já era 61 C-tier (+ 15 F-tier arquivadas + 5 D-tier future_system + 4 G-tier sinalizadas = 85 não-funcionais de 175, 90 funcionais). A Fase 13 parte desse estado pós-Fase-12, não do baseline citado no briefing.
