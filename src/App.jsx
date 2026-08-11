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

import GlobalDayAdvanceSummary from '@/components/calendar/GlobalDayAdvanceSummary';
import SaveFoundationBootstrap from '@/components/system/SaveFoundationBootstrap';
import ModuleErrorBoundary from '@/components/system/ModuleErrorBoundary';
import BetaErrorBoundary from '@/components/system/BetaErrorBoundary';

const lazyPage = (name) => lazy(PAGE_LOADERS[name]);
const [PageNotFound, CareerManager, Login, Register, ForgotPassword, ResetPassword, CareerHub, Training, Missions,
  Shop, Inventory, Legacy, CareerStats, CalendarPage, Season, Economy, PlayerProfile, Matches, Tournaments,
  Journal, Ranking, Clubs, ClubDetail, Athletes, CharacterEditor, Admin, DatabaseManager, History, HallOfFame,
  Relationships, Coaches, TrainingCenter, Press, Fans, Achievements, WorldEvents, WorldMarket, Weather,
  Encyclopedia, PartnerHub, Community, NavigationHub, WorldHub, Staff, Communications, MonthlyReports] = [
  'PageNotFound', 'CareerManager', 'Login', 'Register', 'ForgotPassword', 'ResetPassword', 'CareerHub', 'Training',
  'Missions', 'Shop', 'Inventory', 'Legacy', 'CareerStats', 'CalendarPage', 'Season', 'Economy', 'PlayerProfile',
  'Matches', 'Tournaments', 'Journal', 'Ranking', 'Clubs', 'ClubDetail', 'Athletes', 'CharacterEditor', 'Admin',
  'DatabaseManager', 'History', 'HallOfFame', 'Relationships', 'Coaches', 'TrainingCenter', 'Press', 'Fans',
  'Achievements', 'WorldEvents', 'WorldMarket', 'Weather', 'Encyclopedia', 'PartnerHub', 'Community', 'NavigationHub', 'WorldHub', 'Staff', 'Communications', 'MonthlyReports',
].map(lazyPage);

const RouteLoadingFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background" role="status" aria-label="Carregando tela">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
  </div>
);

const RuntimeServices = () => {
  const location = useLocation();
  if (!location.pathname.startsWith('/game') && location.pathname !== '/profile' && !['/matches','/tournaments','/journal','/ranking','/clubs','/athletes','/character','/admin','/database','/history','/hall-of-fame','/relationships','/coaches','/training-center','/press','/social','/fans','/achievements','/world','/world-events','/world-market','/weather','/encyclopedia','/partners','/staff','/community','/communications'].some(p => location.pathname.startsWith(p))) return null;
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
          <Route path="/game/missions" element={<Missions />} />
          <Route path="/game/shop" element={<Shop />} />
          <Route path="/game/inventory" element={<Inventory />} />
          <Route path="/game/legacy" element={<Legacy />} />
          <Route path="/game/stats" element={<CareerStats />} />
          <Route path="/game/calendar" element={<CalendarPage />} />
          <Route path="/game/season" element={<Season />} />
          <Route path="/game/monthly-reports" element={<MonthlyReports />} />
          <Route path="/game/economy" element={<ModuleErrorBoundary moduleName="Economia"><Economy /></ModuleErrorBoundary>} />
          <Route path="/profile" element={<PlayerProfile />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/world-tour/live" element={<Navigate to="/tournaments" replace />} />
          <Route path="/live-circuit" element={<Navigate to="/tournaments" replace />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/clubs" element={<Clubs />} />
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/athletes" element={<Athletes />} />
          <Route path="/character" element={<ModuleErrorBoundary moduleName="Editor de Personagem"><CharacterEditor /></ModuleErrorBoundary>} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/database" element={<DatabaseManager />} />
          <Route path="/history" element={<History />} />
          <Route path="/hall-of-fame" element={<HallOfFame />} />
          <Route path="/relationships" element={<Relationships />} />
          <Route path="/coaches" element={<Coaches />} />
          <Route path="/staff" element={<ModuleErrorBoundary moduleName="Comissão técnica"><Staff /></ModuleErrorBoundary>} />
          <Route path="/training-center" element={<TrainingCenter />} />
          <Route path="/press" element={<Press />} />
          <Route path="/social" element={<Navigate to="/community" replace />} />
          <Route path="/fans" element={<Fans />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/world-events" element={<WorldEvents />} />
          <Route path="/world-market" element={<WorldMarket />} />
          <Route path="/weather" element={<Weather />} />
          <Route path="/encyclopedia" element={<Encyclopedia />} />
          <Route path="/partners" element={<PartnerHub />} />
          <Route path="/community" element={<Community />} />
          <Route path="/communications" element={<Communications />} />
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
