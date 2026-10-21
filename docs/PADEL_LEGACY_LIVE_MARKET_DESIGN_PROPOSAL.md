# PADEL LEGACY — MERCADO VIVO DE MARCAS, EQUIPAMENTOS E PATROCÍNIOS

> **Status: proposta de design (LOCAL-9A). Nada implementado.**
> Base factual: `docs/LOCAL_9A_EQUIPMENT_SPONSORSHIP_ECONOMY_AUDIT.md`.
> Substitui o backlog `docs/FUTURE_LIVE_BRANDS_SPONSORSHIP_MARKET.md` (LOCAL-8E) como ponto de partida.
> Valores marcados **[atual]** foram extraídos do código. Valores marcados **[sugerido]** são hipóteses de design e precisam de validação por simulação (LOCAL-9F) antes de virar regra.

## 1. Visão

Hoje, Loja e Patrocínios são duas telas que mal se conhecem. A única ponte é um desconto de 15% e a garantia de que o item da marca patrocinadora fica na rotação. O equipamento funciona no motor, mas se apoia num modelo que anula o próprio efeito com o tempo (9A-01).

O Mercado Vivo faz da **relação com marcas um eixo de carreira**:

- marcas com identidade, que procuram atletas com um perfil;
- contratos que combinam dinheiro, equipamento e obrigações, e que o jogador compara de verdade;
- equipamento com papel claro: uma ajuda real e limitada, que nunca substitui treino nem parceiro;
- um mercado que muda com a temporada, com a reputação e com os resultados.

**Princípio de balanceamento.** O dinheiro compra vantagem marginal, não vitória. Treino e parceiro continuam sendo os maiores fatores de desempenho.

**Princípio de arquitetura.** Aproveitar o que existe: `SPONSOR_CATALOG`, `storeCatalog`, `PlayerContract`, `PlayerInventory`, `computeItemPrice`, a rotação mensal e o fechamento do mês. A única mudança estrutural indispensável é separar **atributo-base** de **modificador de equipamento** (§5.1).

## 2. Marcas

### 2.1 Licenciamento: decisão pendente

**[atual]** O jogo já usa nomes reais na Loja e nos patrocínios: Nox, Bullpadel, Adidas, Head, Wilson, Babolat, Siux, Joma, Asics, Mizuno, Garmin, Playtomic, Movistar, Therabody, Red Bull, Estrella Damm, Cupra, Iberdrola, Decathlon e Varlion.

| Alternativa | Vantagens | Desvantagens |
|---|---|---|
| A. Marcas reais licenciadas | Autenticidade máxima | Custo, negociação marca a marca, restrições de uso e de imagem; inviável antes do lançamento |
| B. Marcas fictícias inspiradas em arquétipos | Sem risco de marca registrada; liberdade criativa e de balanceamento (uma marca pode ser "pior" sem problema) | Menos reconhecimento imediato |
| C. Fictícias na versão pública e reais só com licença | Caminho de upgrade | Dois conjuntos de conteúdo para manter |

**Recomendação: B**, com uma camada de dados de marca (§5.2) que permita trocar nomes e identidades sem tocar nas regras. Esta não é uma avaliação jurídica: a decisão final deve passar por quem responde pelo produto e, se for o caso, por orientação legal.

### 2.2 Arquétipos de marca **[sugerido]**

Os nomes reais aparecem só como referência de design.

