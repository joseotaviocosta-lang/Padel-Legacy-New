# Fase 5.32-C — Diretório e Perfis de Atletas

Branch `integracao/cloud-6o` · base `7f9d8fd` (commit da 5.32-B) · sem commit da 5.32-C (aguardando validação).

## 1. Escopo e arquivos

| Arquivo | Tipo | Mudança |
|---|---|---|
| `src/pages/Athletes.jsx` | UI | diretório: catálogo inteiro, posição pela autoridade do Ranking, busca sem acento, recortes, filtros sob demanda, deep link `?athlete=` |
| `src/components/athletes/AthleteCard.jsx` | UI | linha compacta: posição atual / "Apos." / "—", avatar, nome, país, idade, lado, OVR |
| `src/components/athletes/AthleteDetail.jsx` | UI | perfil: cabeçalho esportivo + seções Resumo/Resultados/Parcerias/Jogo, leituras sob demanda (só leitura) |
| `src/pages/Ranking.jsx` | UI (+19 linhas) | passa ao perfil a posição do MESMO snapshot, navegação para parceiro, `context="ranking"` |
| `src/lib/athleteProfileDisplay.js` | novo, puro | posições, parceiro atual, histórico de parcerias/resultados, zero × não registrado, recortes |
| `scripts/test-athletes-profile-v532c.mjs` | teste | 58 verificações (SSR + carreira nova real + temporada 10) |
| `scripts/test-athletes-mobile-containment-v532c.mjs` | teste | 160 verificações no Chrome (6 viewports × 2 carreiras + fluxos) |

Motor, regras, pontos, OVR, aposentadorias, parcerias, persistência, saves e Android: **intocados**. `PlayerProfile.jsx` (perfil do jogador) não compartilha componentes com o perfil de IA e não foi alterado; a linha do jogador no Ranking abre o perfil compartilhado só com um atalho "Abrir meu perfil completo" → `/career/athlete`.

## 2. Auditoria (antes)

Rotas e superfícies: `/world/directory?tab=athletes` (AthletesClubsHub → Athletes) · perfil `AthleteDetail` (modal) aberto pelo diretório e pelo Ranking (`/ranking?athlete=<id>`, deep link já existente) · Mundo → Ranking → perfil · Torneios: não abre perfis de atleta (chave/detalhes mostram nomes, sem rota de perfil) · `/career/athlete` = perfil do jogador (separado).

Problemas encontrados:

