# Mobile M4.1 — Game / App Feel Polish

## Escopo e invariantes

Esta fase altera exclusivamente apresentação e hierarquia de interação no mobile. Não altera gameplay, engine, RNG, progressão, economia, atributos, ranking, calendário, torneios, treino, saves, persistência M3.7, checkpoint, missões, recompensas ou balanceamento.

O trabalho reaproveita o design system e o shell existentes. Como o ambiente de automação não possui navegador instalado, os gates visuais de 390×800 e landscape não foram simulados nem marcados como aprovados. A suíte `test-mobile-game-feel-m4-1.mjs` valida estrutura, ordem, touch targets, safe areas e proxies de DOM; a confirmação visual permanece no checklist Android físico.

## Auditoria das 14 áreas da M4

| Área | KEEP | COMPACT | MERGE | MOVE TO DETAILS | REMOVE DUPLICATE |
|---|---|---|---|---|---|
| Home | identidade, objetivo, evento, ações | título, HUD, ações | objetivo + próximo evento em uma superfície | ferramentas e contexto secundário | badges de ranking/OVR/XP separados |
| Treinos | energia, fadiga, custo, ganho, limite diário | header, tabs, rows de atividade | estado curto no HUD | intensidade, estado do atleta e recuperação | badges/moedas/treinador repetidos no topo |
| Partidas | Jogar agora, limite diário, resultados | header e linhas recentes | estatísticas no HUD | detalhes no modal existente | faixa de quatro stats |
| Torneios | inscrição, tier, filtros, evento | header e ação do evento | próximo evento + status + tier no HUD | tooltip e detalhes do torneio | card do próximo evento e contadores de tier redundantes |
| Ranking | posição do usuário e filtros | leaderboard em linhas | resumo do circuito no HUD | detalhes já existentes | blocos de estatística separados |
| Atletas | ranking, OVR, lado, idade, estilo | filtros e scouting rows | dados essenciais numa linha | fase/forma/decisões completas no AthleteDetail | cards grandes por atleta e fileiras extras de tabs |
| Dupla | parceiro, química, confiança, ofertas | header de gestão | resumo da equipe no HUD | histórico e gestão já existentes | stats separados no topo |
| Comissão | vagas, folha, sinergia, liderança | header e roster | resumo da comissão no HUD | detalhes/contratação | hero e quatro métricas duplicados do StaffPanel |
| Missões | missão atual, progresso, recompensa, concluídas | tabs e quest rows | tutorial/conquistas/ativas no HUD | concluídas em CollapsibleSection | faixa de stats separada e tabs dentro de Surface |
| Calendário | +1/+3/+7, decisões, agenda | header e faixa de avanço | data/energia/fadiga/evento no HUD | detalhes do dia no modal | grade de status repetida abaixo do header |
| Técnicos | OVR, salário, afinidade, disponibilidade | roster rows | estado do mercado no HUD | benefícios completos/requisitos | cards glass individuais e tiles internos |
| Comunicações | não lidas, decisões, busca, ações | inbox rows e ação “Marcar lidas” | contadores no HUD | conteúdo/decisão no modal | stats separados e cards por mensagem |
| Imprensa | impacto, tipo, jornalista, leitura | news rows | fãs/patrocínios/moral no HUD | artigo completo no modal | stats separados e cards por artigo |
| Evolução | grupos de atributos, ganhos e histórico | SurfaceHeader e agrupamentos | atributos por categoria compartilhada | conteúdo expansível existente | lista plana e wrapper glass próprio |

## Primitives e shell

- `GameHud` apresenta valores curtos como uma faixa única com separadores, sem criar outro card.
- `PageHeader` recebe `hudItems`/`hudLabel`; no mobile denso remove borda, glass, descrição, breadcrumb e espaço de hero. O desktop mantém sua composição.
- `Surface`, `SurfaceHeader`, `CompactListItem`, `CompactActionCard` e `Tabs` ganharam hierarquia de radius/padding/separadores adequada ao mobile.
- Ação `primary` recebe peso de jogo e resposta pressed; disabled/loading continuam nos primitives existentes.
- Bottom nav mantém a arquitetura Início/Carreira/Competir/Mundo/Mais e o alvo de toque; o ícone ficou dominante, label menor, seleção mais clara e transição de 150 ms.
- Header global usa 56 px mais safe area; bottom nav usa 64 px mais safe area. O próximo evento mostra rótulo compacto, preservando `aria-label`/`title` completos.
- GuideButton fica 8 px acima da bottom nav/safe area, enquanto o conteúdo reserva mais 56 px para evitar cobrir ações.
- CSS de landscape curto reduz apenas padding/ícone do hero/HUD/gaps, sem animação pesada.

## Proxy estrutural de DOM

Sem browser, a medição abaixo conta tags JSX que geram DOM, containers JSX e sinais de card (`Surface`, `CompactStats`, `StatCard`, `glass`, radii grandes). É um proxy reprodutível, não uma contagem runtime.

| Página | Tags JSX | Containers | Sinais de card |
|---|---:|---:|---:|
| Home | 94 → 96 | 44 → 46 | 36 → 42 |
| Treinos | 23 → 23 | 16 → 16 | 9 → 9 |
| Partidas | 18 → 18 | 9 → 9 | 4 → 2 |
| Torneios | 51 → 49 | 21 → 21 | 9 → 7 |
| Calendário | 34 → 24 | 14 → 9 | 5 → 5 |

Nas quatro páginas operacionais Treinos/Partidas/Torneios/Calendário, o agregado caiu de 126 para 114 tags JSX (-9,5%), de 60 para 55 containers (-8,3%) e de 27 para 23 sinais de card (-14,8%). A Home não foi declarada como redução de DOM: a fusão preservou objetivo e evento e adicionou separadores/estrutura sem esconder informação. O ganho ali é de superfícies top-level e hierarquia, não de tags brutas.

## Projeção para 390×800

Estas são garantias estruturais, pendentes de confirmação visual física:

- Treinos: header compacto + HUD + modo + categoria + primeira atividade/action aparecem antes de Estado do atleta/Recuperação.
- Partidas: header/HUD e Jogar agora precedem imediatamente o início de Recentes.
- Home: atleta/HUD e Treinar/Competir/Agenda precedem a superfície integrada de objetivo/evento.
- Torneios: evento/status/tier e Abrir evento ficam no mesmo header, antes de status/filtros do circuito.

Não há promessa de “zero scroll”. A meta é reduzir o caminho até a decisão sem ocultar energia, fadiga, custo, ganho, inscrição, adversário, ranking ou risco.

## Validação física pendente

1. Em 390×800, confirmar os quatro gates acima e contar scroll até cada ação.
2. Tocar Treinar, Jogar agora, Abrir evento, +1/+3/+7, Aceitar e Contratar; conferir pressed, disabled e loading.
3. Abrir tabs/segmented controls e listas de Ranking, Atletas, Técnicos, Mensagens e Imprensa.
4. Confirmar que o GuideButton não cobre nenhuma ação, inclusive com barra gestual Android.
5. Girar para landscape curto e verificar header, sino, menu, HUD, tabs e bottom nav sem overflow horizontal.
6. Repetir rotas com teclado Android aberto e confirmar que a bottom nav continua ocultando/restaurando corretamente.
