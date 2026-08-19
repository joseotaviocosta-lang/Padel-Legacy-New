# Mobile M3.7.2 — Hotfix: Partida de treino não atualiza após avançar o dia

## Sintoma reportado (Android, dispositivo físico)

1. Jogar a partida de treino disponível do dia em `/matches`.
2. A tela passa a indicar corretamente que a partida diária foi usada.
3. Usar o atalho global "Avançar dia" (em qualquer outra parte do app).
4. A data global muda corretamente para o dia seguinte.
5. `/matches` continua mostrando o estado antigo — "Jogar agora" não reaparece.
6. Sair da página e voltar corrige a exibição.

O dado persistido sempre esteve correto. Só a página não reagia à mudança em tempo real.

## Causa raiz

`Matches.jsx` buscava `profile` **uma única vez**, num `useEffect(() => {...}, [])`
disparado no mount. `playStatus = canPlayMatchToday(profile)` e o `StatCard`
"Hoje X/Y" derivam desse `profile` local — que nunca era atualizado por nada
além desse único fetch inicial. Não existia nenhum listener de evento nessa
página. Quando o avanço de dia acontecia em outro lugar do app (o atalho
global em `CareerDayControl.jsx`), a persistência era atualizada
corretamente, mas nada avisava `/matches` para buscar de novo — só uma
desmontagem/remontagem da rota (sair e voltar) refazia o fetch do mount.

**Não era o `React.memo(Matches)`** adicionado na M3.5. Confirmado por
leitura direta: o wrap não tem comparador customizado, e `Matches` é uma
página roteada via `<Outlet/>` — não recebe props reais do componente pai.
`React.memo` sem comparador só evita re-render disparado por **mudança de
props do pai**; nunca bloqueia um `setState` que o próprio componente dispara
internamente (como o que este hotfix adiciona). O bug real era a ausência
completa de um mecanismo de atualização, não uma otimização bloqueando um
que já existia.

## A fonte de verdade já existia

`src/game-core/dayAdvanceCoordinator.js` já transmite, de forma confiável,
após todo commit bem-sucedido de avanço de dia (`advanceCareerDayOnce`):

```js
function broadcastProfileUpdate(profile, source = 'day-advance-coordinator') {
  if (typeof window === 'undefined' || !profile) return;
  window.dispatchEvent(new CustomEvent('padel:profile-updated', {
    detail: { profile, profileId: profile.id, careerDate: profile.career_date, source },
  }));
  window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
}
```

Esse broadcast só é alcançado **depois** que
`gameRepository.withPersistenceTransaction(...)` resolve com sucesso — se a
transação falhar ou for interrompida, `broadcastProfileUpdate` nunca é
chamado e a promise rejeita. Nenhuma página nunca recebe um estado
parcial/inválido.

Esse mesmo padrão de assinatura (`addEventListener('padel:profile-updated', ...)`
+ `addEventListener('padel:career-advanced', ...)` + cleanup no `useEffect`)
já era usado corretamente em `CalendarPage.jsx`, `CareerHub.jsx` (Home) e
`Tournaments.jsx`. **Não foi necessário criar uma nova fonte de dados nem
rotear isso por `CareerProvider`** (que gerencia identidade/lista de
carreiras — não guarda nem transmite dados de `PlayerProfile`). A correção
foi puramente assinar um sinal que já existia e já era confiável.

## Correção: `useCareerProfileSync`

Novo hook compartilhado, `src/hooks/useCareerProfileSync.js`, extrai esse
padrão para reuso (em vez de duplicar o listener em cada página nova):

```js
export function subscribeCareerProfileSync(setProfile) {
  const refreshProfileOnly = (event) => {
    if (event?.detail?.profile) setProfile(event.detail.profile);
  };
  window.addEventListener('padel:profile-updated', refreshProfileOnly);
  window.addEventListener('padel:career-advanced', refreshProfileOnly);
  return () => {
    window.removeEventListener('padel:profile-updated', refreshProfileOnly);
    window.removeEventListener('padel:career-advanced', refreshProfileOnly);
  };
}

export function useCareerProfileSync(setProfile) {
  useEffect(() => subscribeCareerProfileSync(setProfile), [setProfile]);
}
```

A lógica de inscrição (`subscribeCareerProfileSync`) é uma função simples,
sem `useEffect`, de propósito: sem jsdom neste repositório, é o que permite
testar o comportamento real do listener (registrar, disparar, limpar) usando
o `EventTarget`/`CustomEvent` nativos do Node, sem precisar montar nenhum
componente React.

