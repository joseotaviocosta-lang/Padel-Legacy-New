import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import MissionNotificationBridge from '@/components/missions/MissionNotificationBridge';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// Add page imports here
import Landing from '@/pages/Landing';
import PlayerProfile from '@/pages/PlayerProfile';
import Matches from '@/pages/Matches';
import Ranking from '@/pages/Ranking';
import Clubs from '@/pages/Clubs';
import Community from '@/pages/Community';
import CareerHub from '@/pages/CareerHub';
import Training from '@/pages/Training';
import Missions from '@/pages/Missions';
import Shop from '@/pages/Shop';
import Inventory from '@/pages/Inventory';
import Tournaments from '@/pages/Tournaments';
import Journal from '@/pages/Journal';
import Legacy from '@/pages/Legacy';
import CareerStats from '@/pages/CareerStats';
import CalendarPage from '@/pages/CalendarPage';
import Economy from '@/pages/Economy';
import ClubDetail from '@/pages/ClubDetail';
import Athletes from '@/pages/Athletes';
import CharacterEditor from '@/pages/CharacterEditor';
import Admin from '@/pages/Admin';
import DatabaseManager from '@/pages/DatabaseManager';
import History from '@/pages/History';
import HallOfFame from '@/pages/HallOfFame';
import Relationships from '@/pages/Relationships';
import Coaches from '@/pages/Coaches';
import TrainingCenter from '@/pages/TrainingCenter';
import Press from '@/pages/Press';
import Social from '@/pages/Social';
import Fans from '@/pages/Fans';
import Achievements from '@/pages/Achievements';
import WorldEvents from '@/pages/WorldEvents';
import Weather from '@/pages/Weather';
import Encyclopedia from '@/pages/Encyclopedia';
import PartnerHub from '@/pages/PartnerHub';
import Season from '@/pages/Season';
import CareerManager from '@/pages/CareerManager';
import WorldMarket from '@/pages/WorldMarket';
import { CareerProvider } from '@/careers/CareerProvider';
import { ActiveCareerGuard } from '@/careers/ActiveCareerGuard';

import GlobalDayAdvanceSummary from '@/components/calendar/GlobalDayAdvanceSummary';
import SaveFoundationBootstrap from '@/components/system/SaveFoundationBootstrap';

const RuntimeServices = () => {
  const location = useLocation();
  if (!location.pathname.startsWith('/game') && location.pathname !== '/profile' && !['/matches','/tournaments','/journal','/ranking','/clubs','/athletes','/character','/admin','/database','/history','/hall-of-fame','/relationships','/coaches','/training-center','/press','/social','/fans','/achievements','/world-events','/weather','/encyclopedia','/partners','/community'].some(p => location.pathname.startsWith(p))) return null;
  return <><SaveFoundationBootstrap /><GlobalDayAdvanceSummary /><MissionNotificationBridge /></>;
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
      <Route path="/" element={<CareerManager />} />
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
          <Route path="/game/training" element={<Training />} />
          <Route path="/game/missions" element={<Missions />} />
          <Route path="/game/shop" element={<Shop />} />
          <Route path="/game/inventory" element={<Inventory />} />
          <Route path="/game/legacy" element={<Legacy />} />
          <Route path="/game/stats" element={<CareerStats />} />
          <Route path="/game/calendar" element={<CalendarPage />} />
          <Route path="/game/season" element={<Season />} />
          <Route path="/game/economy" element={<Economy />} />
          <Route path="/profile" element={<PlayerProfile />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/clubs" element={<Clubs />} />
          <Route path="/clubs/:clubId" element={<ClubDetail />} />
          <Route path="/athletes" element={<Athletes />} />
          <Route path="/character" element={<CharacterEditor />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/database" element={<DatabaseManager />} />
          <Route path="/history" element={<History />} />
          <Route path="/hall-of-fame" element={<HallOfFame />} />
          <Route path="/relationships" element={<Relationships />} />
          <Route path="/coaches" element={<Coaches />} />
          <Route path="/training-center" element={<TrainingCenter />} />
          <Route path="/press" element={<Press />} />
          <Route path="/social" element={<Social />} />
          <Route path="/fans" element={<Fans />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/world-events" element={<WorldEvents />} />
          <Route path="/world-market" element={<WorldMarket />} />
          <Route path="/weather" element={<Weather />} />
          <Route path="/encyclopedia" element={<Encyclopedia />} />
          <Route path="/partners" element={<PartnerHub />} />
          <Route path="/community" element={<Community />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <CareerProvider>
          <Router>
            <ScrollToTop />
            <RuntimeServices />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </CareerProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
