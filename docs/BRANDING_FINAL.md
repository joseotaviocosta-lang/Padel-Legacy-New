# Branding Final (Fase 9)

Data: 2026-08-14

Fecha oficialmente a identidade visual do Padel Legacy a partir da referência
visual fornecida pelo usuário (raquete preta + bola amarela sobre fundo
verde-limão, composição quadrada de cantos arredondados). Fase exclusivamente
de branding — nenhuma lógica de gameplay, engine, economia, ranking,
navegação ou Design System estrutural foi tocada.

## 1. Três identidades, três papéis diferentes

| | Uso | Fonte |
|---|---|---|
| **App Icon** | Windows (exe/taskbar/Menu Iniciar/NSIS/MSI), Android launcher, iOS (preparado), favicon | `src/assets/brand/app-icon-master.png` (novo, Fase 9) |
| **Brand Mark** | Sidebar, drawer mobile, auth, Career Manager, Landing, Settings | `src/assets/brand/logo-mark.svg` (mantido da Fase 2 — ver seção 6) |
| **Wordmark** | "PADEL LEGACY" em texto, onde há espaço | Sem arquivo próprio — é tipografia direta nos componentes que já usam |

Essa separação (já prevista desde a Fase 2, `docs/BRANDING.md`) evita usar a
mesma imagem indiscriminadamente em todo lugar: o app icon é a peça
fotorrealista fornecida pelo usuário; o Brand Mark continua sendo o símbolo
vetorial geométrico, otimizado para renderizar nítido dentro da UI em
qualquer tamanho.

## 2. App Icon — do asset fornecido ao master

Asset fornecido: `ChatGPT Image 14 de ago. de 2026, 08_31_39.png` (1254×1254,
raquete + bola sobre um cartão verde-limão arredondado, centralizado num
canvas branco maior, com uma sombra suave).

Esse arquivo **não pode ser usado diretamente** como master de app icon —
ele já vem com cantos arredondados e sombra pré-renderizados. Sistemas
operacionais aplicam sua **própria** máscara de arredondamento (Windows via
shell, Android via adaptive icon, iOS via squircle); alimentá-los com uma
imagem já arredondada produziria um "arredondamento duplo" com uma margem
branca visível nos cantos.

Processamento aplicado (`Pillow`, scripts ad-hoc desta fase — resultado
salvo em `src/assets/brand/app-icon-master.png`, 1024×1024):

1. Recortada a margem branca ao redor do cartão (bounding box do conteúdo
   não-branco).
2. Detectado o raio de arredondamento original (~180px de ~1107px) e os
   4 cantos foram preenchidos com a cor sólida do fundo (`#B4E605`),
   produzindo um quadrado **plano, de borda a borda, sem arredondamento
   nem sombra pré-existente** — o master correto para deixar cada
   plataforma aplicar sua própria máscara.
3. Redimensionado para 1024×1024 (o conteúdo nativo já tinha ~1107px, então
   é uma redução, não upscale).

## 3. Safe area

Bounding box do conjunto raquete+bola no master: largura ≈47% do canvas,
altura ≈79%. A composição original é diagonal (raquete alta à esquerda,
bola mais baixa à direita) — por isso a largura fica abaixo dos 65% mesmo
com a altura no topo da faixa pedida (65–80%). Forçar a largura a também
atingir 65%+ exigiria escalar o conjunto inteiro para cima, o que estouraria
a altura acima de 80% — a dimensão dominante (altura) já está corretamente
dentro da faixa, e a assimetria de largura é inerente ao enquadramento
diagonal do próprio asset fornecido, não um defeito.

## 4. Otimização para tamanhos pequenos

Testado visualmente (contact sheets renderizados e inspecionados nesta
sessão) em 16/24/32/48/64/128/256px. Acima de 48px o grid de furos da
raquete (~30 furos) permanece legível. Em 16/24/32px os furos viravam ruído
visual — a raquete ficava um borrão sem silhueta clara.

