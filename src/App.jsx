import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import MissionNotificationBridge from '@/components/missions/MissionNotificationBridge';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import { PAGE_LOADERS } from '@/lib/routeModules';
import { CareerProvider } from '@/careers/CareerProvider';
import { ActiveCareerGuard } from '@/careers/ActiveCareerGuard';
import { useCareer } from '@/careers/useCareer.js';
import { APP_ROUTES } from '@/navigation/routes.js';

import GlobalDayAdvanceSummary from '@/components/calendar/GlobalDayAdvanceSummary';
import SaveFoundationBootstrap from '@/components/system/SaveFoundationBootstrap';
import ModuleErrorBoundary from '@/components/system/ModuleErrorBoundary';
import LegacyRedirect from '@/components/navigation/LegacyRedirect';
import BetaErrorBoundary from '@/components/system/BetaErrorBoundary';

const lazyPage = (name) => lazy(PAGE_LOADERS[name]);
// Playthrough 5.20 — hubs consolidados. Declarados a parte do array historico
// acima para manter o diff legivel; mesmo mecanismo de lazy.
const MyAthleteHub = lazyPage('MyAthleteHub');
const TrainingEquipmentHub = lazyPage('TrainingEquipmentHub');
const TeamHub = lazyPage('TeamHub');
const RelationsHub = lazyPage('RelationsHub');
const CircuitCentralHub = lazyPage('CircuitCentralHub');
const AthletesClubsHub = lazyPage('AthletesClubsHub');
const EncyclopediaHub = lazyPage('EncyclopediaHub');
const LegacyHub = lazyPage('LegacyHub');
const CompeteHub = lazyPage('CompeteHub');
const RankingHub = lazyPage('RankingHub');
// Playthrough 5.20-B, Parte AL — O ARRAY POSICIONAL SAIU.
//
// Eram 47 nomes desestruturados de 47 strings na ordem exata: remover ou
// inserir um item em so um dos lados trocaria um componente por outro, em
// silencio, sem erro de build. Era o construto mais arriscado do arquivo, e a
// consolidacao da 5.20-A deixou 22 bindings sem nenhuma rota —
// esses componentes passaram a ser carregados pelos proprios hubs.
//
// Uma declaracao por linha, no mesmo estilo de RankingHub acima: o nome e a
// string ficam lado a lado e o desalinhamento deixa de ser possivel.
// Removidos por nao terem rota: Shop, Inventory, Legacy, CalendarPage, Season, PlayerProfile, Tournaments, Journal, Ranking, Clubs, Athletes, CharacterEditor, History, HallOfFame, Relationships, Coaches, Press, Fans, WorldEvents, Encyclopedia, Community, Staff.
const PageNotFound = lazyPage('PageNotFound');
const CareerManager = lazyPage('CareerManager');
const Login = lazyPage('Login');
const Register = lazyPage('Register');
const ForgotPassword = lazyPage('ForgotPassword');
const ResetPassword = lazyPage('ResetPassword');
const CareerHub = lazyPage('CareerHub');
const Training = lazyPage('Training');
const Missions = lazyPage('Missions');
const CareerStats = lazyPage('CareerStats');
const Economy = lazyPage('Economy');
const Matches = lazyPage('Matches');
const ClubDetail = lazyPage('ClubDetail');
const Admin = lazyPage('Admin');
const DatabaseManager = lazyPage('DatabaseManager');
const TrainingCenter = lazyPage('TrainingCenter');
const WorldMarket = lazyPage('WorldMarket');
const Weather = lazyPage('Weather');
const PartnerHub = lazyPage('PartnerHub');
const NavigationHub = lazyPage('NavigationHub');
const WorldHub = lazyPage('WorldHub');
const Communications = lazyPage('Communications');
const MonthlyReports = lazyPage('MonthlyReports');
const AnnualReports = lazyPage('AnnualReports');
const Settings = lazyPage('Settings');

const RouteLoadingFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background" role="status" aria-label="Carregando tela">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
  </div>
);

const RuntimeServices = () => {
  const location = useLocation();
  if (
    !location.pathname.startsWith('/game') &&
    !location.pathname.startsWith('/career') &&
    location.pathname !== '/profile' &&
    !['/matches','/tournaments','/journal','/ranking','/clubs','/athletes','/character','/admin','/database','/history','/hall-of-fame','/relationships','/coaches','/training-center','/press','/social','/fans','/achievements','/world','/world-events','/world-market','/weather','/encyclopedia','/partners','/staff','/community','/communications','/settings'].some(p => location.pathname.startsWith(p))
  ) return null;
  return <><SaveFoundationBootstrap /><GlobalDayAdvanceSummary /><MissionNotificationBridge /></>;
};