| Arquétipo | Referência | Posicionamento | Linha principal | Atleta que procura | Faixa de contrato | Benefício típico |
|---|---|---|---|---|---|---|
| Potência premium | Bullpadel | Topo, agressiva | Raquetes de potência, calçado | Ofensivo, top 100 | Alta | Linha exclusiva e bônus por título |
| Controle técnico | Nox | Topo, técnica | Raquetes de controle e grip | Tático ou defensivo, consistente | Média–alta | Equipamento superior e menor salário |
| Esportiva global | Adidas | Massa e imagem | Vestuário, calçado, raquete híbrida | Popular (fãs), qualquer estilo | Média–alta | Bônus de fãs e de mídia, desconto amplo |
| Tradição | Head, Wilson | Estável, longo prazo | Raquete híbrida, bolsas | Veterano consistente | Média | Contratos longos e renovação fácil |
| Desafiante | Siux, Babolat | Em ascensão | Raquete de potência ou contra-ataque | Jovem promissor | Baixa–média | Contrato de entrada, cresce com resultado |
| Varejo | Decathlon | Acessível | Itens de entrada | Iniciante | Baixa | Desconto na Loja inteira, sem exclusividade |
| Comercial (sem equipamento) | Red Bull, Cupra, Iberdrola | Patrocínio de imagem | — | Popular e vencedor | Alta em dinheiro | Só dinheiro e metas de mídia; não ocupa slot de equipamento |
| Tecnologia e saúde | Garmin, Therabody | Desempenho | Tecnologia, recuperação | Qualquer | Média | Efeito não ligado a atributo (recuperação, informação) |

Cada marca terá: reputação, estágio mínimo, estilos preferidos, slot de contrato, linhas de produto, faixa salarial, benefícios possíveis e uma "personalidade" de negociação (aceita contrato curto, exige exclusividade etc.).

## 3. Equipamentos

### 3.1 Papel de cada categoria **[sugerido]**

**[atual]** As 9 categorias somam bônus de atributo, um item por categoria. Isso dá até +8,8 OVR no catálogo e +15,5 com relíquias. Os efeitos são repetitivos: controle emocional e estratégia aparecem em mais de 30 itens.

| Categoria | Proposta | Motivo |
|---|---|---|
| Raquete | **Principal.** Bônus em 2–3 atributos de golpe conforme formato e linha | É o equipamento que define o jogo |
| Calçado | **Secundário.** Agilidade e defesa | Papel físico distinto |
| Grip | **Menor.** Um atributo de golpe | Ajuste fino, barato |
| Vestuário, bolsa | **Sem atributo.** Cosmético, mais exigência e visibilidade de patrocínio | Evita "+1 em estratégia" sem sentido |
| Tecnologia, recuperação | **Efeito de sistema, não de atributo:** recuperação de energia ou fadiga, informação tática | Diferencia sem inflar o OVR |
| Bolas | **Consumível de treino** (pequeno bônus de ganho no treino) ou remover | Hoje é um "atributo" sem lógica |
| Colecionáveis e relíquias | **Prestígio sem efeito esportivo:** reputação, fãs, museu do atleta | Hoje são os itens mais fortes do jogo (9A-04) |

Isso responde à orientação de não criar itens sem função: todo item tem **um** papel claro.

### 3.2 Relação entre preço, raridade e desempenho **[sugerido]**

- **Teto total do modificador de equipamento por estágio** (§6.2). O equipamento ajuda, mas não passa do teto.
- **Retorno decrescente:** cada degrau de raridade custa ~2,5–3× o anterior e dá menos ganho marginal. **[atual]** O kit completo custa de 1,9× a 4,7× o degrau anterior (2.042 → 5.506 → 16.956 → 80.450 → 253.200 → 476.400), e o bônus cresce de forma quase linear.
- **Linhas por marca** com 4–5 níveis (Club, Sport, Pro, Elite, Signature). A Signature só vem por contrato.
- **Incomum com identidade:** multiplicador próprio, ou fundido com o comum.
- **Durabilidade, decisão pendente (§11):** desgaste leve só em raquete e calçado (custo recorrente de reposição) ou remover o campo.

## 4. Patrocínios

### 4.1 Estrutura do contrato **[sugerido]**

| Componente | Descrição | [atual] |
|---|---|---|
| Fixo mensal | Pago no fechamento do mês | Existe |
| Luvas | Na assinatura | Existe |
| Bônus por vitória oficial | Por partida | Não existe |
| Bônus por título | Por tier | Meta sazonal existe, mas nunca é avaliada |
| Bônus por ranking | Mensal, acima de um limiar | Não existe |
| Equipamento fornecido | Item da linha da marca, na assinatura e/ou na renovação | Não existe |
| Desconto na Loja | Na marca, por tier do contrato | Existe (15% fixo) |
| Exclusividade | Por slot (raquete, calçado, vestuário, principal, comercial) | Existe (slots) |
| Exigência de uso | Usar o equipamento da marca na categoria do contrato | Só exibição |
| Metas | Só o que o jogo mede: partidas, vitórias, torneios, entrevistas, ranking | Mede partidas, vitórias e torneios; "postagens" nunca é medida |
| Avaliação | Automática no fechamento do mês | Só por clique |
| Renovação | Proposta automática ~1 mês antes do fim, com termos pelo desempenho | Manual, sem revalidar |
| Rescisão | Pelo atleta (multa) ou pela marca (cláusula de desempenho) | Pelo atleta sem multa; pela marca só por clique |