1. **Diretório lia só 200 atletas** (`getAthletes()` → 200 maiores OVR). "Top 100" deixava de fora 31 (carreira nova) / 52 (temporada 10) dos 100 primeiros do Ranking; aposentados e atletas comuns (ex.: Martín Mendes #100, Mateo Ruiz, Álvaro Cepero) não eram encontráveis.
2. **Posição divergente**: linha e perfil caíam no `ranking_position` gravado quando faltava a posição canônica; aposentados exibiam posição antiga; o perfil aberto pelo Ranking exibia o campo gravado.
3. Perfil: "Pico aos" vazio, números sem arredondar estourando o card (`48.6615400647`), `champion` cru, "Jovem em crescimento" para quem não tem fase registrada (padrão "Ascensão"), barras com valores inventados (forma 60, confiança 65, eixos 50), "Atributos Evolutivos" sempre vazio (0 de 1.141 atletas têm `attributes`), parceiro só pelo nome e "Livre no mercado" até para aposentado.
4. Filtro de estilo sem "Controle" (existe nos dados); lado misturando `Direita`/`left`/`flex`; busca sensível a acento.
5. **Escritas ao abrir o diretório** (anterior a esta fase, ver §8).

## 3. Autoridades de dados

| Informação | Origem | Atualização / persistência | Quando ausente |
|---|---|---|---|
| Posição Mundial atual | `buildWorldRankingSnapshot` (ordem do snapshot, só com pontos) — a mesma do Ranking 5.32-A | recalculada a cada leitura | "Sem ranking" / "Aposentado" / "Indisponível" |
| Race | `snapshot.entries.racePoints`, ordenação da escada da Race | idem | sem posição na Race |
| OVR / OVR máximo | `overall_rating`, `max_overall_rating` do atleta | motor (evolução mensal) | "—" / não registrado |
| Contadores de carreira | `career_titles`, `tournaments_played`, `career_wins/losses`, `career_titles_by_tier` | WorldTourLifecycle ao resolver torneios | **não registrado** (carreira nova não tem os campos) — zero gravado aparece como 0 |
| Melhor posição | `best_ranking_position` (registro do circuito, histórico) | circuito semanal | se a posição atual for melhor, mostra a atual rotulada "posição atual" |
| Resultados | `AthleteRankingResult` (janela do ranking, ~12 meses) + parceiro por id via `recent_results` | settlement | "Nenhum resultado registrado na janela do ranking" |
| Parceiro atual | `ai_partner_id` mútuo + ninguém aposentado (fonte do motor de IA, igual à 5.32-B); parceiro-jogador pela Partnership ativa | motor de parcerias | "Sem parceiro" / "Encerrou a carreira" / "Parceria não confirmada" |
| Histórico de parcerias | `Partnership` + `PartnershipLegacy` por ids | mercado de parcerias; poda de antigas | registro parcial declarado quando `partnership_history_count` > linhas salvas |
| Aposentadoria | flags do atleta + `AthleteCareerLegacy` | aposentadoria | "Data da aposentadoria não registrada" |

Divergência medida (temporada 10): `ranking_position` gravado ≠ posição atual em **357 de 380** atletas ranqueados. Diretório e perfil não leem esse campo; nada foi sincronizado ou migrado.

## 4. Diretório (depois)

Cabeçalho compacto (HUD: "na lista · N em atividade", sua posição) → busca (sem acento, nome/país, botão limpar) → botão Filtros (ordenação, estilo dos dados, personalidade — fechados por padrão) → recortes Todos / Top 100 / Elite / Antes do auge / Veteranos / Aposentados → lista paginada (60 por vez).

Recortes (critérios mantidos; só a autoridade de posição mudou): Top 100 = posição atual ≤ 100; Elite = posição atual ≤ 30 ou OVR ≥ 84; "Em ascensão" foi renomeado **"Antes do auge"** (é a fase pela idade/pico, não desempenho); Veteranos = fase veterano; novo recorte Aposentados. Aposentados ficam fora dos recortes de atividade.

Linha: posição atual (coroa no nº 1) / "Apos." / "—", avatar, nome (+ "Aposentado"/"Lesionado"), país, idade, lado, OVR. Altura ~56–62px.

## 5. Perfil (depois)

**Cabeçalho esportivo**: nome + status (Ativo/Aposentado/Lesionado/Você), país, idade, lado; **#N Mundial** com pontos (ou "Aposentado"/"Sem ranking"), **OVR**, Race #N quando houver; **Parceiro atual** clicável (abre o perfil do parceiro, com "Voltar para …").

Seções (sob demanda):
- **Resumo** — carreira encerrada (data, idade, anos no circuito, principal parceiro), Títulos/Torneios/Vitórias (% de partidas)/Derrotas, Melhor posição, Pontos Race (ou Anos no circuito para aposentado), Títulos por categoria, "Ver no ranking mundial" (fora do Ranking).
- **Resultados** — por temporada (dos resultados carregados) e lista de torneios: tier, data, parceiro do torneio (por id), colocação, pontos; "Mostrar mais".
- **Parcerias** — atual + encerradas com período (sem datas inventadas), motivo gravado, títulos juntos (legado); registro parcial declarado.
- **Jogo** — OVR, OVR máximo, estilo, forma; atributos técnicos (só se gravados; senão estado neutro); comportamento em quadra (valores reais, "—" quando falta); personalidade, traços, entrevista, treinador preferido; torcida/patrocínio/treinador arredondados; relações.

## 6. Navegação verificada

Diretório → Perfil; Perfil → Parceiro → "Voltar para"; Perfil → Ranking; Ranking → Perfil (mesma posição); Mundo → Ranking → Perfil; linha do jogador → `/career/athlete`; deep link `?athlete=` e recarregar; voltar do navegador fecha o perfil e mantém o diretório. A URL não é reescrita com o modal aberto (o ModalShell guarda a própria entrada de histórico; um replace quebraria o "voltar").

## 7. Medições

| | Antes | Depois |
|---|---|---|
| 1ª linha da lista (390px) | y 568 | y 458 |
| Controles de filtro visíveis | 11 | 10 (3 selects recolhidos) |
| Atletas alcançáveis (t10) | 200 | catálogo inteiro |
| Perfis de teste abertos | 6 de 16 (aposentados, comum t10 e sem parceiro da carreira nova inacessíveis) | 16 de 16 |
| Overflow / corte / erro JS | 0 | 0 (diretório 2×6 viewports, perfis 2×2) |

Desempenho (`perf.json`, mesma sessão, medianas, build de desenvolvimento):

| | Carreira nova | Temporada 10 |
|---|---|---|
| Abrir diretório | 82 → 120 ms | 661 → 754 ms |
| Buscar | 18 → 31 ms | 24 → 29 ms |
| Abrir perfil | 20 → 28 ms | 22 → 25 ms |
| Alternar seção | — → 18 ms | — → 19 ms |

O custo extra do diretório (+38/+93 ms) vem de ler/ordenar o catálogo inteiro (1.141–1.423 atletas, antes 200) e das linhas mais ricas; a maior parte da base (~650 ms em t10) é a montagem pré-existente (ensureAthleteProfiles, generateRelationships, snapshot). Filtrar+ordenar o catálogo: ~4 ms; abrir perfil (leituras): ~4–50 ms; 0 gravações ao abrir perfil (testado).

## 8. Achado de integridade (pré-existente, NÃO alterado)

A montagem do diretório chama, desde antes desta fase, `ensureAthleteProfiles()` e `generateRelationships()` (`directory-writes.json`, temporada 10 em memória):

- `ensureAthleteProfiles` **criou 282 perfis de bots** ausentes do save, todos sem pontos, alguns com OVR 92–98 e ao menos um **segundo "Alejandro Galán"** (`player-real-…`) além do real (`real_alejandro_galan`);
- `generateRelationships` **regravou as relações de 199 atletas** na 1ª abertura e de 22 na 2ª (usa `Math.random` no score de mentor).

Ou seja, abrir o diretório altera o save. Antes ficava escondido pelo corte de 200; agora esses perfis aparecem no diretório (sem posição, no fim da ordenação por ranking). Mudar isso exige decisão sobre persistência/geração de dados — fora do escopo autorizado. Recomendação: avaliar remover essas chamadas da montagem (ou torná-las idempotentes e determinísticas) numa fase funcional própria.

## 9. Testes e regressão

- `test-athletes-profile-v532c`: **58 PASS**.
- `test-athletes-mobile-containment-v532c`: **160 PASS** (nova + temporada 10; 0 erro de JS).
- Gates: lint ✓ · build ✓ · validate:architecture ✓ · `git diff --check` ✓.

Regressão (`tests.json`): seleção 5.32-A + 5.32-B + atletas = **216 testes · 184 pass · 0 regressões · 32 falhas preexistentes** (falham igual no HEAD, com os 4 arquivos de UI trocados temporariamente pela versão do HEAD e restaurados com SHA conferido).

- Timeout: `test-partner-athlete-idempotency-v512` (simulação de 6 seeds × 1 temporada) estourou o limite nos dois lados — o mesmo da 5.32-A/B.
- Intermitente: `test-long-career-partner-ecology-v518` passou nesta rodada (na 5.32-B passou e falhou com o mesmo código).
- Preexistentes: as 31 da 5.32-B (sem o ecology) + o timeout acima; nenhuma toca Diretório/Perfil.
- Efeito colateral da bateria: testes de simulação regravaram relatórios versionados de outras fases (`reports/progression-economy-526/*`, `reports/fase15-simulation.json` etc.) — restaurados ao HEAD.

## 10. Pendências

- Escritas na montagem do diretório (§8) — decisão funcional.
- Divergência `ranking_position` gravado × posição atual (357/380 em t10) — investigação funcional separada.
- Atributos técnicos não existem para atletas do circuito (0/1.141): o perfil diz isso em vez de barras vazias.
- Torneios não têm rota de perfil de atleta (não criada).
- Smoke test Android físico (Ranking, Mundo, Atletas).

## 11. Evidências

`before/`, `after/` (PNGs ignorados pelo Git; `measurements.json`), `compare/` (11 comparativos), `functional.json`, `tests.json`, `perf.json` (+ `perf-run1.json` bruto), `directory-writes.json`, `tools/`.
