export const PAGE_LOADERS = {
  PageNotFound: () => import('@/lib/PageNotFound'), CareerManager: () => import('@/pages/CareerManager'),
  Login: () => import('@/pages/Login'), Register: () => import('@/pages/Register'),
  ForgotPassword: () => import('@/pages/ForgotPassword'), ResetPassword: () => import('@/pages/ResetPassword'),
  CareerHub: () => import('@/pages/CareerHub'), Training: () => import('@/pages/Training'), Missions: () => import('@/pages/Missions'),
  Shop: () => import('@/pages/Shop'), Inventory: () => import('@/pages/Inventory'), Legacy: () => import('@/pages/Legacy'),
  CareerStats: () => import('@/pages/CareerStats'), CalendarPage: () => import('@/pages/CalendarPage'), Season: () => import('@/pages/Season'),
  Economy: () => import('@/pages/Economy'), PlayerProfile: () => import('@/pages/PlayerProfile'), Matches: () => import('@/pages/Matches'),
  Tournaments: () => import('@/pages/Tournaments'), Journal: () => import('@/pages/Journal'), Ranking: () => import('@/pages/Ranking'),
  Clubs: () => import('@/pages/Clubs'), ClubDetail: () => import('@/pages/ClubDetail'), Athletes: () => import('@/pages/Athletes'),
  CharacterEditor: () => import('@/pages/CharacterEditor'), Admin: () => import('@/pages/Admin'), DatabaseManager: () => import('@/pages/DatabaseManager'),
  History: () => import('@/pages/History'), HallOfFame: () => import('@/pages/HallOfFame'), Relationships: () => import('@/pages/Relationships'),
  Coaches: () => import('@/pages/Coaches'), TrainingCenter: () => import('@/pages/TrainingCenter'), Press: () => import('@/pages/Press'),
  Social: () => import('@/pages/Social'), Fans: () => import('@/pages/Fans'), Achievements: () => import('@/pages/Achievements'),
  WorldEvents: () => import('@/pages/WorldEvents'), WorldMarket: () => import('@/pages/WorldMarket'), Weather: () => import('@/pages/Weather'),
  Encyclopedia: () => import('@/pages/Encyclopedia'), PartnerHub: () => import('@/pages/PartnerHub'), Community: () => import('@/pages/Community'), ReplayLibrary: () => import('@/pages/ReplayLibrary'),
};

const ROUTE_MODULES = {
  '/game': 'CareerHub', '/game/training': 'Training', '/game/missions': 'Missions', '/game/shop': 'Shop',
  '/game/inventory': 'Inventory', '/game/legacy': 'Legacy', '/game/stats': 'CareerStats', '/game/calendar': 'CalendarPage',
  '/game/season': 'Season', '/game/economy': 'Economy', '/profile': 'PlayerProfile', '/matches': 'Matches',
  '/tournaments': 'Tournaments', '/journal': 'Journal', '/ranking': 'Ranking', '/clubs': 'Clubs', '/athletes': 'Athletes',
  '/character': 'CharacterEditor', '/admin': 'Admin', '/database': 'DatabaseManager', '/history': 'History',
  '/hall-of-fame': 'HallOfFame', '/relationships': 'Relationships', '/coaches': 'Coaches', '/training-center': 'TrainingCenter',
  '/press': 'Press', '/social': 'Social', '/fans': 'Fans', '/achievements': 'Achievements', '/world-events': 'WorldEvents',
  '/world-market': 'WorldMarket', '/weather': 'Weather', '/encyclopedia': 'Encyclopedia', '/partners': 'PartnerHub', '/community': 'Community', '/replays': 'ReplayLibrary',
};

const preloadRequests = new Map();

export function preloadRoute(pathname) {
  const normalized = pathname?.startsWith('/clubs/') ? '/clubs' : pathname;
  const moduleName = ROUTE_MODULES[normalized];
  const loader = PAGE_LOADERS[moduleName];
  if (!loader) return Promise.resolve(null);
  if (!preloadRequests.has(moduleName)) preloadRequests.set(moduleName, loader());
  return preloadRequests.get(moduleName);
}
