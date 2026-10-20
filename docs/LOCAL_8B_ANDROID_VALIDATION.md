# LOCAL-8B — Preparação da validação no Android físico

Fase de **preparação**. Nada foi instalado no celular, nenhum código de produção, configuração, assinatura ou versão foi
alterado, e nenhuma senha foi manuseada. Dados técnicos completos: `reports/local-8b-android-validation/preparation.json`.

## 1. Ambiente

| Ferramenta | Estado |
|---|---|
| Node / npm | v24.21.0 / 11.19.0 |
| Rust / Cargo | 1.98.1, com targets `aarch64`, `armv7`, `i686` e `x86_64-linux-android` |
| JDK | OpenJDK 17.0.20.1 (Adoptium), `JAVA_HOME` definido |
| Tauri CLI | 2.11.4 |
| Gradle | 8.14.3 pelo wrapper do projeto (nenhum Gradle global) |
| Android SDK | **dois** instalados: `C:\Android\Sdk` (NDK 26.3.11579264, build-tools 35/36, android-36) e `%LOCALAPPDATA%\Android\Sdk` (NDK 29.0.13846066-**beta3**, build-tools 35/36, android-36/37) |
| ADB | 1.0.41 em ambos os SDKs, **fora do PATH** |
| Variáveis | `ANDROID_HOME`, `ANDROID_SDK_ROOT` e `NDK_HOME` **não definidas** no Windows |

Nenhuma ferramenta precisou ser instalada. O build usou `ANDROID_HOME=C:\Android\Sdk` e `NDK_HOME=…\ndk\26.3.11579264`
(NDK estável), só no processo do build. Não foi possível saber qual NDK os builds anteriores usaram: o `.so` não guarda
essa informação, e não há `local.properties`.

**Dispositivo:** `adb devices -l` retornou a lista **vazia**, então nenhum celular foi detectado. Modelo, versão e ABI ficam
pendentes até a conexão (ver §8).

## 2. Configuração de build

| Item | Valor |
|---|---|
| Comando oficial | `npm run android:build` (`tauri android build`) |
| applicationId / namespace | `com.padellegacy.game` |
| versionCode / versionName | 9007 / 0.9.0 (`tauri.conf.json` → `tauri.properties`) |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |
| Permissões | `INTERNET` (mais a permissão interna padrão de receiver) |
| Assinatura no Gradle | só com `src-tauri/gen/android/keystore.properties`, que está **ausente** (o `.txt` versionado está vazio). Por isso o release sai **sem assinatura** |
| Persistência | `TauriStorage`: arquivos JSON no **AppData privado** do app (`careers/<id>.json`, índice e `backups/`). Web: IndexedDB do navegador (origem diferente; os dados **não** são compartilhados) |

Uma atualização via `adb install -r` com o **mesmo pacote e o mesmo certificado** preserva o AppData, ou seja, as carreiras.
Com certificado diferente, o Android **recusa** a atualização (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). A recusa não apaga dados,
mas obrigaria a desinstalar, o que está proibido.

## 3. Assinatura

- Keystore persistente `%USERPROFILE%\PadelLegacy-Keys\padel-legacy-release.jks`: **existe** (3 636 bytes). O conteúdo não foi
  lido e a senha não foi pedida.
- Alias `padel-legacy`: **não verificado**, porque exige a senha da keystore. Fica pendente.
- O último APK assinado do projeto (`Padel-Legacy-CLOUD-6O.apk`, 2026-10-18, versionCode 9007) usa o certificado de release
  SHA-256 **`c9fc42134c1898d6af7e4dc45e0634b21d899a321e769191c6b3c57c612d2a78`**.
- Builds mais antigos (fases M3.x e Fase 15) usaram o certificado **Android Debug** (`2924f0d2…e90a6`). **É preciso confirmar
  qual certificado está no celular** antes de instalar (§7).

## 4. APK candidato

| Item | Valor |
|---|---|
| Resultado | build concluído (1 612 s), `lint`, `build`, `validate:architecture` e `git diff --check` ok |
| Arquivo | `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk` (cópia em `reports/local-8b-android-validation/apk/Padel-Legacy-LOCAL-8B-unsigned.apk`, fora do Git) |
| Tamanho | 56 073 189 bytes |
| SHA-256 | `afd90ed932d5eccb5eaf6d3d0a160b9c80cb506ca500cdbc06c3742878d4f6d8` |
| Tipo | universal release, **sem assinatura** (`apksigner`: DOES NOT VERIFY, esperado) |
| Pacote | `com.padellegacy.game`, versionCode 9007, versionName 0.9.0 |
| ABIs | arm64-v8a, armeabi-v7a, x86, x86_64 |
| AAB | `…/bundle/universalRelease/app-universal-release.aab` (não usado) |

O build não alterou nenhum arquivo rastreado (só os cinco falsos positivos de `src-tauri` de sempre).

## 5. Saves de teste