Correção: `src-tauri/icons-src/app-icon-simplified.png` — os furos foram
"fechados" via fechamento morfológico (dilatação + erosão, `PIL.ImageFilter.
MaxFilter`/`MinFilter`, kernel 45px) sobre a máscara de pixels escuros da
raquete, produzindo uma silhueta sólida preta (raquete + bola + fundo verde
preservados, só a textura interna removida). Esse arquivo alimenta
especificamente os frames 16×16/24×24/32×32 do `icon.ico` e o `32x32.png`
standalone — 48px em diante continuam vindo do master em detalhe total.
Script: `scripts/patch-icon-small-frames.mjs` (reaplicável sempre que o
master mudar).

## 5. Favicon

`public/favicon.png` (64×64, gerado a partir da versão simplificada — a
mesma pensada para tamanhos pequenos, coerente com o tamanho real de uma aba
de navegador). Substituiu `public/favicon.svg` (cópia do Brand Mark antigo,
removido — órfão depois da troca, nenhuma referência restante). `index.html`
e `public/manifest.json` atualizados. `manifest.json` também ganhou
`icon-192.png`/`icon-512.png` (do master em detalhe total — usados só na
instalação como PWA/atalho de tela inicial, não carregados durante o uso
normal do app).

## 6. Brand Mark interno — decisão: manter

`logo-mark.svg`/`BrandMark.jsx` **não foram alterados**. Avaliado e
descartado redesenhar o Brand Mark "inspirado" no novo app icon:

