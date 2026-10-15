# Auditoria visual 5.20-B — inventario de problemas (Parte B)

Fonte: medicao automatizada em Chrome real sobre a build de desenvolvimento,
15 paginas x 4 viewports (1920, 1366, 390, 360), com a carreira criada pela
propria UI. Dados em `reports/screenshots-520b/`.

## Correcao de instrumento (ler antes dos numeros)

O baseline desta fase reportou dezenas de "estouros de viewport" por pagina
(Minha Dupla 30, Ranking 30, Equipe 15). **Esses numeros estavam errados.**

O medidor classificava um elemento como estouro acidental olhando o
`overflow-x` do PROPRIO elemento. Com isso, todo filho de um carrossel
horizontal contava como defeito: o HUD do cabecalho (`.pl-game-hud`,
`overflow-x: auto`) sozinho somava 13 falsos positivos em 360px, e um circulo
decorativo posicionado de proposito para fora do cartao de Financas somava mais
um — aparado por um ancestral `overflow-hidden`, ele nunca chegou a aparecer.

O medidor agora sobe a arvore e separa tres destinos, dos quais so um e defeito:

| destino | significado | e defeito? |
|---|---|---|
| rolavel | ancestral com `overflow-x: auto/scroll` | nao, mas custa descoberta |
| aparado | ancestral com `overflow-x: hidden/clip` | nao, e decoracao proposital |
| cortado | nada contem o elemento, a pagina e empurrada | sim |

### Resultado com o instrumento corrigido

**Nenhuma pagina rola horizontalmente em 360px ou 390px.** Nas 30 medicoes,
`document.scrollWidth - window.innerWidth = 0`, e a contagem de conteudo
cortado e zero. Nao ha defeito de overflow a corrigir no app.

## O problema real: conteudo escondido atras de rolagem lateral

O que de fato prejudica o jogador no celular nao e conteudo cortado, e conteudo
alcancavel **somente** por uma rolagem lateral que a tela nao anuncia. Medido em
360px, pela soma do que falta aparecer em cada carrossel da pagina:

| pagina | escondido | composicao |
|---|---|---|
| Torneios | 559px | 466px barra de 19 abas; 55px HUD; 38px chips |
| Notificacoes | 496px | 496px fila de chips de filtro |
| Ranking | 450px | 294px HUD; 156px abas |
| Financas | 424px | 424px fila de chips de filtro |
| Minha Dupla | 379px | 305px HUD; 74px abas |
| Treinos e Equipamentos | 296px | 115px HUD; 181px abas |
| Relacoes | 266px | 266px chips |
| Equipe | 193px | 193px HUD |
| Atletas e Clubes | 76px | 60px HUD; 16px abas |
| Objetivos | 64px | 64px HUD |
| Central do Circuito | 20px | 20px abas |
| Home | 118px | 118px HUD |
| Mercado | 9px | 9px superficie |
| Meu Atleta, Estatisticas | 0 | — |

Tres causas, todas em componentes compartilhados — por isso uma correcao
atinge muitas paginas de uma vez:

1. **HUD do `PageHeader`** (`.pl-game-hud`) — maior ofensor em 8 paginas.
2. **Barras de aba** (`[role='tablist']`) — pior caso Torneios.
3. **Filas de chips de filtro** (`flex flex-nowrap`) — pior caso Notificacoes.

## Classificacao

### P0 — impede a tarefa
Nenhum. Nao ha conteudo inalcancavel nem pagina quebrada em 360px.

### P1 — esconde opcao sem anunciar
- HUD do cabecalho esconde os ultimos indicadores em 8 paginas (ate 305px).
- Barra de abas de Torneios esconde 466px: a maioria das 19 abas nasce fora da
  tela.
- Filas de chips de Notificacoes (496px), Financas (424px) e Relacoes (266px)
  escondem a maior parte dos filtros.
- Minha Dupla, mesmo reduzida a 4 abas, pedia 410px para 344px disponiveis:
  "Historico" ficava fora da tela.

### P2 — densidade
- Torneios renderiza 332 cartoes numa pagina.
- Estatisticas 45, Home 43, Mercado 35, Financas 32.

### P3 — polimento
- Alvos de toque abaixo de 44px: ate 6 por tela (Relacoes).
- Balao de ajuda flutuante cobre conteudo do ultimo cartao em 360px.

## Correcoes aplicadas nesta fase

| o que | onde | efeito medido |
|---|---|---|
| Minha Dupla: 7 abas -> 4 + 3 filtros de mercado | `src/pages/PartnerHub.jsx` | abas de 1o nivel 7 -> 4 |
| Trilho utilitario deixou de cobrir o CTA no mobile | `src/components/system/FloatingUtilityRail.jsx` | verificado em captura |
| HUD: fila rolavel -> grade de 2 colunas no mobile | `src/index.css` | HUD sai da lista de ofensores em TODAS as paginas |
| Abas: icone escondido no mobile | `src/index.css` | em medicao |

### Efeito da correcao do HUD (escondido atras de rolagem, 360px)

