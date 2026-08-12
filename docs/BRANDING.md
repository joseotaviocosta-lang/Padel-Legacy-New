# Branding — fundação (Fase 2)

Data: 2026-08-12

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

## Exportações pendentes para a Fase 9

A partir do SVG mestre (`logo-mark.svg`), gerar e substituir:

- `src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png` (256×256),
  `icon.ico` (multi-resolução: 16/32/48/256) — pacote Windows/Tauri.
- `512x512.png`, `1024x1024.png` — Android/iOS (splash, ícone de loja).
- `apple-touch-icon.png` (180×180).
- PNGs de fallback do `manifest.json` (`192x192`, `512x512`) para navegadores
  que não suportam ícone SVG em PWA manifest.

Ferramenta recomendada: qualquer exportador SVG→PNG determinístico
(`@resvg/resvg-js`, `sharp`, ou o pipeline de ícone do próprio `tauri icon
<path>`), rodando sobre `src/assets/brand/logo-mark.svg` como fonte única —
não redesenhar a mão para cada resolução.

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
