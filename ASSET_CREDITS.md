# Créditos de assets

## Ícones de item da Loja (categoria × raridade)

`public/assets/items/*.svg` — silhuetas normalizadas (viewBox, cor, stroke-width) a
partir de bibliotecas de ícones open source. O sistema de cor/anel/halo por raridade é
próprio do jogo; as silhuetas de categoria abaixo não são.

### Lucide (ISC)

Grip, bola, roupa, mochila, acessorio_tec, colecionavel e acessorio usam ícones do
[Lucide](https://lucide.dev) (`cylinder`, `circle`, `shirt`, `backpack`, `watch`,
`trophy`, `package`) — mesma biblioteca já usada em outras telas do jogo via
`lucide-react`. Licença ISC, não exige atribuição, incluída aqui por completude.

### Tabler Icons (MIT)

Tênis usa o ícone [`shoe`](https://tabler.io/icons/icon/shoe) do
[Tabler Icons](https://tabler.io/icons) — Lucide não tinha ícone de calçado genérico.
Tabler usa a mesma convenção de desenho do Lucide (viewBox 24×24, stroke-width 2,
contorno sem preenchimento — mesma linhagem visual, derivada de Feather Icons), então
entra na mesma família visual sem precisar de tratamento diferente. Licença MIT, não
exige atribuição, incluída aqui por completude.

### Raquete — construída, não vem de biblioteca

Nenhuma biblioteca verificada (Lucide, Tabler, Phosphor, Iconoir, Game-icons.net) tem um
ícone de raquete de PADEL como objeto genérico isolado: as únicas opções eram raquete de
tênis (cabeça alongada, cordas — [`tennis-racket`](https://game-icons.net/1x1/delapouite/tennis-racket.html)
do Game-icons.net, autor Delapouite, CC BY 3.0) ou uma cena de jogada de ping-pong
(raquete+bola+trajetória — `ping-pong` do Tabler/Phosphor), nenhuma das duas fiel ao
formato de uma raquete de padel real (cabeça curta e larga, corpo sólido sem cordas).
O ícone de raquete é por isso construído a partir de primitivas SVG na mesma convenção
24×24 das demais 8 categorias — sem depender de nenhuma licença de terceiros: cabeça
curta e larga (elipse) + cabo em trapézio (mesma peça, pescoço mínimo), com uma grade
densa de 16 furos pequenos e uniformes e um recorte oval vazado na junção cabeça↔cabo,
ambos via `<mask>` SVG (transparência real, não cor fixa) — e um laço aberto de cordão de
pulso. Passou por várias rodadas de iteração: tentativas com poucos furos grandes ou
simétricos liam como rosto/chocalho/alfinete; a grade densa e uniforme foi o que
resolveu, e o recorte na garganta evita a leitura de "objeto sólido numa vara".