### 4.2 Propostas

**[atual]** Uma vitrine mensal determinística: o jogador procura e assina.

**[sugerido]** Formato híbrido:
- a vitrine continua, como "mercado aberto";
- marcas fazem **propostas ativas** em marcos de carreira: primeiro título, entrada no top 500/200/100/40, recorde de fãs. Chegam pela Central de Comunicações, com prazo de resposta e contraproposta simples (trocar fixo por variável, prazo maior ou menor).

## 5. Integração entre sistemas

### 5.1 Pré-requisito estrutural: atributo-base + modificador

**Problema [atual]:** o bônus é gravado no atributo e consome o teto de treino (9A-01). Medido: +8,8 OVR declarados viram +1,0 OVR efetivo depois de 6.000 sessões, com 7,8 OVR de base perdidos.

**Proposta:** o `PlayerProfile` guarda só o atributo do atleta. O modificador de equipamento é calculado a partir dos itens equipados (`PlayerInventory`) e aplicado **na montagem do jogador para a partida**, no mesmo ponto onde hoje entram química, treinador e vínculo (`playerForMatch`). Treino, teto, bônus de vitória e conquistas passam a ler a base.

| Alternativa | Vantagens | Desvantagens |
|---|---|---|
| A. Base + modificador na partida (recomendado) | Corrige 9A-01; a interface mostra "base + equipamento"; equipar e desequipar são triviais; teto sob controle | Migração de save (subtrair `applied_bonus` uma vez); revisar conquistas de atributo máximo |
| B. Manter o modelo gravado e excluir o bônus do teto | Sem migração | Cada sistema precisa lembrar de descontar o equipamento; frágil |
| C. Manter como está | Nada a fazer | O equipamento continua sem efeito de longo prazo e a validação fica distorcida |

### 5.2 Camada de dados de marca

Um registro único de marca (`brandId`) ligando `SPONSOR_CATALOG` e o `manufacturer` dos itens. Hoje a ligação é por nome (`findSponsorIdByManufacturer`), com um fallback "fuzzy" de 10%. O mesmo registro guarda nome de exibição, arquétipo e linhas. Trocar nomes (§2.1) vira troca de dados.

### 5.3 Fluxo

**Marca → Proposta → Contrato → Benefícios → Loja/Inventário → Equipamento → Desempenho → Resultados → Renovação**

| Etapa | Proposta |
|---|---|
| Marca → Proposta | Vitrine mensal (existe) mais propostas ativas em marcos (§4.2). Elegibilidade por estágio, ranking, fãs, títulos e idade (`canSign`, com ranking acrescentado) |
| Proposta → Contrato | `signSponsorContract` passa a gravar `brandId`, benefícios e obrigações |
| Contrato → Benefícios | Fechamento do mês: fixo, variáveis, avaliação de metas e cláusulas (`processMonthlyFinances` + `evaluateSponsorContracts` automático) |
| Benefícios → Loja/Inventário | Desconto por tier; item fornecido entra no inventário com `source: 'sponsor'` e `contractId` |
| Inventário → Equipamento | Equipar valida a exigência de uso (§5.4) |
| Equipamento → Desempenho | Modificador aplicado na partida, limitado pelo teto do estágio |
| Desempenho → Resultados → Renovação | Satisfação e metas definem a proposta de renovação, a rescisão ou o upgrade de linha |

### 5.4 Questões de integração (alternativas)