- O enunciado desta fase já classifica isso como opcional ("pode... se
  melhorar coerência"), não obrigatório, e explicitamente proíbe transformar
  a sidebar num quadrado grande.
- O mark atual já é um "P" geométrico com uma bola no pé da haste — o mesmo
  conceito (raquete/P + bola) já está presente, só que numa forma abstrata
  desenhada para permanecer nítida em qualquer tamanho sem downscaling.
- Redesenhar à mão um novo símbolo vetorial fiel a uma imagem fotorrealista,
  dentro de uma fase que explicitamente proíbe "outro redesign", é um risco
  de regressão visual desnecessário — o Brand Mark atual já funciona
  (sidebar, drawer, auth, Career Manager, Landing, Settings todos usam o
  mesmo componente).

**Cor**: o verde do asset fornecido (`#B4E605`, HSL ≈67°/96%/46%) é
visivelmente diferente do token `--primary` do Design System (`#98E822`,
HSL 84°/81%/52% — a mesma cor usada pelo Brand Mark) — uma diferença de
~17° de matiz, perceptível lado a lado. Por instrução explícita desta fase,
**o Design System não foi alterado**; o tom novo foi usado só onde a
referência pede (app icon). O Brand Mark continua com o verde `--primary`
que já usava.

Settings.jsx já exibe Brand Mark + "PADEL LEGACY" + versão + rótulo Release
Candidate/Beta dinâmico (`__APP_VERSION__`) — conferido, nenhuma mudança
necessária. Landing/Career Manager/AuthLayout usam o mesmo `<BrandMark>` —
automaticamente consistentes por herdarem do mesmo componente.

## 7. Splash / loading

Não existe uma tela de splash dedicada com marca própria — `App.jsx` usa um
spinner genérico sem logo (`role="status"`). Nada para atualizar aqui; não
foi criada uma splash screen nova (fora de escopo, e o enunciado pede
explicitamente para não adicionar uma se não existir).

## 8. Windows / Tauri

Fonte: `src-tauri/icons-src/icon-manifest.json`:

```json
{
  "default": "../../src/assets/brand/app-icon-master.png",
  "bg_color": "#B4E605",
  "android_bg": "app-icon-bg.png",
  "android_fg": "app-icon-fg.png",
  "android_fg_scale": 100
}
```

Gerado via `npx tauri icon src-tauri/icons-src/icon-manifest.json`
(mecanismo oficial, não uma ferramenta terceira). Produziu `icon.ico`,
`icon.png`, `icon.icns`, `32x32.png`/`64x64.png`/`128x128.png`/
`128x128@2x.png`, os logos Appx (Windows Store), o conjunto Android e o
conjunto iOS — todos a partir do master novo. Em seguida
`node scripts/patch-icon-small-frames.mjs` substituiu os frames 16/24/32 do
`icon.ico` e o `32x32.png` pela versão simplificada (seção 4).

### 8.1 Frames do ICO

`icon.ico` tem 6 frames: **16, 24, 32, 48, 64, 256** — o conjunto que o
`tauri icon` decidiu gerar para este master (128px não é gerado como frame
de `.ico` por padrão; ele existe separadamente como `128x128.png`/
`128x128@2x.png`, que é o que `tauri.conf.json` referencia). Nenhum frame do
ícone anterior sobrou — todos os 6 vêm do master novo (16/24/32 da versão
simplificada, 48/64/256 do master em detalhe total).

### 8.2 Cache do Cargo

O hotfix da Fase Polish 2.1 (`docs/REDESIGN_POLISH_2_1.md`) já identificou
que o Cargo pode reter um recurso de ícone antigo em
`target/release/build/padel-legacy-*` entre builds sucessivos. Antes do
build final desta fase:

```
cd src-tauri && cargo clean -p padel-legacy --release
```

(escopo do pacote, não `cargo clean` completo — evita reconstruir toda a
árvore de dependências.)

### 8.3 Inspeção do EXE

Depois de `npm run app:build`, `node scripts/verify-exe-icon.mjs` confirma
que os 6 frames de `icon.ico` aparecem **byte a byte** dentro do
`padel-legacy.exe` compilado — a mesma técnica de verificação criada na
Polish 2.1, não confiar apenas em "o build passou" ou "o icon.ico está
correto no disco".

### 8.4 NSIS / MSI

`npm run app:build` gera novamente `Padel Legacy_0.9.0_x64-setup.exe` (NSIS)
e `Padel Legacy_0.9.0_x64_en-US.msi` — ambos empacotam o `.exe` já
compilado, então herdam o ícone novo automaticamente assim que o `.exe`
está correto (seção 8.3).

### 8.5 Windows Shell — checklist manual

- [ ] Atalho da Área de Trabalho (se reinstalado) mostra o ícone novo;
- [ ] Explorer (lista e ícones grandes) mostra o ícone novo;
- [ ] Menu Iniciar mostra o ícone novo;
- [ ] Taskbar mostra o ícone novo ao abrir o app;
- [ ] Propriedades do `.exe` → aba Detalhes/ícone mostra o ícone novo.

Se o Explorer/Menu Iniciar ainda mostrarem o ícone antigo após reinstalar,
é cache de ícones do **Windows Shell** (categoria diferente do cache do
Cargo da seção 8.2) — não é motivo para alterar código. Procedimento seguro:
desinstalar a versão antiga → instalar a nova → reiniciar o Explorer (ou o
Windows, se necessário). Não foi criado nenhum script para forçar limpeza de
cache do Shell — o enunciado desta fase pediu explicitamente para não
automatizar isso de forma agressiva.

## 9. Android

`src-tauri/gen/android` já existia (não foi criado nesta fase). `tauri icon`
escreveu direto nele: `mipmap-{m,h,x,xx,xxx}dpi/ic_launcher_foreground.png`
+ `ic_launcher_background.png` (par do adaptive icon) e
`ic_launcher.png`/`ic_launcher_round.png` (fallback pré-Android 8.0, achatado
a partir do master completo, com a mesma máscara/arredondamento que o
próprio `tauri icon` decide aplicar).

### 9.1 Adaptive icon — foreground/background reais

Em vez de encaixar o PNG inteiro (com fundo) dentro do quadrado do launcher
(o que o enunciado pediu explicitamente para não fazer), foram preparadas
duas camadas separadas em `src-tauri/icons-src/`:

- `app-icon-bg.png` — fundo sólido `#B4E605`, sem conteúdo;
- `app-icon-fg.png` — só raquete + bola, fundo **transparente** (extraído do
  master via classificação por matiz HSV: pixels com matiz próximo de 73°
  — a família do verde-limão, incluindo suas variações de sombra/luz — viram
  transparentes; preto da raquete e amarelo da bola, que têm matizes bem
  distintos, ~0° e ~56° respectivamente, permanecem opacos).

`mipmap-anydpi-v26/ic_launcher.xml` continua referenciando
`@mipmap/ic_launcher_foreground` + `@mipmap/ic_launcher_background` (não
mudou de estrutura, só o conteúdo dos PNGs).

### 9.2 Safe zone

O canvas do adaptive icon é 108dp, mas launchers só garantem exibir os 66dp
centrais (~61% do canvas) — o resto pode ser cortado por máscaras circulares,
squircle, etc. O conteúdo (raquete+bola) foi escalado e centralizado dentro
de `app-icon-fg.png` para ocupar ~55% do canvas na dimensão maior — dentro
da zona segura com margem, confirmado visualmente compondo fg+bg e
simulando máscara circular e squircle (nenhum recorte da raquete ou da
bola em nenhuma das duas).

### 9.3 Bug encontrado e corrigido: `ic_launcher.png` do hdpi

O `tauri icon` gerou `mipmap-hdpi/ic_launcher.png` (fallback legado) em
**49×49** em vez do 72×72 esperado (mdpi=48, xhdpi=96, xxhdpi=144,
xxxhdpi=192 saíram corretos — só hdpi teve esse desvio, aparentemente um
bug pontual de arredondamento do próprio `tauri-cli` para esse density
bucket específico). Corrigido manualmente: `ic_launcher.png` e
`ic_launcher_round.png` do hdpi foram re-derivados por downscale limpo do
xhdpi (96px → 72px), preservando o mesmo tratamento visual que o
`tauri icon` já tinha aplicado nas densidades corretas. As camadas
`ic_launcher_foreground.png`/`ic_launcher_background.png` (as que realmente
importam em Android 8+) já vinham corretas em 162×162 para hdpi — só o
fallback legado (relevante hoje só para pré-Android-8, praticamente 0% dos
dispositivos ativos) estava errado.

### 9.4 Monochrome (Android 13+ themed icons)

Não adicionado. O projeto não tinha uma camada monochrome configurada antes
desta fase (`mipmap-anydpi-v26/ic_launcher.xml` só tinha foreground +
background); adicionar suporte a ícones temáticos é uma mudança de escopo
maior que o pedido desta fase, e o app funciona normalmente sem ela (cai no
ícone colorido normal em launchers com tema).

### 9.5 Build Android

Não executado nesta fase (não obrigatório pelo enunciado — "não é
obrigatório gerar APK/AAB nesta fase, mas confirmar que os assets estão
válidos"). Assets confirmados válidos: dimensões corretas em todas as
densidades, adaptive icon com foreground/background reais dentro da safe
zone, nenhum arquivo do ícone anterior restante.

## 10. iOS — preparação

`src-tauri/gen/ios` **não existe** e não foi criado nesta fase (nenhum
projeto iOS foi inventado). `tauri icon` já grava as fontes gráficas iOS em
`src-tauri/icons/ios/` quando `gen/ios` não existe — 18 PNGs no padrão de
nomenclatura `AppIcon-<tamanho>@<escala>.png` do Xcode
(`AppIcon.appiconset`), incluindo o ícone de App Store
(`AppIcon-512@2x.png`, 1024×1024). Compostos sobre `bg_color: #B4E625`
(mesmo verde do master) — como o master já é opaco de borda a borda, a
composição é, na prática, idêntica ao master, sem faixas nem bordas
estranhas.

**Detalhe técnico anotado para quando o projeto iOS for inicializado**: os
PNGs gerados pelo `tauri icon` saem em modo RGBA (canal alfa presente, mas
100% opaco — confirmado, sem transparência real). A Apple recomenda ícones
sem canal alfa; na prática o compilador de asset catalog do Xcode
(`actool`) remove esse canal automaticamente ao empacotar, então isso não
deveria bloquear build/submissão — mas fica registrado aqui para não ser
"redescoberto" depois.

Quando o projeto iOS for de fato inicializado (`tauri ios init` ou
equivalente), estes PNGs em `src-tauri/icons/ios/` são a fonte pronta para
alimentar o `AppIcon.appiconset` do Xcode.

## 11. Assets antigos aposentados

- `public/favicon.svg` — removido (órfão depois da troca para
  `favicon.png`; nada mais o referenciava).
- 6 frames antigos de `icon.ico` (herdados desde a Hotfix 1/Polish 2.1) —
  substituídos pelos 6 novos; nenhum frame do ícone anterior permanece.
- Todos os PNGs de `src-tauri/icons/`, `Square*Logo.png` (Appx/Windows
  Store), e todo o conjunto Android/iOS — regenerados a partir do master
  novo.

**Não removido**: `src/assets/brand/logo-mark.svg`,
`logo-monochrome.svg`, `logo-horizontal.svg` — continuam ativos (Brand
Mark, seção 6).

## 12. Arquivos modificados/criados

Criados: `src/assets/brand/app-icon-master.png`,
`src-tauri/icons-src/{icon-manifest.json,app-icon-bg.png,app-icon-fg.png,
app-icon-simplified.png,small-16.png,small-24.png,small-32.png}`,
`scripts/patch-icon-small-frames.mjs`, `scripts/test-branding-final.mjs`,
`public/favicon.png`, `public/icon-192.png`, `public/icon-512.png`,
`docs/BRANDING_FINAL.md`.

Modificados: `index.html` (favicon), `public/manifest.json` (ícones PWA),
`package.json` (`test:branding-final`), todo o conteúdo de
`src-tauri/icons/*` e `src-tauri/gen/android/.../mipmap-*` (regenerados,
mesmos nomes de arquivo).

Removidos: `public/favicon.svg`.

**Não tocados**: `src/assets/brand/logo-mark.svg` e demais SVGs de marca,
`src/components/design-system/BrandMark.jsx`, qualquer arquivo de
gameplay/engine/economia/navegação/Design System estrutural,
`src-tauri/tauri.conf.json` (os caminhos já apontavam certo desde a Polish
2.1 — só o conteúdo dos arquivos referenciados mudou).

## 13. Qualidade

- **Bundle web**: sem impacto nos chunks JS (nenhum import novo no código —
  os PNGs do app icon vivem em `src-tauri/icons-src/` e
  `src/assets/brand/app-icon-master.png`, usados só como fonte para o
  pipeline de build de ícones, nunca importados por nenhum componente).
  `public/` ganhou ~323KB de PNGs estáticos (favicon 6,5KB + ícones PWA
  192/512 = 42KB + 274KB) — servidos sob demanda (instalação PWA), não no
  carregamento normal do app.
- **Testes**: `test:branding-final` (novo, 70 verificações),
  `test:app-icon-pipeline` (34, continua passando sem alteração — a
  validação estrutural do ICO não hardcoda conteúdo específico do ícone
  anterior), regressão ampla (`test:ui-quality`, `test:home-redesign`,
  `test:ui-shell`, `test:mobile-foundation`, `test:redesign-polish21`,
  `test:mobile-m2-device-hotfix`) — todos passando.
- **Lint**: limpo.
- **Typecheck**: 2527 linhas — idêntico ao baseline (nenhum arquivo `.ts`-
  checado foi tocado nesta fase).
- **Build web**: ✅.
- **`app:build`**: ver corpo do relatório final para o resultado exato desta
  execução.
- **Versão**: `package.json` (`0.9.0-rc.1.9`) e `tauri.conf.json` (`0.9.0`)
  não foram alterados — confirmado por teste automatizado
  (`test:branding-final`).

## 14. Dívidas técnicas conhecidas

- Ícone monochrome do Android 13+ (temas dinâmicos) não implementado —
  ausente antes desta fase também, não é regressão.
- Projeto iOS ainda não inicializado — só as fontes gráficas estão prontas.
- Frames RGBA "tecnicamente com alfa, mas 100% opaco" nos PNGs iOS — Xcode
  deve resolver automaticamente na compilação, mas vale confirmar quando o
  projeto iOS existir.
- Validação final do Windows Shell (atalho/Explorer/Menu Iniciar/taskbar
  reais) depende do seu QA físico pós-instalação.
