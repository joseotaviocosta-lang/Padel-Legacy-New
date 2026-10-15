// Playthrough 5.27-M — gera os JSONs de auditoria da fase a partir da
// evidência da repro headless (antes = onboarding-no-panel.json, rodado com o
// código da 5.27-L; depois = onboarding-*.json gerados por run-tests-527m).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const R = 'reports/release-527m';
const J = (f) => JSON.parse(readFileSync(`${R}/${f}`, 'utf8'));
const W = (f, o) => writeFileSync(`${R}/${f}`, `${JSON.stringify(o, null, 2)}\n`);
const before = J('onboarding-no-panel.json');
const after = { continuous: J('onboarding-continuous.json'), noPanel: J('onboarding-no-panel-after.json'), reload: J('onboarding-reload.json') };

const slimMoment = (m) => m && ({
  moment: m.moment, careerDate: m.careerDate, status: m.status, champion: m.champion, viewChampion: m.view.champion, placeholdersShown: m.viewPlaceholders,
  registrationRoster: m.registrationRoster, drawPairIds: m.drawPairIds,
  rounds: m.raw.map((r, i) => ({ round: r.round, date: r.date, matches: r.matches.map((x, j) => ({ match_id: x.match_id, source_match_ids: x.source_match_ids, team_a: x.team_a, team_b: x.team_b, winner: x.winner, shown: `${m.view.rounds[i].matches[j].team_a} x ${m.view.rounds[i].matches[j].team_b}`, shownWinner: m.view.rounds[i].matches[j].winner })) })),
});
const moments = (run) => run.bracketMoments.map(slimMoment);
W('bracket-before-after.json', {
  phase: '5.27-M',
  note: 'antes = código 5.27-L (repro do playtest); depois = código 5.27-M, mesma repro com e sem save/reload. Momentos: pré-inscrição, pré-sorteio, pós-sorteio, pós-sorteio após reload, pré-partida, pós-partida, pós-settlement, histórico final, histórico final após reload.',
  rootCause: [
    'Partidas do jogador nas rodadas >= 1 sem source_match_ids: a UI rotulava a final como "Vencedor Jogo 1 x Vencedor Jogo 2" (índice da rodada anterior), lido como os jogos 1 e 2 das quartas — o campeão real parecia não pertencer à árvore sorteada.',
    'Card mostrava "Concluído" assim que a campanha do jogador acabava (inscrição completed na eliminação), com o torneio ainda em andamento: a chave ainda revela as rodadas por data e mostrava "A definir".',
    'applyPlayerMatchToCanonicalBracket sobrescrevia o lado do jogador/adversário com o nome ATUAL (perfil renomeado, parceiro em outro formato) — a composição histórica podia mudar depois do jogo.',
  ],
  before: { coins: before.endCoins, moments: moments(before) },
  after: { continuous: moments(after.continuous), reload: moments(after.reload) },
  identicalContinuousVsReload: {
    draw: JSON.stringify(after.continuous.bracketMoments.find((m) => m.moment === 'post-draw').raw) === JSON.stringify(after.reload.bracketMoments.find((m) => m.moment === 'post-draw').raw),
    historical: JSON.stringify(after.continuous.bracketMoments.find((m) => m.moment === 'historical-final').raw) === JSON.stringify(after.reload.bracketMoments.find((m) => m.moment === 'historical-final-after-reload').raw),
  },
});

const sum = (rows, pred) => rows.filter(pred).reduce((s, l) => s + l.delta, 0);
const audit = (run) => {
  const L = run.ledger;
  const tutorial = sum(L, (l) => /rewardMission|incrementMissionProgress/.test(l.site) && !/tournament-match/.test(l.label));
  const achievements = sum(L, (l) => /syncPlayerAchievements/.test(l.site));
  const tournament = sum(L, (l) => /tournament-match/.test(l.label) && !/syncPlayerAchievements/.test(l.site));
  const expenses = -sum(L, (l) => l.delta < 0);
  const otherIncome = run.delta - tutorial - achievements - tournament + expenses;
  return {
    startingBalance: run.startCoins, tutorialRewards: tutorial, achievements, tournamentAndMatch: tournament, otherIncome, expenses,
    observedBalance: run.endCoins, closes: run.startCoins + tutorial + achievements + tournament + otherIncome - expenses === run.endCoins,
    achievementsUnlocked: run.achievementsUnlocked, bySource: run.bySource, ledger: L,
  };
};
W('reward-audit.json', {
  phase: '5.27-M', classification: 'D — combinação: (B/bug de estado inicial) conquistas satisfeitas pelo kit de partida da carreira nova (Rainbow Collection 4.000 por catálogo de loja incompleto; Primeiro Patrocinador 500 e Investidor 300 pelos registros de demonstração) + (C) nenhuma recompensa aparecia no Fluxo Financeiro. Duplicidade: 0.',
  where7kCameFrom: 'Repro do playtest (sem abrir Conquistas antes da 1ª partida): 900 → 7.290 em 14 dias; 5.800 vieram de UMA sincronização de conquistas após a 1ª partida (Rainbow Collection 4.000, Primeiro Patrocinador 500, Encontrou um Guia 400, Investidor 300, Primeiro Dia 100, Nascido para Vencer 100, Uma Semana 200, Estreia em Torneios 200). Abrir Conquistas antes zerava todas (reconciliação de save antigo) — dois resultados para a mesma carreira.',
  before: audit(before), after: { continuous: audit(after.continuous), noPanel: audit(after.noPanel), reload: audit(after.reload) },
  duplicateRewards: 0,
});