| pagina | antes | depois | sobrou |
|---|---|---|---|
| Torneios | 559px | 466px | barra de 19 abas |
| Ranking | 450px | 156px | barra de abas |
| Minha Dupla | 379px | 66px | barra de abas |
| Treinos e Equipamentos | 296px | 105px | barra de abas |
| Equipe | 193px | 0 | — |
| Home | 118px | 0 | — |
| Atletas e Clubes | 76px | 16px | barra de abas |
| Objetivos | 64px | 0 | — |
| Notificacoes | 496px | 496px | chips (nao tem HUD) |
| Financas | 424px | 424px | chips (nao tem HUD) |
| Relacoes | 266px | 266px | chips (nao tem HUD) |

Quatro paginas passaram a mostrar tudo sem rolagem lateral. O que resta divide-se
em duas causas, nenhuma resolvivel por CSS:

- **barras com abas demais** (Torneios, 19 abas) — Partes P/Q/R;
- **filas de chips de filtro** (Notificacoes, Financas, Relacoes) — precisam
  virar outro controle, nao um trilho que rola.

---

## Estado final medido (360px, instrumento na versao 4)

Todas as 15 paginas: `innerWidth = clientWidth = scrollWidth = 360`, conteudo
cortado = 0, conteudo escondido atras de rolagem lateral = 0 em 13 delas
(restam Ranking 36px e Mercado 9px).

| pagina | escondido antes | depois | o que mudou |
|---|---|---|---|
| Torneios | 559px | 0 | 11 categorias viraram seletor no mobile |
| Notificacoes | 496px | 0 | FilterPills quebra linha |
| Ranking | 450px | 36px | HUD em grade; abas sem icone |
| Financas | 424px | 0 | FilterPills quebra linha |
| Minha Dupla | 379px | 0 | 7 abas -> 4; HUD em grade; abas sem icone |
| Treinos | 296px | 0 | HUD em grade; abas sem icone |
| Relacoes | 266px | 0 | FilterPills legado quebra linha |
| Equipe | 193px | 0 | HUD em grade |
| Home | 118px | 0 | HUD em grade |
| Atletas e Clubes | 76px | 0 | HUD em grade; abas sem icone |
| Objetivos | 64px | 0 | HUD em grade |
| Central do Circuito | 20px | 0 | abas sem icone |

Defeito real encontrado e corrigido: **Relacoes** era a unica pagina cujo layout
ficava mais largo que o aparelho (innerWidth 389 contra clientWidth 360),
deixando o botao "Sincronizar" fora da tela. Causa: item `flex-1` sem
`min-w-0` — um item flex nao encolhe abaixo da largura do proprio conteudo.

## Licao: o medidor errou tres vezes, a tela nenhuma

| versao | o que media | o que escondia |
|---|---|---|
| 1 | `overflow-x` do proprio elemento | contava todo filho de carrossel como bug; inflou o baseline inteiro |
| 2 | sobe ao ancestral que rola | separou rolavel de cortado, mas contava decoracao aparada |
| 3 | ignora tudo que um ancestral apara | **escondeu o botao inalcancavel de Relacoes** |
| 4 | aparado so nao conta se NAO for interativo; mais `layoutWiderThanDevice` | — |

Nas tres vezes o erro apareceu ao OLHAR a captura, nunca no numero. Duas
correcoes de produto desta fase so existem porque a captura foi conferida:

- a grade do HUD, na primeira versao, truncava o VALOR ("50/…") — pior que a
  rolagem que ela veio substituir;
- a quebra de linha das 11 categorias de Torneios mostrou todas as opcoes e
  empurrou a LISTA DE TORNEIOS inteira para fora da tela.

Nenhuma das duas aparecia como regressao em metrica nenhuma: ambas MELHORAVAM
o numero que estava sendo otimizado.

---

## Parte P — densidade de Torneios (custo renderizado, 360px)

| medida | antes | depois |
|---|---|---|
| cartoes no DOM | 333 | **76** |
| altura da pagina | 54.779px | **7.753px** |
| cartoes nos 3 primeiros ecrãs | 19 | 19 |

A causa nao era o cartao, era o volume: 151 torneios renderizados de uma vez,
dos quais o jogador via 19 sem rolar 68 telas. A pagina passou a se comportar
como agenda — dois meses abertos (o corrente e o seguinte, horizonte real de
decisao porque a inscricao fecha em D-4) e os demais como cabecalho com
contagem, expansivel ao toque. Nada foi removido.

### Divergencia entre o proxy e a medida direta

O gate estrutural do M4.1 conta **tags JSX no fonte** como proxy da
complexidade da tela. A mudanca de agenda SOMOU 3 tags ao fonte (o cabecalho de
mes fechado e marcacao nova) enquanto o DOM renderizado encolheu 4x:

| | antes | depois |
|---|---|---|
| tags JSX no fonte (proxy) | 51 | 71 |
| cartoes no DOM (direto) | 333 | 76 |

O proxy passou a contradizer a medida direta daquilo que ele aproxima. O gate
NAO foi afrouxado: fica vermelho e documentado. A decisao de substituir o proxy
pela medida direta e do dono do projeto.

## Parte Q — aberta, com evidencia visual

Cada cartao de torneio empilha titulo, duas tarjas de categoria, botao "Ver
detalhes", descricao de duas linhas, data, vagas, uma linha "Analise do
treinador" com estado proprio ("Chave principal", "Nao elegivel") e um rodape de
tres numeros — ~340px de altura e pelo menos quatro estados competindo. E
exatamente o que a Parte Q proibe com "um estado principal por cartao".