| Questão | A | B | C | Recomendação |
|---|---|---|---|---|
| Item concedido ao assinar | Fica com o atleta para sempre | Empréstimo: devolvido no fim | Fica, mas o modificador da linha Signature só vale com contrato ativo | **A** para linhas comuns e **C** para a Signature: simples e sem punir o jogador |
| Marca concorrente na categoria do contrato | Bloqueio rígido | Penalidade de satisfação | Sem restrição | **B**, com aviso claro na interface antes de equipar |
| Desconto | Fixo (15%) | Por tier do contrato (Bronze 10, Prata 15, Ouro 20) | Só na linha fornecida | **B** |
| Expiração dos benefícios | Desconto e fornecimento cessam no fim | Período de graça de 1 mês | — | **A** |
| Bônus por título | Por tier do torneio | Fixo | — | **A** |
| Renovação | Automática, pelos termos atuais | Proposta nova pelo desempenho | Manual (atual) | **B** |
| Rescisão pelo atleta | Multa de N meses de fixo | Sem multa (atual) | — | **A** (dá peso à decisão) |
| Disponibilidade de propostas | Só vitrine (atual) | Só propostas ativas | Híbrido | **Híbrido** |

## 6. Progressão econômica

### 6.1 Estágios

| Estágio | Equivalente no código **[atual]** (`getCareerEconomyStage`) |
|---|---|
| 1. Iniciante | `beginner`: nível < 5 |
| 2. Em desenvolvimento | `regional`: nível ≥ 5 |
| 3. Profissional intermediário | `professional`: nível ≥ 12, top 500, reputação ≥ 15 |
| 4. Competitivo | `international`: nível ≥ 22, top 150, reputação ≥ 35 |
| 5. Elite | `elite`: nível ≥ 35, top 40, reputação ≥ 65 |

### 6.2 Por estágio: atual × sugerido

| Estágio | Dinheiro **[atual]** | Loja liberada **[atual]** | Patrocínio visível **[atual]** | Custo de treino/sessão **[atual]** | Modificador máximo de equipamento **[sugerido]** | Fatia da receita em equipamento **[sugerido]** | Patrocínio **[sugerido]** |
|---|---|---|---|---|---|---|---|
| 1. Iniciante | 900 iniciais; HEAD ano 1: receita ~3 mil/mês, caixa 0,8–7 mil | comum, incomum | 6 marcas, Bronze | 20 | +1 OVR | 10–15% | 1–2 contratos de entrada; dinheiro e desconto |
| 2. Desenvolvimento | idem | raro (top 500) | 8, até Prata | 30 | +2 | 15% | Primeiro contrato de raquete com item fornecido |
| 3. Profissional | Sem medição no HEAD; 527-J ano 2: ~5,9 mil/mês | épico (top 200) | 10, até Ouro | 45 | +3 | 15–20% | Prata com variáveis; escolher entre equipamento e dinheiro |
| 4. Competitivo | Sem medição no HEAD | lendário (top 100) | 12 | 65 | +4 | 15% | Ouro de equipamento ou comercial; exclusividade |
| 5. Elite | Teórico: prêmios de 45–90 mil por título; Ouro até ~4,8 mil/mês | mítico, exclusivo | 14 | 90 | +5 | ≤ 10% | Linha Signature, contratos longos; renda alta com sumidouros reais |

**Por que esses tetos [sugerido].** Medido na 9A: +4,5 OVR (kit épico) deu +7,5 a +10,5 pp de vitória em partida equilibrada; +8,8 OVR deu +15 a +21 pp. Um teto de +5 OVR na elite (~+10 pp) é relevante sem ser decisivo. Treino continua dando dezenas de pontos de OVR ao longo da carreira (40 → 78 no probe da §8.3 da auditoria).

## 7. Progressão esportiva

- O treino continua sendo a principal fonte de OVR. O equipamento soma **por cima** da base e não ocupa o teto (§5.1).
- O equipamento só ultrapassa o teto individual até o limite do estágio. Na elite, um atleta no teto (65–98) ganha no máximo +5.
- Conquistas de "atributo 100" passam a exigir base 100, ou são revistas. Hoje só são alcançáveis com equipamento, porque o teto vai até 98.
- IA e parceiros: **[atual]** nunca têm equipamento. **[sugerido]** dar um modificador implícito de estágio aos atletas da IA de elite, para que o jogador não tenha uma vantagem exclusiva de +5. É uma decisão pendente (§11).

