# Branding Hotfix 9.2

## Resultado

O master canônico único é `src/assets/brand/app-icon-master.png` (1024×1024),
SHA-256 `c6a01daedd842c232c91c545f252177dda56ef1d26809af41115c2dc661bc743`.
Ele é o master já derivado tecnicamente do asset fornecido pelo usuário,
`ChatGPT Image 14 de ago. de 2026, 08_31_39(1).png`, sem redesenho da
raquete ou da bola.

`scripts/generate-branding-hotfix-9-2.py` é o pipeline reproduzível. Ele usa
somente downscale LANCZOS, sharpen leve até 64 px e extração cromática do
foreground Android. Não contém primitivas que redesenhem raquete, furos,
cabo ou bola. `src-tauri/icons-src/icon-manifest.json` registra o hash do
master e dos derivados.

## Assets alternativos encontrados

O Hotfix 9.1 introduziu uma raquete geométrica alternativa em:

- `src/assets/brand/logo-app-mark.svg`;
- `src/assets/brand/app-icon-small.svg`;
- `src/assets/brand/app-icon-small.png`;
- `src-tauri/icons-src/app-icon-simplified.png`;
- frames `small-16/24/32.png`, favicons pequenos, foreground Android e parte
  dos PNGs iOS derivados dessa arte.

Os quatro masters/variantes alternativos foram removidos. Os arquivos de
saída que continuam necessários foram sobrescritos por downscales do master
oficial. O gerador artístico 9.1 também foi removido. Os SVGs históricos
`logo-mark.svg`, `logo-horizontal.svg` e `logo-monochrome.svg` permanecem
apenas como compatibilidade inativa; nenhum código da aplicação os importa.

## Superfícies internas

`BrandMark` agora importa diretamente `app-icon-master.png?url`. Isso migra,
sem mudança de layout, sidebar/drawer, LoadingScreen/Home shell, Landing,
CareerManager, Auth e Settings/Sobre. Nenhum `P` antigo nem asset 9.1 está
ativo nessas superfícies.

## Web, Windows e mobile

- Favicon: 16, 24, 32, 48 e 64 px; PWA: 192 e 512 px.
- ICO Windows: frames PNG 16, 24, 32, 48, 64 e 256 px, todos do master.
- Windows/Tauri: PNGs standalone, Appx/Store logos e `icon.ico` regenerados.
- Android legado: todas as densidades usam downscale do master completo.
- Android adaptive: fundo sólido `#B4E605`; foreground transparente extraído
  da mesma raquete e bola do master dentro da safe area.
- iOS: 18 PNGs preparados em `src-tauri/icons/ios`; nenhum projeto iOS foi
  criado.

A contact sheet temporária é gerada em
`src-tauri/target/branding-hotfix-9-2/icon-contact-sheet.png` com
16/24/32/48/64/256. A inspeção visual confirmou a mesma arte em todos os
tamanhos; a perda de detalhe em 16/24 px ocorre apenas pelo downscale.

## Bundle e builds

O import do master pelo `BrandMark` adiciona um asset estático de 998,61 kB
ao build web. Ele não é duplicado por superfície e não aumenta o chunk JS.

Antes do build Windows foi executado
`cargo clean -p padel-legacy --release` (246,8 MiB removidos). O executável
`src-tauri/target/release/padel-legacy.exe` foi recompilado e
`verify-exe-icon.mjs` encontrou byte a byte os seis frames do ICO dentro do
PE final.

Artefatos finais:

- `src-tauri/target/release/bundle/nsis/Padel Legacy_0.9.0_x64-setup.exe`;
- `src-tauri/target/release/bundle/msi/Padel Legacy_0.9.0_x64_en-US.msi`.

O fluxo completo `npm run app:build` recompilou o app, mas o WiX falhou nas
validações ICE porque o Windows Installer Service não ficou acessível à ação
ICE neste ambiente (`LGHT0217`/`LGHT0216`). O MSI foi então linkado do
`main.wixobj` produzido pelo próprio Tauri usando `light.exe -sval`, que
suprime somente essa validação ambiental. O bundle NSIS foi concluído pelo
comando `npm run app:build -- --bundles nsis` sem erro.

## Validação automatizada

- `test:branding-hotfix-9-2`: 130 verificações, OK;
- `test:branding-final`: 67 verificações, OK;
- `test:branding-hotfix-9-1`: compatibilidade delegada ao 9.2, OK;
- `test:app-icon-pipeline`: 34 verificações, OK;
- `test:ui-redesign`: 183 verificações, OK;
- `test:ui-shell`: 89 verificações, OK;
- `test:home-redesign`: 37 verificações, OK;
- `test:mobile-foundation`: 68 verificações, OK;
- `lint`: OK;
- `build`: OK.

## QA manual restante

Validar em instalação real o Desktop, Menu Iniciar, Explorer, taskbar e
ícone da janela, considerando o cache de ícones do Windows. Em Android,
validar máscaras circular/squircle em um launcher real. Em iOS, validar os
assets no Xcode quando um projeto iOS for criado.