**`Matches.jsx`** e **`Training.jsx`** passaram a chamar `useCareerProfileSync(setProfile)`.
Em Training.jsx o avanço de dia **próprio** da página (seu botão local de
avançar dia) já atualizava `profile` corretamente — o hook só cobre o caso
do avanço disparado em **outro lugar** do app enquanto o jogador está em
`/training`, o mesmo cenário do bug original em `/matches`.

**`Missions.jsx`** recebeu um listener equivalente, mas chamando `load()`
(recarga completa) em vez do hook — porque a tela depende de mais do que o
`profile` bruto (catálogo/progresso de missões também podem depender do
dia). Debounce de 150ms, mesmo padrão já usado em `Communications.jsx`, já
que o avanço de dia dispara `padel:profile-updated` duas vezes (fase
rápida + fase secundária assíncrona).

## Outras páginas auditadas (Parte 4)

- `CalendarPage.jsx`, `CareerHub.jsx` (Home), `Tournaments.jsx` — já tinham
  o listener correto antes deste hotfix. Confirmado, não alterado.
- `Coaches.jsx` — **encontrado o mesmo bug estrutural** (dispara
  `padel:profile-updated` após contratar/demitir um treinador, mas nunca
  escuta o próprio evento nem o do atalho global). Não estava na lista
  explícita da Parte 4 do brief ("Treinos; Calendário; Torneios; Home;
  Missões") e foi deixado **fora do escopo deste hotfix**, documentado aqui
  para uma correção futura dedicada.

## `React.memo` (Parte 5)

`Matches.jsx` e `Missions.jsx` (ambas memoizadas na M3.5) usam
`React.memo(Componente)` sem segundo argumento (sem comparador
customizado) — confirmado por leitura direta do fim de cada arquivo. Esse
memo só compara **props recebidas do componente pai**; como ambas são
páginas roteadas via `<Outlet/>` e não recebem props reais, o memo nunca
teve efeito sobre re-renders disparados por `setState` interno (como os que
`useCareerProfileSync`/o novo listener de Missions.jsx disparam) nem sobre
dados lidos de contexto (`useCareer()`). Nenhuma das duas lê `profile` de um
contexto React — ambas usam estado local (`useState`) — então não havia
risco de memo bloqueando uma atualização vinda de `useContext`.

## Testes

`scripts/test-mobile-match-day-refresh-m3-7-2.mjs` (`npm run test:mobile-match-day-refresh-m3-7-2`),
20 gates, sem jsdom:
- Comportamento real do hook (`subscribeCareerProfileSync`): registra,
  reage a `padel:profile-updated` e `padel:career-advanced`, ignora evento
  sem `detail.profile`, cleanup real via `removeEventListener`.
- Pipeline real: dia 1 com partida diária usada (`disponibilidade = false`)
  → `advanceCareerDayOnce` (o mesmo mecanismo usado pelo atalho global) →
  dia 2, `practice_matches_today` zerado, `disponibilidade = true` — e a
  assinatura do hook recebe o perfil atualizado automaticamente, sem
  qualquer remontagem de componente.
- Avanço interrompido (`advanceCareerDayOnce(null)`) rejeita e **nunca**
  chama a assinatura — nada libera indevidamente.
- Rollback: o estado anterior é preservado (o perfil real permanece no dia
  2, não avança nem corrompe); confirmado também por leitura de código que
  `broadcastProfileUpdate` só é chamado depois que a transação resolve.
- Verificações estruturais: `Matches.jsx`/`Training.jsx` usam o hook;
  `Missions.jsx` escuta os dois eventos; `React.memo(Matches)` sem
  comparador customizado.

## Regressão

`lint`, `typecheck` (baseline ~2259 erros pré-existentes, nenhum nos
arquivos alterados), `build`, `app:build` (MSI/NSIS), mobile M3.5/M3.6/
M3.7/M3.7.1, match lifecycle (`mobile-m3-live-match`,
`tournament-match-lifecycle`, `match-launch-pipeline`), `career-systems`,
`calendar-advance`, `visual-checkpoint-hotfix1`, `career-beta-readiness` e
os 14 pilares de `test:beta-candidate` — todos PASS, sem regressões.

## Fora de escopo (regra de parada)

Nenhum redesign mobile ou trabalho de M4 foi iniciado. `Coaches.jsx` tem o
mesmo bug estrutural (documentado acima) mas não foi corrigido — fora do
escopo explícito deste hotfix.
