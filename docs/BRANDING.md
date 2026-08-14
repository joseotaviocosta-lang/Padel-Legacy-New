# Branding — fundação (Fase 2)

Data: 2026-08-12

> **Fase 9 concluída** (2026-08-14): o pacote completo de app icons
> (Windows/Android/iOS/favicon) foi gerado a partir de uma referência visual
> fornecida pelo usuário — ver `docs/BRANDING_FINAL.md`. Esta página
> descreve a fundação vetorial (Brand Mark/Wordmark) entregue na Fase 2, que
> **continua em uso** dentro do app (sidebar, drawer, auth, Settings) — ela
> não foi substituída pelo app icon novo, só complementada por ele.

Esta fase entrega a **fundação** da identidade visual do Padel Legacy — o
pacote completo de ícones exportados (Fase 9) ainda depende de ferramentas de
geração de imagem que não fazem parte deste ambiente. Nada binário inválido
foi inventado: tudo aqui é SVG vetorial ou arquivos de configuração válidos.

## Conceito

Um "P" geométrico com uma bola no pé da haste — padel (bola) + Padel Legacy
(P) + progressão (a bola funciona como um ponto final, um marco).
Construído inteiramente com retângulos e arcos de raio fixo (fórmula de
retângulo arredondado padrão), **sem curvas desenhadas à mão livre** — decisão
deliberada para o símbolo permanecer nítido e proporcional em qualquer
resolução, incluindo 16×16, sem depender de ajuste visual iterativo.

```
┌─────────────┐
│  ┌──╮        │
│  │  │        │   P maiúsculo geométrico
│  │  ╯        │   + bola (círculo) no pé da haste
│  │      ●    │
└─────────────┘
```

Cores: fundo = `--primary` (verde padel, `#98E822`), glifo =
`--primary-foreground` (quase-preto, `#0A0D14`). Os hex são uma conversão
manual dos tokens HSL de `src/index.css`; se a cor da marca mudar, atualize os
dois valores nos SVGs junto com os tokens.

## Arquivos entregues

| Arquivo | Uso |
|---|---|
| `src/assets/brand/logo-mark.svg` | Símbolo com selo de fundo (badge quadrado arredondado) — usado no app (sidebar, drawer mobile) via `<BrandMark>` (`src/components/design-system/BrandMark.jsx`) |
| `src/assets/brand/logo-monochrome.svg` | Só o glifo, `fill="currentColor"`, sem fundo — para impressão, marca d'água, fundos variáveis |
| `src/assets/brand/logo-horizontal.svg` | Selo + wordmark "PADEL LEGACY" + motivo de "degraus ascendentes" (legado/progressão) — para splash/documentos/cabeçalhos largos |
| `public/favicon.svg` | Cópia do `logo-mark.svg`, referenciada em `index.html` — favicon local, sem depender mais de `base44.com/logo_v2.svg` |
| `public/manifest.json` | Criado nesta fase (antes só existia como artefato gerado em `dist/`, quebrado na árvore de código-fonte) — referencia só o ícone SVG existente, sem entradas PNG inventadas |

## O que NÃO foi feito nesta fase (propositalmente)

- **Ícones do Tauri** (`src-tauri/icons/`) — permanecem os 4 arquivos atuais
  (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`), como fallback.
  `src-tauri/tauri.conf.json` não foi alterado.
- **`apple-touch-icon`** — não adicionado a `index.html`. iOS não renderiza SVG
  de forma confiável nesse `<link>`; precisa de um PNG real.
- **Versão compacta** (ícone reduzido para espaços muito pequenos, ex. favicon
  de aba de navegador com o wordmark cortado) — o `logo-mark.svg` já cobre
  esse caso (foi desenhado para 16px desde o início), então uma "versão
  compacta" separada não agrega nada novo nesta fase.

## Exportações da Fase 9 (concluídas)

A Fase 9 **não** exportou o `logo-mark.svg` para PNG — o app icon oficial
passou a ser um asset fotorrealista fornecido pelo usuário (raquete + bola),
tratado como uma peça separada do Brand Mark (ver seção acima e
`docs/BRANDING_FINAL.md`). `src-tauri/icons/*`, os mipmaps Android e o
conjunto iOS foram todos regenerados a partir desse novo master. O único
item desta lista original que se manteve ligado ao SVG é `manifest.json`,
que agora usa PNGs (`favicon.png`/`icon-192.png`/`icon-512.png`, gerados do
app icon novo, não do `logo-mark.svg`) — detalhes completos em
`docs/BRANDING_FINAL.md`.

## Uso no código

```jsx
import { BrandMark } from '@/components/design-system';

<BrandMark size={40} className="shadow-[0_0_24px_hsl(var(--primary)/0.2)]" />
```

`BrandMark` renderiza `logo-mark.svg` como `<img>` (Vite resolve o import para
uma URL de asset). Não usa `currentColor`/inlining — se um uso futuro precisar
recolorir o glifo dinamicamente, inline o SVG de `logo-monochrome.svg`
diretamente como JSX em vez de referenciá-lo via `<img>` (imagens SVG
carregadas por URL não herdam `currentColor` da página).
