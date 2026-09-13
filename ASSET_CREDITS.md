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

### Game-icons.net (CC BY 3.0)

Raquete e tênis usam ícones do [game-icons.net](https://game-icons.net), que não têm
equivalente genérico adequado no Lucide:

- **Raquete** — [`tennis-racket`](https://game-icons.net/1x1/delapouite/tennis-racket.html), por **Delapouite** ([site](https://delapouite.com))
- **Tênis** — [`running-shoe`](https://game-icons.net/1x1/delapouite/running-shoe.html), por **Delapouite** ([site](https://delapouite.com))

Licenciados sob [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) — uso
permitido com atribuição ao autor, mantida aqui conforme exigido pela licença. Os
arquivos originais (fundo preto + glyph branco, viewBox 512×512) foram normalizados
para o padrão do jogo (fundo transparente, cor neutra de material, viewBox 100×100) via
`transform` (translate + scale); o `path` original do glyph não foi alterado. Fonte:
[github.com/game-icons/icons](https://github.com/game-icons/icons).
