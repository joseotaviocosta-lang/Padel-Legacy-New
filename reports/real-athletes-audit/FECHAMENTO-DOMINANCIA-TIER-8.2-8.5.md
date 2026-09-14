# Fechamento — dominância de tier em Gold/Platinum/Masters (Fase 8.2 → 8.5)

> Resumo executivo. Para o detalhe completo de cada medição, ver os
> relatórios de sub-fase referenciados na seção 5 — este documento não
> os substitui.

## 1 — O mecanismo

Reais dominam Gold/Platinum/Masters (a Fase 8 mediu isso como meta não
atingida) por um motivo estrutural, não um bug: os 100 atletas reais são
inseridos no elenco ANTES dos bots procedurais (`existingAthletes` já
populado quando `buildSupplementalRankingPopulation` roda), então todo
bot nasce com `absoluteRank = existingAthletes.length + i + 1` — a
partir da posição 101. A fórmula de OVR por rank
(`96 - (absoluteRank/1000)^0.72 × 57`) usa essa mesma curva pra reais e
bots, então o primeiro bot já nasce com um teto de ~85 de OVR — 11-12
pontos abaixo do teto real (96) — simplesmente porque as 100 primeiras
(e melhores) posições da curva são ocupadas pelos reais, não por
reserva deliberada (Fase 8.3). Compondo isso, a margem de crescimento
(`potential`) dos bots da população INICIAL é 3-5× mais estreita
(overall+2 a +11) que a usada em `generateProspects` pra substitutos
(overall+8 até 96) — sem justificativa de design registrada, um efeito
colateral de duas fórmulas escritas em momentos diferentes do projeto
(Fase 8.3). A Fase 8.2, antes disso, já tinha confirmado que a causa NÃO
é seleção de torneio (a IA de reais escolhe corretamente em 100% das
vezes que tem opção — só 3,8% das semanas oferecem escolha real) nem
calendário no topo (expandir Elite/Crown não move a dominância agregada)
— isolando a composição de força dos CAMPOS como a causa real,
confirmada na Fase 8.3.

## 2 — Três tentativas de correção, três formas de falhar

### 2.1 — Fase 8.3: `potential` aberto para toda a população

Alargar o teto de crescimento de TODOS os ~894 bots pra bater com a
fórmula de `generateProspects`. **Por que falhou**: o gap médio de OVR
fecha parcialmente mas estabiliza (platô) em 13-20 pontos residuais a
partir da T3-T4 — e, mais grave, introduz o "risco inverso": bots passam
a vencer títulos em Elite/Masters/Crown que nunca venciam na produção
(0/50, 0/50, 0/20 em 5 temporadas → 4/50, 3/50, 1/20). Um `potential`
numérico aberto não tem como saber "pare no seu tier" — ele empurra o
crescimento até onde o teto permitir, e o teto (96) é o mesmo dos
tiers de topo.

### 2.2 — Fase 8.4: `potential` aberto só numa faixa de rank + fração boosted

Tentativa de conter o vazamento restringindo o alargamento a uma FAIXA
DE RANK (140-450, "Gold-Masters" por `minRanking`) mais uma fração
pequena e fixa (75 bots) com rank efetivo boosted pra 1-150. **Por que
falhou**: o intervalo numérico entre os `minRanking` dos tiers é, por
construção do catálogo, largo o bastante pra cobrir 310 bots (35% da
população) só na faixa "natural" — somado à fração boosted, 43% do
elenco de bots ganhou `potential` largo, quase tão amplo quanto o
alargamento cego da 8.3. O vazamento pro topo persistiu (5/50, 2/50,
1/20) e um sinal novo, mais grave, apareceu: presença de reais no Top 20
despencou pra 6/20 na T4 (contra 12/20 na produção) — corte por RANK não
limita a POPULAÇÃO afetada, porque a largura de uma faixa de rank e o
número de bots que ela contém não são a mesma variável.

### 2.3 — Fase 8.5: teto de OVR travado no tier de destino

Em vez de `potential` numérico aberto, uma fração pequena e fixa (75
bots, 25 por destino) recebe um teto de OVR travado EXATAMENTE no valor
do tier pretendido (85/87/90 pra Gold/Platinum/Masters), sem fração
voltada a Elite/Crown desta vez. **Por que falhou**: o mecanismo conteve
o vazamento quase por completo (Elite/Masters/Crown: 1/0/0, o melhor
resultado das três) e não mexeu no Top 20 (replica produção
EXATAMENTE, temporada a temporada) — mas o gap médio de OVR não fecha:
ele oscila e termina igual ou pior que no início (Crown: 7,1→19,1;
Masters: 11,7→19,0), porque o teto rígido barra o crescimento do bot
enquanto os reais continuam evoluindo livremente. Resolve a contenção
às custas de eliminar quase toda capacidade de fechar o gap.

## 3 — Por que a meta original não se sustenta

Nenhuma das quatro configurações medidas (produção, 8.3, 8.4, 8.5) chega
perto do alvo original da Fase 0 (Gold/Platinum ≤ 15% de títulos reais,
ou seja bots vencendo ≥ 85% ali):

| Configuração | Gold — títulos de bot | Platinum — títulos de bot |
|---|---|---|
| Produção | 10,0% | 13,3% |
| Fase 8.3 (potential aberto geral) | 10,0% | 23,3% |
| Fase 8.4 (potential por faixa de rank) | 5,0% | 10,0% |
| Fase 8.5 (teto por tier de destino) | 12,5% | 13,3% |
| **Alvo original (Fase 0)** | **≥ 85%** | **≥ 85%** |

