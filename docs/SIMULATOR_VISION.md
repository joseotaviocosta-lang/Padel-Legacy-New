# Padel Legacy — Visão do Simulador

## Conceito
Simulador individual de carreira de padel (estilo Football Manager), single-player, navegador, foco em longo prazo. O jogador começa como um iniciante amador e constrói seu legado ao longo de **dias/semanas de jogo real**, treinando golpes, subindo no ranking de duplas, disputando torneios e gerenciando parcerias.

---

## Progressão Central (Long Term)

### Atributos
- 10 atributos específicos (Saque, Forehand, Backhand, Voleio, Bandeja, Smash, Defesa, Agilidade, Estratégia, Controle Emocional)
- Todos começam em **5** (baixo)
- **10 pontos iniciais** para distribuir livremente no perfil
- Após isso, só evoluem **treinando** (principal) ou **vencendo torneios** (+1 aleatório por vitória)
- Partidas treino **não dão atributos**, apenas XP e moedas mínimas
- Objetivo: chegar a 100 em todos os atributos = jogador completo
- Estimativa: ~95 dias de treino diário (5 sessões/dia × +2 cada) para maximizar tudo

### Nível & XP
- XP vem de: treinos (10-20 cada), partidas treino (5-10), torneios (20-50 por round)
- Níveis: Iniciante → Amador → Competitivo → Avançado → Elite → Lenda
- Thresholds: 0 / 200 / 700 / 1500 / 3000 / 5000 XP

### Tempo de Carreira
- Calendário visível na página inicial (data + horário simulado)
- Cada atividade avança o tempo:
  - **Treino**: +1 dia
  - **Partida treino**: +3 dias
  - **Torneio**: +7 dias por round
- Torneios disponíveis apenas no mês atual do calendário

---

## Ranking de Duplas (Ranking Principal)

- O **ranking de duplas** é o ranking principal do jogo (não individual)
- Pontos ganhos ao:
  - Vencer partidas treino: **não conta** (apenas treino)
  - Vencer rounds de torneio: +50 (vitória) / +20 (derrota)
  - Vencer torneio: bônus de `rank_points` do torneio
- 30 bot teams seedeados competem no ranking
- Jogador começa sem ranking e sobe conforme vence torneios
- **Objetivo final**: chegar ao #1 do ranking mundial de duplas

---

## Sistema de Parceiros (Dinâmico)

### Estado Atual
- Parceiro selecionado uma vez, travado por 60 dias
- Sem dinâmica de convites ou separações

### Visão Futura
- Parceiros têm **overall próprio** e evoluem junto com o jogador
- Após o período de lock, o parceiro pode:
  - **Renovar** (continuar juntos)
  - **Se separar** (se o ranking do jogador estagnou ou caiu)
- Jogadores melhores podem **receber convites** de parceiros de nível superior
- Parceiros piores podem ser **dispensados** para buscar duplas mais fortes
- A química da dupla afeta performance em torneios

---

## Torneios e Calendário Anual

### Categorias
| Tier | Dificuldade | Rounds | Pontos Ranking | Recompensa |
|------|------------|--------|---------------|------------|
| P2 | Equilibrado | 2 (SF + Final) | 50-100 | Média |
| P1 | Difícil | 3 (QF + SF + Final) | 150-300 | Alta |
| Major | Muito Difícil | 3 (QF + SF + Final) | 400-800 | Máxima |

### Fluxo
- Calendário anual com torneios distribuídos por mês
- Apenas torneios do **mês atual** do calendário podem ser jogados
- Cada torneio jogado uma vez por temporada
- Cabeças de chave definidos pelo ranking de duplas
- Ao vencer: moedas, XP, pontos de ranking, título no currículo

---

## Economia

### Moedas
- Ganhas: treinos (5-15), partidas treino (3-8), torneios (premiação)
- Gastas: loja de equipamentos (raquetes, grips, acessórios)
- Itens equipados dão bônus de atributos
- Raridades: Comum → Raro → Épico → Lendário

---

## Jornal Semanal
- Gera conteúdo dinâmico baseado em:
  - Campeões recentes de torneios
  - Top duplas do ranking
  - Rivalidades (duplas que se enfrentaram 2+ vezes)
  - Resultados recentes
- Atualiza conforme o jogador avança no circuito

---

## Estado Atual vs. Visão

| Funcionalidade | Status |
|---------------|--------|
| Perfil com 10 atributos | ✅ Pronto |
| Atributos baixos iniciais (5) + 10 pontos | ✅ Pronto |
| Treino diário (primário) | ✅ Pronto |
| Partidas treino (sem ranking) | ✅ Pronto |
| Calendário de carreira visível | ✅ Pronto |
| Tempo avança com atividades | ✅ Pronto |
| Ranking de duplas (principal) | ✅ Pronto |
| 30 bot teams seedeados | ✅ Pronto |
| Torneios P2/P1/Major por mês | ✅ Pronto |
| Cabeças de chave por ranking | ✅ Pronto |
| Jornal semanal | ✅ Pronto |
| Loja + Inventário + Bônus | ✅ Pronto |
| Parceiro dinâmico (convites/separações) | 🔲 A construir |
| Evolução do parceiro junto ao jogador | 🔲 A construir |
| Química de dupla afetando performance | 🔲 A construir |
| Convites de parceiros melhores | 🔲 A construir |
| Sistema de rivalidades persistentes | 🔲 A construir |
| Conquistas/achievements desbloqueáveis | 🔲 A construir |

---

## Próximos Passos Sugeridos
1. **Sistema de parceiros dinâmico** — convites, separações, evolução
2. **Química de dupla** — bônus/penalidade baseado em tempo junto
3. **Conquistas** — marcos de carreira desbloqueáveis
4. **Eventos de carreira** — lesões, patrocínios, convites de clube
5. **Histórico de carreira** — timeline de títulos e marcos