const RootEntry = () => {
  const { activeCareer, loading } = useCareer();
  if (loading) return <RouteLoadingFallback />;
  return <Navigate to={activeCareer ? '/game' : '/careers'} replace />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<RootEntry />} />
      <Route path="/careers" element={<CareerManager />} />
      <Route path="/career-hub" element={<CareerManager />} />
      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Public landing */}
      {/* Protected app with layout */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<ActiveCareerGuard><AppLayout /></ActiveCareerGuard>}>
          <Route path="/game" element={<CareerHub />} />
          <Route path="/development" element={<NavigationHub areaId="development" />} />
          <Route path="/team-hub" element={<NavigationHub areaId="team" />} />
          <Route path="/competitions" element={<NavigationHub areaId="competition" />} />
          <Route path="/world" element={<WorldHub />} />
          <Route path="/management" element={<NavigationHub areaId="management" />} />
          <Route path="/game/training" element={<Training />} />
          <Route path="/game/matches" element={<Matches />} />
          <Route path="/game/missions" element={<Missions />} />
          <Route path="/game/legacy" element={<LegacyHub />} />
          <Route path="/game/stats" element={<CareerStats />} />
          <Route path="/game/monthly-reports" element={<MonthlyReports />} />
          <Route path="/game/annual-reports" element={<AnnualReports />} />
          <Route path="/game/economy" element={<ModuleErrorBoundary moduleName="Economia"><Economy /></ModuleErrorBoundary>} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/world-tour/live" element={<Navigate to="/tournaments" replace />} />
          <Route path="/live-circuit" element={<Navigate to="/tournaments" replace />} />
          <Route path="/tournaments" element={<CompeteHub />} />
          <Route path="/ranking" element={<RankingHub />} />
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/database" element={<DatabaseManager />} />
          <Route path={APP_ROUTES.TRAINING_CENTER} element={<TrainingCenter />} />
          <Route path="/training-center" element={<Navigate to={APP_ROUTES.TRAINING_FACILITIES} replace />} />
          <Route path="/social" element={<Navigate to="/community" replace />} />
          {/* Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md,
              Parte 8): Conquistas passou a ser uma aba da página unificada
              de Objetivos (Missions.jsx) — links/favoritos antigos para
              /achievements continuam funcionando, só chegam num lugar
              diferente. */}
          <Route path="/achievements" element={<Navigate to="/game/missions?tab=achievements" replace />} />
          <Route path="/world-market" element={<WorldMarket />} />
          <Route path="/weather" element={<Weather />} />
          <Route path="/encyclopedia" element={<EncyclopediaHub />} />
          <Route path="/partners" element={<PartnerHub />} />
          <Route path="/communications" element={<Communications />} />
          <Route path="/settings" element={<Settings />} />

          {/* Playthrough 5.20, Partes B/E/F/G/H/N/P/S — HUBS CONSOLIDADOS.
              Cada hub agrupa paginas que ja existiam em abas (?tab=). As rotas
              antigas ficam logo abaixo como redirect que PRESERVA query params
              (Parte AH): nenhum deep link de notificacao perde contexto. */}
          <Route path="/career/athlete" element={<MyAthleteHub />} />
          <Route path="/career/training" element={<TrainingEquipmentHub />} />
          <Route path="/career/team" element={<TeamHub />} />
          <Route path="/career/relations" element={<RelationsHub />} />
          <Route path="/world/circuit" element={<CircuitCentralHub />} />
          <Route path="/world/directory" element={<AthletesClubsHub />} />

          {/* Rotas legadas: continuam atendidas, agora chegando na aba certa.
              Nenhuma foi apagada (Parte AH) e nenhuma funcao foi perdida
              (Parte AL) — o conteudo e a MESMA pagina, renderizada como aba. */}
          <Route path="/profile" element={<LegacyRedirect to="/career/athlete" tab="profile" />} />
          <Route path="/character" element={<LegacyRedirect to="/career/athlete" tab="appearance" />} />
          <Route path="/game/inventory" element={<LegacyRedirect to="/career/training" tab="inventory" />} />
          <Route path="/game/shop" element={<LegacyRedirect to="/career/training" tab="shop" />} />
          <Route path="/coaches" element={<LegacyRedirect to="/career/team" tab="coach" />} />
          <Route path="/staff" element={<LegacyRedirect to="/career/team" tab="staff" />} />
          <Route path="/relationships" element={<LegacyRedirect to="/career/relations" tab="people" />} />
          <Route path="/fans" element={<LegacyRedirect to="/career/relations" tab="fans" />} />
          <Route path="/journal" element={<LegacyRedirect to="/world/circuit" tab="news" />} />
          <Route path="/world-events" element={<LegacyRedirect to="/world/circuit" tab="circuit" />} />
          <Route path="/press" element={<LegacyRedirect to="/world/circuit" tab="press" />} />
          <Route path="/community" element={<LegacyRedirect to="/world/circuit" tab="community" />} />
          <Route path="/athletes" element={<LegacyRedirect to="/world/directory" tab="athletes" />} />
          <Route path="/clubs" element={<LegacyRedirect to="/world/directory" tab="clubs" />} />
          <Route path="/history" element={<LegacyRedirect to="/encyclopedia" tab="history" />} />
          <Route path="/hall-of-fame" element={<LegacyRedirect to="/game/legacy" tab="hall" />} />
          <Route path="/game/calendar" element={<LegacyRedirect to="/tournaments" tab="calendar" />} />
          <Route path="/game/season" element={<LegacyRedirect to="/ranking" tab="season" />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <BetaErrorBoundary>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <CareerProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ScrollToTop />
            <RuntimeServices />
            <Suspense fallback={<RouteLoadingFallback />}>
              <AuthenticatedApp />
            </Suspense>
          </Router>
          <Toaster />
        </CareerProvider>
      </QueryClientProvider>
    </AuthProvider>
    </BetaErrorBoundary>
  )
}

export default App
