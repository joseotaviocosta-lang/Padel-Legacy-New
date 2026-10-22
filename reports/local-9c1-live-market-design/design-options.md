# LOCAL-9C.1 — Alternativas de design do Mercado Vivo

> Proposta para aprovação. Nada implementado. Evidências: `catalog-audit.json`,
> `category-analysis.json`, `brand-analysis.json`, `rarity-economics.json`,
> `equipment-impact.json`, `economy-progression.json`.
> **[atual]** = medido no HEAD `b24eef3`. **[sugerido]** = hipótese a validar no simulador.

## O que qualquer alternativa precisa resolver

| # | Problema [atual] | Evidência |
|---|---|---|
| 1 | Compra fora do domínio, não atômica, com saldo absoluto | sondas A–F, `tests.json` |
| 2 | Compras não contam para 14 conquistas de coleção | `inventory-achievement-probe.json` |
| 3 | 31 itens perdem metade do bônus por chave órfã; 4 linhas de raquete inteiras | `catalog-audit.json › issues.droppedSourceKeys` |
| 4 | Incomum dominado pelo comum nas 7 categorias em que existe | `issues.incomumNoBetterThanComum` |
| 5 | 20 inversões de raridade (item mais raro, bônus menor) | `issues.rarityInversions` |
| 6 | Dois catálogos sobrepostos na mesma raridade (itens no piso × itens da Fase 1 com o dobro do bônus) | `issues.sameRaritySamePriceBandSpread`, `priceAtFloor` (39) |
| 7 | Custo do kit cresce 2,7 / 3,1 / 4,7 / 3,1 / 1,9× por degrau; bônus 1,1 / 2,4 / 2,0 / 1,4 / 1,3× | `rarity-economics.json` |
| 8 | Acima do raro, o kit leva de 27 a 390 meses de sobra de caixa | `economy-progression.json › timeToBuy` |
| 9 | Relíquias +12 a +43 por item, fora da escala (melhor item da Loja: +12) | `issues.relicsOutOfScale` |
| 10 | Marcas sem identidade deliberada; 15 das 24 têm ≤ 2 itens | `brand-analysis.json` |
| 11 | Loja estática: 125 itens listados desde o dia 0, rotação mensal por sorteio fixo | `availabilityByStage` |

## Modelo A — Conservador

**O que muda**: só números e defeitos. Catálogo, marcas, categorias e tela ficam.

- Serviço canônico de compra (9C.2-A) e contagem de coleção (9C.2-B).
- Chaves órfãs corrigidas; incomum com degrau próprio; uma tabela de preço por (categoria, raridade).
- Relíquias trazidas para a escala do exclusivo (≤ +12) ou sem bônus.
- Ordenação "Recomendados" passa a esconder o que está 2+ degraus acima.

| Critério | Avaliação |
|---|---|
| Benefícios | Corrige 1–9 com pouco código. Mantém tudo o que o jogador já conhece |
| Desvantagens | Não resolve 10 e 11: marcas continuam nomes; a Loja continua um catálogo de 125 itens com cadeados |
| Complexidade | Baixa: dados em `storeCatalog.js`/`marketEngine.js`, um serviço novo |
| Riscos | Baixos. Mudança de bônus chega aos saves pela reconciliação por nome |
| Economia | Previsível: só preço por ponto. Libera as recompensas de coleção (até 79 mil, ver plano B) |
| Progressão | Equipamento ganha degraus coerentes; teto do kit definido por número |
| Mobile | Sem mudança (mesma tela) |
| Saves | Sem migração |
| 9D | Nenhuma dependência nova |
| Escopo | ~3 etapas (A, B, C+D) |

## Modelo B — Mercado Vivo Equilibrado (recomendado)

**O que muda**: A + estrutura de mercado acompanhando a carreira, sem tick diário.

- **Vitrine por estágio**: o estágio econômico que o jogo já calcula (`getCareerEconomyStage`) define o que aparece; o próximo estágio aparece como prévia. Catálogo completo vira filtro secundário.
- **Escada de raridade única** com retorno decrescente moderado e incomum com função.
- **Categorias com papel**: raquete principal, tênis e grip secundários, demais pequenas; colecionáveis sem força esportiva.
- **Marcas com arquétipo**, partindo do que o catálogo já sugere (abaixo), num registro de marca que também atende a 9D.
- **Destaques do mês** determinísticos (3–4 itens por `career_id` + mês). Sem eventos aleatórios, sem estoque variável.
- **Relíquias fora da Loja** como sistema de Legado/Museu (ver §14 do documento principal).

Arquétipos que o catálogo atual já sugere (perfil de atributos em `brand-analysis.json`):