O melhor resultado em qualquer rodada, em qualquer tier (23,3% em
Platinum, Fase 8.3) fica 62 pontos percentuais abaixo do alvo. Fechar
essa distância exigiria bots competitivos o bastante pra VENCER a
maioria das vezes em Gold/Platinum — uma mudança de magnitude muito
maior que qualquer uma das três tentativas, e as três já mostraram que
magnitudes bem menores produzem vazamento pro topo (8.3/8.4) ou
estagnação total do gap (8.5). A causa raiz (§1) explica por que: os
reais ocupam as 100 melhores posições da curva de geração POR DESENHO
desde a Fase 2 — qualquer bot forte o bastante pra dominar Gold/Platinum
precisa de um teto de OVR ou de crescimento próximo do teto real, e essa
mesma força, numa simulação de carreira de vários anos, não tem como
"saber" parar no tier pretendido. A meta original em
`docs/tournament-targets.md` foi corrigida (Fase 8.6) pra refletir isso:
referência de teto observado (~23% Platinum, ~13% Gold), não meta ativa
de correção.

## 4 — Decisão final: não perseguir correção via geração/evolução de bot

Três abordagens estruturalmente diferentes tentadas; nenhuma resolve sem
um efeito colateral maior que o problema original, e mesmo a menos
ruim (8.5) não avança de forma mensurável em direção ao alvo real (§3).
**Decisão**: encerrar esta linha de investigação sem implementar nenhuma
das três em produção. O estado atual de Gold/Platinum/Masters
(dominância real de 87-100%) fica como está — formalmente abaixo da
meta original, mas a meta em si foi revisada (§3) por não ser
estruturalmente sustentável sem comprometer a meta mais crítica (Major/
P1 ≥ 70% real, que segue atingida e não deve ser arriscada por esta
correção secundária).

### 4.1 — Alternativas consideradas e descartadas (não pendências abertas)

- **Volume de calendário no meio da tabela** (mais eventos de Gold/
  Platinum/Masters, não do topo) — **descartada por precedente**. O
  mesmo padrão ("mais calendário não move a métrica que importa") já
  apareceu de forma independente na Fase 6.7 (mais capacidade não
  melhora estritamente toda métrica) e na Fase 8.2 (expandir Elite/Crown
  não moveu a dominância agregada, só redistribuiu onde o real de topo
  joga). Sem evidência de que o meio da tabela se comportaria diferente
  do topo, não há razão pra abrir uma nova investigação só pra
  redescobrir o mesmo padrão.
- **Exclusão ativa por seleção** (reais de alto nível evitando Gold/
  Platinum quando têm escolha) — **descartada por risco de design**.
  Seria a primeira regra de comportamento desta auditoria inteira criada
  sem nenhum bug ou mecanismo quebrado correspondente — puramente pra
  forçar um número a bater com uma meta. A Fase 8.2 já mostrou que
  `chooseTournament` pontua corretamente em 100% dos casos com escolha
  real; adicionar uma regra de exclusão ativa por cima disso arriscaria
  parecer artificial dentro do jogo (um atleta forte evitando
  deliberadamente um tier que dominaria, sem motivo narrativo).

Ambas ficam registradas aqui como **consideradas e descartadas por
decisão** — não como trabalho pendente. Uma sessão futura não deve
reabri-las sem novo contexto que mude a avaliação acima.

## 5 — Histórico completo (para detalhe, não resumido aqui)

| Fase | Relatório | Commit | O que fez |
|---|---|---|---|
| 8 | [FASE-8-RELATORIO.md](FASE-8-RELATORIO.md) | `8cd8e51` | Mediu o circuito contra as metas da Fase 0; identificou dominância de Gold/Platinum/Masters como meta não atingida |
| 8.1 | [FASE-8.1-RELATORIO.md](FASE-8.1-RELATORIO.md) | `bef68f2` | Confirmou aposentadoria (não bug); estendeu qualifying/janela/wildcard ao jogador — sem relação com dominância de tier |
| 8.2 | [FASE-8.2-RELATORIO.md](FASE-8.2-RELATORIO.md) | `7ccea04` | Confirmou mecanismo: não é seleção nem calendário no topo — isolou composição de força dos campos como causa real |
| 8.3 | [FASE-8.3-RELATORIO.md](FASE-8.3-RELATORIO.md) | `8634ff6` | Confirmou a causa (teto de geração + potential estreito); testou `potential` aberto geral — fecha gap parcialmente, vaza pro topo |
| 8.4 | [FASE-8.4-RELATORIO.md](FASE-8.4-RELATORIO.md) | `9c057e0` | Testou `potential` aberto por faixa de rank + fração boosted — fecha gap mais, mas vaza igual/pior e derruba Top 20 |
| 8.5 | [FASE-8.5-RELATORIO.md](FASE-8.5-RELATORIO.md) | `37b74a3` | Testou teto de OVR travado por tier de destino — contém vazamento quase por completo, mas gap não fecha; recomendou abandonar a linha |
| 8.6 | (este documento) | — | Fechamento: meta da Fase 0 corrigida, alternativas registradas como descartadas |

## Entrega

1. Meta de Gold/Platinum em `docs/tournament-targets.md` corrigida, com
   justificativa e referência ao teto observado
2. Este documento de fechamento
3. Volume de calendário e exclusão por seleção registrados como
   descartados por decisão, não como pendências
4. Commit