const flowAudit = (run) => ({ startCoins: run.startCoins, endCoins: run.endCoins, delta: run.delta, financialFlowNet: run.financialFlowNet ?? null, reconciled: run.financialFlowReconciled ?? null, undatedTransactions: run.undatedTransactions ?? null, months: run.financialFlow ?? null, transactions: run.financialTransactions });
W('financial-ledger-audit.json', {
  phase: '5.27-M',
  dataNaoInformadaCause: 'FinancialFlow.jsx lia só o formato do fechamento mensal (month/net/breakdown). Linhas datadas (date/amount/category) — prêmio de torneio, salário de parceiro e as 2 transações de DEMONSTRAÇÃO que toda carreira nova herdava (Adiantamento Sul Energia +300, Mensalidade do centro −250, moedas que nunca existiram no saldo) — viravam "Data não informada +0".',
  fix: ['src/lib/financialFlow.js agrega todas as formas por mês/categoria', 'FinancialTransaction e PlayerAchievement fora do seed de demonstração', 'linhas de extrato para tutorial/missão, conquista, partida, luvas do treinador, treino, inscrição/reembolso, loja, patrocínio (luvas/renovação), instalações — no mesmo lote da recompensa quando é recompensa'],
  notLedgered: ['clubes (mensalidade/instalações do clube)', 'imóveis (compra/venda)', 'multa de rescisão em economy.js', 'caminho legado de inscrição em calendarSystem.js', 'treino legado trainingSystem.js'],
  before: flowAudit(before), after: { continuous: flowAudit(after.continuous), noPanel: flowAudit(after.noPanel), reload: flowAudit(after.reload) },
});

W('tutorial-audit.json', {
  phase: '5.27-M',
  steps: [
    { id: 'tournament-registered', title: 'Inscreva-se em um torneio', objective: 'join_tournament', completion: 'registerTournament → incrementMissionProgress(join_tournament) na inscrição confirmada', reward: { xp: 100, coins: 150 }, changed: false },
    { id: 'first-match', titleBefore: 'Jogue sua primeira partida do circuito mundial', titleAfter: 'Jogue sua primeira partida de torneio', objective: 'play_matches', completionReal: 'qualquer partida oficial de torneio (a Pré-Temporada inclusive) via incrementMissionProgress(play_matches)', reward: { xp: 100, coins: 150 }, rewardChanged: false },
  ],
  observedBug: 'Com a etapa first-match ativa e o jogador JÁ inscrito antes do sorteio (sem tournament_run), resolveFirstMatchAction caía no fallback "Inscrever-se em um torneio" — o jogador via "Inscrever-se" e a etapa só concluía depois da partida. O texto também dizia que a Pré-Temporada não valia, mas ela conclui a etapa.',
  fix: ['CTA "Ver torneios" + "a etapa conclui quando você jogar essa partida" quando inscrito sem chave', 'texto da etapa alinhado à condição real', 'fato de reconciliação (tutorialState.matchCompleted) alinhado ao objetivo'],
  evidence: { continuous: after.continuous.tutorialLog, reload: after.reload.tutorialLog },
});

W('header-shortcut-audit.json', {
  phase: '5.27-M', component: 'src/components/career/CareerHeaderContext.jsx',
  before: 'Link to={buildTournamentPlayRoute(context.tournamentId)} → /tournaments?tournament=<id>&mode=run (abria o evento direto)',
  after: 'Link to={APP_ROUTES.TOURNAMENTS} → /tournaments (página geral); rótulo e aria-label continuam com o próximo torneio; atalho inteiro é um único alvo',
  platforms: 'mesmo componente no desktop e no mobile (compact só encurta o rótulo)',
});

const ns = (f) => (existsSync(`${R}/${f}`) ? J(f) : null);
W('name-save-audit.json', {
  phase: '5.27-M', path: 'Missions.jsx saveAthleteName',
  cause: 'Duas gravações COMPLETAS da carreira por salvamento (PlayerProfile.update + recompensa do tutorial em incrementMissionProgress). Cada gravação serializa ~2,1 MB e atravessa a ponte IPC do Tauri; no Android isso é sentido como congelamento curto. Botão já ficava desabilitado com "Salvando...".',
  fix: 'src/onboarding/athleteNameSave.js: nome + recompensa numa única transação de persistência (mesmo mecanismo do treino): 1 gravação.',
  headlessBefore: ns('name-save-headless-baseline.json'), headlessAfter: ns('name-save-headless.json'),
  androidMeasurement: ns('name-save-android.json'),
});
console.log('ok');