| Marca [atual] | Atributos dominantes [atual] | Arquétipo [sugerido] |
|---|---|---|
| Padel Start | smash 48%, voleio 44%; mais barata | Acessível (entrada, custo-benefício, só até raro/épico) |
| Bullpadel | smash 23%, bandeja 23% | Potência premium |
| Nox | voleio 31%, defesa 24% | Controle técnico |
| Head | revés 39%, forehand 36% | Equilibrada / fundo de quadra |
| Adidas | agilidade 38% | Mobilidade (tênis, roupa) |
| Joma | defesa 70% | Defensiva acessível |
| Siux | smash 50%, forehand 50% | Desafiante ofensiva |
| Babolat | defesa 35%, smash 35% | Contra-ataque |
| Wilson | controle emocional 26%, voleio 23% | Clássica / longo prazo |

As 15 marcas com 1–2 itens (Garmin, Therabody, PlaySight, Pulse, NeuroCourt etc.) viram linhas de "tecnologia e recuperação" ou são fundidas. **Nenhuma marca nova.**

| Critério | Avaliação |
|---|---|
| Benefícios | Resolve 1–11. Início com poucas opções; novidades a cada estágio; marcas com escolha real (atributo × preço); sem microgestão |
| Desvantagens | Mais trabalho de dados (registro de marca, papéis de categoria). Exige decidir licenciamento (D1) antes de dar personalidade pública a marcas reais |
| Complexidade | Média: serviço de compra, registro de marca, filtro de vitrine, ajustes de tela |
| Riscos | Balanceamento cruzado com treino (equipamento estável desde a 9B); vitrine que esconde demais. Mitigação: teto do kit por estágio validado no simulador |
| Economia | Compras acompanham a renda; o excedente do econômico (70 mil em 2 anos, E1-03) ganha destino sem obrigar compra |
| Progressão | Equipamento soma por cima da base (9B); alvo de teto ≤ +5 OVR declarados no topo |
| Mobile | Melhora: vitrine de 20–50 itens em vez de 125; nenhum I/O novo por card |
| Saves | Sem migração obrigatória (campos opcionais, reconciliação por nome). Renomear item exige `catalog_key` |
| 9D | Consome o registro de marca e o `buyShopItem` com `source`; desconto e rotação de patrocínio continuam |
| Escopo | 9 etapas pequenas (`implementation-plan.md`) |

## Modelo C — Mercado Vivo Avançado

**O que muda**: B + coleções anuais, lançamentos, estoque variável, ofertas relâmpago, mercado de usados, personalização, contratos comerciais integrados e exclusivos de patrocínio.

| Critério | Avaliação |
|---|---|
| Benefícios | Maior sensação de "mundo vivo"; mais assunto para o jogador avançado |
| Desvantagens | Microgestão (ofertas que somem, estoque que acaba). Muito conteúdo novo a balancear. Parte das peças já existe e está **morta** hoje (`processMarketTick` sem chamador, eventos com `Math.random`, durabilidade que nunca muda) — sinal de que o jogo não sustentou essa complexidade |
| Complexidade | Alta: tick diário ou mensal com estado, RNG semeado por carreira, novas entidades (usados, coleções), regras contratuais da 9D |
| Riscos | Determinismo (eventos aleatórios), custo de gravação ao avançar dia (cada tick grava histórico de preço de N itens), save maior, dependência forte da 9D |
| Economia | Difícil de prever: descontos de 40–50% e mercado de usados criam arbitragem |
| Progressão | Itens exclusivos de contrato podem virar obrigatórios |
| Mobile | Pior: mais gravações por dia avançado e mais telas |
| Saves | Entidades novas; provável invalidação de saves de desenvolvimento |
| 9D | Depende dela por inteiro (exclusivos, contratos comerciais) |
| Escopo | 9C.2 inteiro + boa parte da 9D; ≥ 2× o do B |

## Comparação

| | A | B | C |
|---|---|---|---|
| Corrige defeitos (1–2) | Sim | Sim | Sim |
| Raridade coerente (3–8) | Sim | Sim | Sim |
| Relíquias (9) | Escala | Sistema próprio | Sistema próprio |
| Marcas com escolha (10) | Não | Sim | Sim |
| Loja acompanha a carreira (11) | Parcial | Sim | Sim |
| Microgestão | Nenhuma | Baixa (destaques mensais) | Alta |
| Custo de gravação por dia avançado | 0 | 0 | > 0 |
| Dependência da 9D | Nenhuma | Interface de dados | Total |
| Risco | Baixo | Médio | Alto |

**Recomendação: Modelo B**, com as peças do C que o B não impede adotar depois (coleções anuais como rótulo de destaque, usados) deixadas para depois da 9D e de uma nova medição.
