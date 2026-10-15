import React, { lazy } from 'react';
import { Crown, Trophy, CalendarDays, Newspaper } from 'lucide-react';
import ConsolidatedHub from '@/components/navigation/ConsolidatedHub';

// Playthrough 5.20, Parte S — "Hall da fama" (147 linhas) é conteúdo de legado.
const Legacy = lazy(() => import('@/pages/Legacy'));
const HallOfFame = lazy(() => import('@/pages/HallOfFame'));
// Playthrough 5.20-B, Parte AK — RELATORIOS SO EXISTIAM DENTRO DA NOTIFICACAO.
//
// /game/monthly-reports e /game/annual-reports eram alcancaveis unicamente pelo
// aviso que os anunciava: lida a notificacao, o jogador perdia o historico que
// o jogo acabara de produzir sobre a carreira dele. As paginas sempre tiveram
// lista + detalhe e estado vazio proprio — so nao tinham porta de entrada.
//
// As rotas diretas continuam como estao, com o `?report=` que as notificacoes
// enviam: isto aqui ACRESCENTA um caminho, nao substitui nenhum.
const MonthlyReports = lazy(() => import('@/pages/MonthlyReports'));
const AnnualReports = lazy(() => import('@/pages/AnnualReports'));

export default function LegacyHub() {
  return (
    <ConsolidatedHub
      tabs={[
        { key: 'legacy', label: 'Legado', icon: Crown, component: Legacy },
        { key: 'hall', label: 'Hall da fama', icon: Trophy, component: HallOfFame },
        { key: 'monthly', label: 'Relatórios mensais', icon: CalendarDays, component: MonthlyReports },
        { key: 'annual', label: 'Relatórios anuais', icon: Newspaper, component: AnnualReports },
      ]}
    />
  );
}