| Cenário | Arquivo | Tamanho | SHA-256 | Data no jogo | `validateCareerData` |
|---|---|---|---|---|---|
| A | carreira nova, criada no aparelho | — | — | — | — |
| B | `reports/local-8a-career-audit/run10/save-season-5.json` | 38,8 MB | `dc627960…db10d7` | 2031-01-04 | ok |
| C | `reports/local-8a-career-audit/run10/save-season-10.json` | 67,5 MB | `0bfbd36d…5db9c7` | 2036-01-03 | ok |

As cópias para o teste ficam em `reports/local-8b-android-validation/saves/` (fora do Git, idênticas aos originais). O formato é
o arquivo de carreira expandido (sem `history_pack`), o mesmo que o `TauriStorage` grava. **Os dois têm o mesmo `career_id`.**

### 5.1 Importação: não existe caminho seguro hoje

- O jogo tem `CareerManager.importCareer(data)`, que é **seguro**: valida, recusa um `career_id` existente, acrescenta uma carreira
  ao índice e desfaz a gravação em caso de falha. Mas **nenhuma tela o chama**.
- As ferramentas beta têm "Exportar save" (download do JSON) e "Criar backup interno" (cópia dentro do AppData), mas **não
  importam**.
- Copiar o arquivo direto para o AppData exigiria um build **depurável** (`adb shell run-as`). Ele tem outra assinatura e não
  pode ser instalado por cima do atual sem desinstalar, o que está proibido.
- O release não habilita o DevTools do WebView, então não dá para chamar `importCareer` pelo console remoto.

**Conclusão: os cenários B e C não podem ser executados no aparelho sem uma decisão** (§9). O cenário A pode, depois da
autorização de instalação.

## 6. Roteiro de testes no aparelho

**Antes de tudo (em todos os cenários):** abrir **Configurações → Performance** e ligar o monitor (`perfdebug`, persistente e
desligado por padrão). O overlay mostra `load-career` e `advance-day` medidos pelo jogo (`profileAction`), FPS, long tasks e
nós do DOM.

| # | Ação | A (nova) | B (T5) | C (T10) |
|---|---|---|---|---|
| 1 | Abrir o app (cronômetro até a tela de carreiras) | ✓ | ✓ | ✓ |
| 2 | Criar carreira / carregar save (`load-career`) | ✓ | ✓ | ✓ |
| 3 | Tela principal pronta | ✓ | ✓ | ✓ |
| 4 | Avançar 1 dia (`advance-day`) ×5 | ✓ | ✓ | ✓ |
| 5 | Avançar 7 dias | ✓ | ✓ | ✓ |
| 6 | Avançar 30 dias | ✓ | ✓ | ✓ |
| 7 | Abrir Ranking (Mundial → Duplas) | ✓ | ✓ | ✓ |
| 8 | Abrir Calendário / Histórico | ✓ | ✓ | ✓ |
| 9 | Inscrever-se e jogar uma partida de torneio | ✓ | ✓ | ✓ |
| 10 | Fechar o app (remover dos recentes) e reabrir; conferir data e progresso | ✓ | ✓ | ✓ |

