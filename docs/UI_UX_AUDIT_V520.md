# Playthrough 5.20 — Parte A: auditoria de rotas e navegação

Medido em 2026-10-01 contra `HEAD=d5e5a2e` (working tree da 5.19).

## Métricas "antes"

| métrica | valor |
|---|---|
| grupos no sidebar | 6 |
| itens de menu (folhas) | **38** |
| entradas clicáveis no sidebar (grupos + itens) | 44 |
| rotas declaradas em `App.jsx` | **57** (56 + catch-all) |
| navegação móvel | **já existe** — `BottomNav.jsx`, 5 colunas + bottom sheet "Mais" |

Ponto de partida relevante: a navegação **já passou por uma consolidação**
(`docs/NAVIGATION_ARCHITECTURE.md`), que substituiu 6 macroáreas com paridade
quebrada entre desktop e mobile. O que resta é o excesso de itens DENTRO dos
grupos — principalmente "Carreira" (11) e "Mundo" (7).

## Tabela de auditoria

"Tamanho" é o número de linhas do componente de página — proxy objetivo para
"esta página justifica uma entrada própria no menu?". Não é medida de uso real
(não há telemetria no projeto); está registrado como proxy, não como uso.

| Área | Página atual | Rota | Tamanho | Pode unir? | Destino sugerido |
|---|---|---|---|---|---|
| Início | Centro da Carreira | `/game` | — | não | **Início** (mantém) |
| Carreira | Atleta | `/profile` | 229 | sim | **Meu Atleta** › Perfil |
| Carreira | Aparência | `/character` | 202 | sim | **Meu Atleta** › Aparência |
| Carreira | Objetivos | `/game/missions` | 602 | não | **Objetivos** (mantém) |
| Carreira | Centro de treinamento | `/training-center` | 139 | sim | **Treinos & Equipamentos** › Treinos |
| Carreira | Equipamentos | `/game/inventory` | 306 | sim | **Treinos & Equipamentos** › Inventário |
| Carreira | Loja | `/game/shop` | 551 | sim | **Treinos & Equipamentos** › Loja |
| Carreira | Minha dupla e propostas | `/partners` | 707 | não | **Minha Dupla** (reduzir abas internas) |
| Carreira | Treinador principal | `/coaches` | 420 | sim | **Equipe** › Treinador |
| Carreira | Comissão técnica | `/staff` | 220 | sim | **Equipe** › Comissão |
| Carreira | Relacionamentos | `/relationships` | 141 | sim | **Relações** › Pessoas |
| Carreira | Fãs e torcidas | `/fans` | 157 | sim | **Relações** › Fãs |
| Competir | Torneios | `/tournaments` | 930 | não | **Torneios** (mantém) |
| Competir | Calendário | `/game/calendar` | 631 | sim | **Torneios** › Calendário (sai do sidebar) |
| Competir | Ranking | `/ranking` | 329 | não | **Ranking** (mantém) |
| Competir | Temporada | `/game/season` | **78** | sim | **Ranking** › Temporada (página mais fina do menu) |
| Mundo | Notícias | `/journal` | 184 | sim | **Central do Circuito** › filtro Circuito |
| Mundo | Eventos mundiais | `/world-events` | 199 | sim | **Central do Circuito** › filtro Circuito |
| Mundo | Imprensa | `/press` | 594 | sim | **Central do Circuito** › filtro Imprensa |
| Mundo | Comunidade e rede | `/community` | 174 | sim | **Central do Circuito** › filtro Comunidade |
| Mundo | Atletas | `/athletes` | 190 | sim | **Atletas & Clubes** › Atletas |
| Mundo | Clubes | `/clubs` | 135 | sim | **Atletas & Clubes** › Clubes |
| Mundo | Clima | `/weather` | 232 | **auditar** | ver nota abaixo |
| Gestão | Economia | `/game/economy` | 257 | não | **Finanças** (renomear) |
| Gestão | Mercado mundial | `/world-market` | 199 | não | **Mercado** (mantém) |
| Gestão | Administração | `/admin` | **66** | sim | ferramenta de dev — sair do menu do jogador |
| Gestão | Banco de dados | `/database` | — | sim | ferramenta de dev — sair do menu do jogador |
| Mais | Estatísticas | `/game/stats` | 344 | não | **Estatísticas** (mantém) |
| Mais | Legado | `/game/legacy` | 384 | não | **Legado** (mantém) |
| Mais | Notificações | `/communications` | 213 | sim | **sino do header** (sai do menu) |
| Mais | História do padel | `/history` | 147 | sim | **Enciclopédia** › História |
| Mais | Hall da fama | `/hall-of-fame` | 147 | sim | **Legado** › Hall da fama |
| Mais | Enciclopédia | `/encyclopedia` | 135 | não | **Enciclopédia** (recebe História) |
| Mais | Configurações | `/settings` | 191 | não | **Configurações** (mantém) |

### Nota sobre Clima (Parte Q)

`Weather.jsx` tem 232 linhas, mas a pergunta da Parte Q é se há **decisão**
envolvida. Precisa de verificação no código antes de decidir: se o clima
afeta partida/treino, o contexto pertence ao torneio e ao pré-jogo; se é
apenas informativo, não justifica entrada no menu.

### Nota sobre Administração e Banco de dados

`/admin` (66 linhas) e `/database` são ferramentas de diagnóstico, não
features de carreira. Ocupam 2 das 38 entradas do menu do jogador.

## Estrutura proposta (Parte B / AJ)

```
Início                          1

Carreira                        6
  Meu Atleta        (Perfil · Atributos · Aparência)
  Objetivos
  Treinos e Equipamentos  (Treinos · Inventário · Loja)
  Minha Dupla
  Equipe            (Treinador · Comissão)
  Relações          (Pessoas · Fãs)

Competir                        2
  Torneios          (Próximos · Inscrito · Resultados · Calendário)
  Ranking           (Circuito · Race · Duplas · Jogadores · Temporada)

Mundo                           2
  Central do Circuito  (Hoje · Notícias · Imprensa · Comunidade)
  Atletas e Clubes     (Atletas · Clubes · Países)

Gestão                          2
  Finanças
  Mercado

Mais                            4
  Estatísticas
  Legado            (+ Hall da fama)
  Enciclopédia      (+ História do padel)
  Configurações
```

**38 → 17 itens** (6 grupos mantidos). Nenhuma rota removida: todas ganham
redirect para o novo destino com a aba correta (Parte AH).