## 8. Exemplos de contratos **[sugerido]**

Valores ilustrativos na escala do preset `balanced` atual, para comparar desenhos, não para virar regra.

| | Entrada (Desafiante, Bronze) | Equipamento (Controle técnico, Prata) | Potência premium (Ouro) | Comercial (Ouro, sem equipamento) |
|---|---|---|---|---|
| Fixo/mês | 300 | 700 | 2.500 | 4.000 |
| Luvas | 300 | 800 | 5.000 | 8.000 |
| Variável | +15 por vitória oficial | +300/mês se top 200 | +5.000 por título Masters+ | +1.000/mês se top 40 |
| Equipamento | Raquete Sport (incomum) | Raquete Pro (raro) + grip; reposição anual | Linha Signature (modificador só com contrato) | — |
| Desconto | 10% na marca | 15% | 20% | — |
| Exclusividade | Raquete | Raquete | Raquete e calçado | Slot principal |
| Exigência | Usar a raquete da marca | Usar raquete e grip | Usar a linha | 2 entrevistas por mês |
| Duração | 6 meses | 12 meses | 24 meses | 18 meses |
| Renovação | Automática se ≥ 4 torneios no período | Proposta pelo desempenho | Rescisão se fora do top 100 por 3 meses | Proposta pelo desempenho |

**Dilema pretendido:** Prata dá menos dinheiro e equipamento melhor; Comercial dá muito dinheiro e nenhum equipamento, mas ocupa o slot principal.

## 9. Exemplos de itens **[sugerido]**

| Item | Categoria | Linha | Efeito | Origem |
|---|---|---|---|---|
| Raquete "Control Club" | Raquete | Controle técnico, nível 1 | +1 voleio, +1 defesa | Loja, comum |
| Raquete "Control Pro" | Raquete | nível 3 | +2 voleio, +2 defesa, +1 estratégia | Loja (raro) ou contrato Prata |
| Raquete "Control Signature" | Raquete | nível 5 | +3 voleio, +3 defesa, +2 estratégia | Só por contrato |
| Calçado "Court Grip" | Calçado | Esportiva global | +2 agilidade | Loja |
| Smartwatch "Recovery" | Tecnologia | Tecnologia e saúde | −10% de fadiga pós-partida | Loja ou contrato |
| Troféu "Fundadores" | Colecionável | Heritage | +fãs/reputação ao exibir; nenhum atributo | Loja, estoque limitado |

## 10. Propostas de balanceamento

| Risco | Situação **[atual]** | Mitigação **[sugerida]** |
|---|---|---|
| Equipamento forte demais | +15,5 OVR possível (relíquias); +30 pp de vitória | Teto por estágio (§6.2); relíquias sem efeito esportivo |
| Equipamento sem efeito duradouro | Absorvido pelo teto (9A-01) | Base + modificador (§5.1) |
| Patrocínio lucrativo demais | Antes da 5.27, 87% da receita do ano 1; hoje 49% (HEAD) | Fixo menor e variável maior; metas que o jogo mede |
| Sem recursos no início | HEAD: caixa mínimo de 777 | Contrato de entrada com item fornecido no lugar de dinheiro |
| Rico demais na elite | CLOUD-6A: 20–75 mil parados | Sumidouros com efeito real: reposição de equipamento, staff, linha Signature exige investimento, multas de rescisão |
| Melhor item cedo demais | Requisitos existem; o freio real é o dinheiro | Teto por estágio torna irrelevante comprar acima do estágio |
| Equipamento torna o treino irrelevante | Hoje o inverso: o treino anula o equipamento | Modificador por cima da base, limitado |
| Contratos sem escolha | Harness escolhe pelo maior salário; nada além de dinheiro a comparar | Dinheiro × equipamento × exclusividade × duração (§8) |
| Bônus acumulados | 9 categorias somadas | 3 categorias com atributo e teto total |