**Coleta pelo PC (não destrutiva, com o celular no USB):**

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb shell dumpsys meminfo com.padellegacy.game | Select-String "TOTAL PSS|TOTAL RSS|Java Heap|Native Heap"
& $adb logcat -v time -T 1 | Select-String "padellegacy|FATAL EXCEPTION|ANR in|chromium"   # só linhas novas; nada é apagado
```

**Métricas planejadas:** mediana, p95 e pior caso de `advance-day` (a partir dos valores anotados do overlay; ≥ 5 amostras por
cenário), tempo de `load-career`, tempo de abertura (cronômetro), PSS total e pico (`dumpsys meminfo` antes, durante e depois de
avançar 30 dias), crashes e ANR (`logcat`), tamanho do save (reportado pelo inspetor de save das ferramentas beta). **Tempo de
gravação isolado:** não há medição dedicada no release; ele está incluído em `advance-day`. Registrar como métrica não
disponível separadamente.

**Classificação (critérios da fase):** P0 = save corrompido ou perdido, app não abre, carreira não continua, crash recorrente;
P1 = ANR, travamentos frequentes, gravação extremamente lenta, avanço impraticável; P2 = lentidão progressiva, carregamento
demorado, memória elevada sem crash; P3 = pequenos atrasos ou problemas cosméticos.

## 7. Procedimento de instalação (somente com autorização)

1. **Conectar e identificar** (somente leitura):
   ```powershell
   & $adb devices -l
   & $adb shell getprop ro.product.model; & $adb shell getprop ro.build.version.release; & $adb shell getprop ro.product.cpu.abi
   & $adb shell dumpsys package com.padellegacy.game | Select-String "versionCode|versionName|lastUpdateTime"
   ```
2. **Certificado instalado** (não destrutivo: copia o APK instalado para o PC, sem tocar nos dados):
   ```powershell
   $p = (& $adb shell pm path com.padellegacy.game) -replace '^package:',''
   & $adb pull $p "$env:TEMP\padel-installed-base.apk"
   & "C:\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --print-certs "$env:TEMP\padel-installed-base.apk" | Select-String "SHA-256"
   ```
   O resultado tem de ser `c9fc4213…612d2a78`. Se for o certificado Android Debug ou outro, **parar**: a atualização seria recusada.
3. **Backup dentro do app** (antes de instalar): Ferramentas beta → "Criar backup interno" (sobrevive à atualização) e "Exportar
   save" (se o download funcionar no WebView, guardar o arquivo).
4. **Assinar o candidato (feito por você**, a senha é pedida de forma interativa e não aparece no log):
   ```powershell
   $bt = "C:\Android\Sdk\build-tools\36.0.0"; $d = "C:\Projetos\Padel-Legacy-Integracao\reports\local-8b-android-validation\apk"
   & "$bt\zipalign.exe" -P 16 -f 4 "$d\Padel-Legacy-LOCAL-8B-unsigned.apk" "$d\Padel-Legacy-LOCAL-8B-aligned.apk"
   & "$bt\apksigner.bat" sign --ks "$env:USERPROFILE\PadelLegacy-Keys\padel-legacy-release.jks" --ks-key-alias padel-legacy --out "$d\Padel-Legacy-LOCAL-8B.apk" "$d\Padel-Legacy-LOCAL-8B-aligned.apk"
   & "$bt\apksigner.bat" verify --print-certs "$d\Padel-Legacy-LOCAL-8B.apk" | Select-String "SHA-256"
   ```
5. **Instalação pretendida** (atualização que preserva os dados; **nunca** `uninstall` nem `pm clear`):
   ```powershell
   & $adb install -r "C:\Projetos\Padel-Legacy-Integracao\reports\local-8b-android-validation\apk\Padel-Legacy-LOCAL-8B.apk"
   ```
6. **Recuperação:** se a instalação falhar (`INSTALL_FAILED_UPDATE_INCOMPATIBLE` ou `…VERSION_DOWNGRADE`), o app atual continua
   instalado e com os dados intactos. **Não desinstalar.** Reinstalar o APK anterior (`Padel-Legacy-CLOUD-6O.apk`, mesmo
   certificado) com `install -r`, se for necessário voltar. Os backups internos (passo 3) podem ser restaurados pelas
   ferramentas beta.

**Riscos para os saves:** com o mesmo pacote e o mesmo certificado, o `install -r` mantém o AppData. O versionCode do candidato
(9007) é igual ao do último APK. Se o aparelho tiver um versionCode maior, a instalação é recusada sem dano. O candidato muda
o código do jogo (fases LOCAL-7D a 7H.1), e as carreiras existentes serão lidas pelo código novo. As fases mantêm
compatibilidade de saves, e torneios concluídos não são reprocessados.

## 8. Pendências

1. **Celular não detectado.** Conectar por USB, desbloquear, ligar a **Depuração USB** (Opções do desenvolvedor), escolher o modo
   USB "Transferência de arquivos" se o aparelho pedir, e aceitar o aviso "Permitir depuração USB" com a impressão digital do PC.
   Conferir com `adb devices -l`; o aparelho deve aparecer como `device`, e não como `unauthorized`.
2. **Alias e assinatura:** dependem da senha da keystore (passo 4, feito por você).
3. **Certificado instalado no celular:** passo 2, depois da conexão.
4. **Importação dos saves B/C:** decisão (§9).

## 9. Decisões e autorizações necessárias

1. **Autorizar a instalação** do candidato assinado (passos 1–5 da §7), depois que o certificado do aparelho for confirmado.
2. **Cenários B e C.** Alternativas, sem implementar nada nesta fase:
   - **(a) Recomendada:** uma fase própria com um ponto de entrada **QA-only** para importar um save por seletor de arquivo,
     usando o `CareerManager.importCareer` já existente (seguro, não sobrescreve), visível só com `perfdebug` ligado. Exige
     alteração de código e um novo APK.
   - (b) Medir B e C no **desktop** (Tauri Windows ou navegador) com os mesmos saves, aceitando que não é o Android.
   - (c) Construir as carreiras no próprio aparelho avançando o calendário: impraticável (cerca de 1 800 e 3 650 dias).
   - Pacote paralelo de teste (outro applicationId) e build debug com `run-as`: **descartados**, porque alteram o applicationId ou
     exigem desinstalar.

## 10. Regressão

**12/12 aprovadas:**

- LOCAL-8A (`test:local-8a-career-audit` sobre o checkpoint de 35 dias: 0 erros de pontos, rolling, Race e ledger; 0 travados);
- LOCAL-7H.1, 7H, 7G.1, 7G, 7F, 7E e 7D, e CLOUD-7D1;
- persistência móvel e web: `mobile-storage-m3-6`, `mobile-persistence-m3-7` e `browser-career-storage`.

`lint`, `build`, `validate:architecture` e `git diff --check`: ok. A simulação de 10 temporadas não foi repetida, porque os
saves da LOCAL-8A foram suficientes.
