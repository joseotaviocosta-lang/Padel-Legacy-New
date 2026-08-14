# Branding Hotfix 9.1

## Auditoria anterior à alteração

- O ícone grande vinha de `src/assets/brand/app-icon-master.png` (1024×1024) e já tinha boa leitura em 48px ou mais.
- Os frames 16/24/32 do ICO eram substituídos por `src-tauri/icons-src/small-*.png`, derivados de `app-icon-simplified.png`. Essa versão havia fechado os furos por morfologia.
- `public/favicon.png` usava a mesma simplificação sem furos.
- A UI interna renderizava o “P” geométrico de `logo-mark.svg` por meio da fonte única `BrandMark`.
- Os consumidores ativos de `BrandMark` eram AppLayout/sidebar, CareerManager, Landing, Settings/Sobre e AuthLayout. A auditoria também encontrou um “P” direto no LoadingScreen legado compartilhado.
- Os assets iOS pequenos também exibiam a simplificação sem furos. O adaptive foreground Android vinha do master detalhado, mas seus furos eram frágeis sob máscara.

## Implementação

- `logo-app-mark.svg`: símbolo compacto de raquete + bola para 26–64px dentro do app.
- `app-icon-small.svg` e `app-icon-small.png`: master manual para ícones pequenos.
- `generate-branding-hotfix-9-1.py`: gera assets sem erosão/dilatação, com 4/6/9 furos explícitos em 16/24/32px.
- `patch-icon-small-frames.mjs`: injeta somente 16/24/32 no ICO; 48/64/256 permanecem detalhados.
- Favicons separados em 16 e 32px usam os respectivos frames pequenos.
- O adaptive foreground Android usa a raquete simplificada com furos transparentes sobre fundo verde sólido.
- Assets iOS de 20/29/40 pt usam o small master; 60pt ou mais continuam no master detalhado.

O arquivo `src-tauri/icons-src/app-icon-simplified.png` é mantido apenas como artefato compatível de geração e não é referenciado pelo pipeline ativo. `logo-mark.svg` permanece como alias compatível, mas seu desenho foi migrado e nenhum componente ativo o importa.

## Diagnóstico

O gerador cria uma contact sheet temporária em:

`src-tauri/target/branding-hotfix-9-1/icon-contact-sheet.png`

Esse caminho está sob `target/`, portanto não entra no bundle nem no Git e pode ser removido por `cargo clean`.