## 11. Decisões de produto pendentes

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D1 | Marcas reais ou fictícias | A / B / C (§2.1) | B, com camada de dados de marca |
| D2 | Modelo de atributo | Base + modificador / excluir do teto / manter (§5.1) | Base + modificador |
| D3 | Categorias com efeito esportivo | 9 (atual) / 3 (raquete, calçado, grip) / só raquete | 3 |
| D4 | Relíquias e colecionáveis | Prestígio sem atributo / efeito dentro do teto / manter | Prestígio |
| D5 | Durabilidade | Desgaste em raquete e calçado / remover | Decidir após a 9C, com dados do simulador |
| D6 | Item concedido ao fim do contrato | Fica / devolve / fica sem bônus Signature (§5.4) | Fica, com Signature condicionada |
| D7 | Marca concorrente | Bloqueio / penalidade / livre | Penalidade com aviso |
| D8 | Propostas | Vitrine / ativas / híbrido | Híbrido |
| D9 | Equipamento implícito para a IA de elite | Sim / não | Sim, simétrico ao teto do jogador |
| D10 | Metas de mídia | Medir entrevistas e imprensa (já existem) / remover postagens | Medir entrevistas e remover postagens |
| D11 | Saves de desenvolvimento | Migrar (subtrair `applied_bonus`) / invalidar com versão | Migrar quando trivial; invalidar com aviso quando não, sem apagar nada |

## 12. Roadmap de implementação

A divisão sugerida (9B–9F) se mantém, com dois ajustes de dependência encontrados na auditoria:

1. a separação base + modificador e a extração das funções de domínio precisam vir **antes** de qualquer conteúdo novo;
2. vale medir uma **linha de base** com o simulador de decisões no conteúdo atual (já corrigido o modelo), para ter um antes e depois.

| Fase | Escopo | Depende de | Critério de saída |
|---|---|---|---|
| **LOCAL-9B — Fundação** | (1) Atributo-base + modificador aplicado na partida; migração versionada do save, sem apagar nada. (2) Funções de domínio para comprar, equipar, desequipar, vender, assinar, renovar e avaliar, usadas pelas páginas e pelo simulador. (3) Registro de marca (`brandId`). (4) P3 sem mudança de regra: guardas de estoque e duplicado em `buy`; `renewContract` com `canSign` e categoria; fixture do v526c | D1, D2, D11 | OVR efetivo idêntico antes e depois da migração; os testes atuais passam; o teste da 9A sobre o teto mostra vantagem constante |
| **LOCAL-9E.1 — Simulador de decisões (linha de base)** | Política de jogador com orçamento (reserva, ROI, quando trocar, qual contrato), usando as funções da 9B; estender o CLOUD-7C ou unificar com o 5.26 | 9B | Carreiras de 5 temporadas sem erro; relatório de economia e de progressão no conteúdo atual |
| **LOCAL-9C — Loja e equipamentos** | Papéis por categoria, linhas por marca, teto por estágio, relíquias como prestígio, interface "base + equipamento" | 9B, D3, D4, D5 | Simulador: efeito do equipamento dentro dos tetos; nenhum item sem função |
| **LOCAL-9D — Patrocínios** | Contratos com benefícios (§4.1), propostas ativas, avaliação automática no fechamento do mês, renovação e rescisão, integração com a Loja | 9B, 9C, D6–D8, D10 | Decisões com trade-off visível; metas só com dados medidos |
| **LOCAL-9E.2 — Simulador completo** | Políticas que negociam, comparam e renovam; perfis casual, normal e optimizer | 9C, 9D | Mesmas métricas da 9E.1, comparáveis |
| **LOCAL-9F — Validação completa** | Progressão esportiva e economia em carreiras longas, várias seeds e perfis | 9E.2 | Metas por estágio (§6.2) dentro das faixas; nenhuma estratégia dominante só por dinheiro |

**Política de saves.** Saves de desenvolvimento podem ser invalidados quando a migração não for trivial, desde que a versão do formato seja registrada, o jogo avise e nada seja apagado automaticamente (sem limpar IndexedDB, backups ou fixtures). Cada mudança de formato fica documentada na fase que a introduzir.
