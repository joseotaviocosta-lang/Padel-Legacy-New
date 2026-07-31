import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Trophy, Lock, HelpCircle, Star, Search, Filter } from 'lucide-react';
import { LoadingScreen, PageHeader, EmptyStateCard } from '@/components/padel/ui';
import { useToast } from '@/components/ui/use-toast';
import { ensureMyProfile } from '@/lib/padel';
import { ACHIEVEMENT_STATS, CATEGORY_META, DIFFICULTY_META } from '@/lib/achievementsData';
import AchievementCard from '@/components/achievements/AchievementCard';
import { loadModuleTasks } from '@/lib/moduleLoading';

const VISIBILITY_TABS = [
  { id: 'all', label: 'Todas', icon: Trophy },
  { id: 'publico', label: 'Visíveis', icon: Star },
  { id: 'oculto', label: 'Ocultas', icon: Lock },
  { id: 'secreto', label: 'Secretas', icon: HelpCircle },
];

const DIFFICULTY_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'facil', label: 'Fácil' },
  { id: 'medio', label: 'Médio' },
  { id: 'dificil', label: 'Difícil' },
  { id: 'extremo', label: 'Extremo' },
  { id: 'lendario', label: 'Lendário' },
];

export default function Achievements() {
  const [profile, setProfile] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const user = await base44.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        const { achs, unlocked } = await loadModuleTasks({
          achs: { task: () => base44.entities.Achievement.filter({}, '-points', 500), fallback: [], label: 'catálogo de conquistas' },
          unlocked: { task: () => p ? base44.entities.PlayerAchievement.filter({ profile_id: p.id }) : [], fallback: [], label: 'conquistas do jogador' },
        });
        setAchievements(achs || []);
        setUnlockedIds(new Set((unlocked || []).map(u => u.achievement_id)));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    let result = achievements;
    if (tab !== 'all') result = result.filter(a => a.visibility === tab);
    if (difficulty !== 'all') result = result.filter(a => a.difficulty === difficulty);
    if (category !== 'all') result = result.filter(a => a.category === category);
    if (search) {
      result = result.filter(a =>
        a.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.description?.toLowerCase().includes(search.toLowerCase()) ||
        a.mystery_description?.toLowerCase().includes(search.toLowerCase())
      );
    }
    return result;
  }, [achievements, tab, difficulty, category, search]);

  const stats = useMemo(() => {
    const unlocked = achievements.filter(a => unlockedIds.has(a.id));
    const totalPoints = unlocked.reduce((sum, a) => sum + (a.points || 0), 0);
    const maxPoints = achievements.reduce((sum, a) => sum + (a.points || 0), 0);
    return {
      unlocked: unlocked.length,
      total: achievements.length,
      totalPoints,
      maxPoints,
      pct: achievements.length > 0 ? Math.round((unlocked.length / achievements.length) * 100) : 0,
    };
  }, [achievements, unlockedIds]);

  const categories = useMemo(() => {
    return ['all', ...Object.keys(CATEGORY_META)];
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={Trophy} title="Conquistas" subtitle={`${stats.unlocked} de ${stats.total} desbloqueadas`} accent="amber">
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase">Pontos</p>
          <p className="text-lg font-black text-primary">{stats.totalPoints.toLocaleString('pt-BR')}</p>
        </div>
      </PageHeader>

      {/* Progress bar */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-muted-foreground">Progresso Total</span>
          <span className="text-sm font-black text-primary">{stats.pct}%</span>
        </div>
        <div className="h-3 rounded-full bg-secondary/60 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-700 glow-primary"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{stats.unlocked} desbloqueadas</span>
          <span>{stats.total - stats.unlocked} restantes</span>
        </div>
      </div>

      {/* Visibility tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {VISIBILITY_TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isActive ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar conquista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl glass text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-2 rounded-xl font-semibold text-sm transition-all flex items-center gap-1.5 ${showFilters ? 'bg-primary/15 text-primary' : 'glass text-muted-foreground'}`}
        >
          <Filter className="h-4 w-4" />
        </button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="glass rounded-2xl p-4 space-y-3 animate-slide-up">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Dificuldade</p>
            <div className="flex gap-1.5 flex-wrap">
              {DIFFICULTY_FILTERS.map(d => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                    difficulty === d.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Categoria</p>
            <div className="flex gap-1.5 flex-wrap">
              {categories.map(c => {
                const meta = c !== 'all' ? CATEGORY_META[c] : null;
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                      category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {meta ? meta.label : 'Todas'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-muted-foreground px-1">
        {filtered.length} {filtered.length === 1 ? 'conquista' : 'conquistas'}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyStateCard icon={Trophy} message="Nenhuma conquista encontrada com esses filtros." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-stagger">
          {filtered.map(ach => (
            <AchievementCard
              key={ach.id}
              achievement={ach}
              unlocked={unlockedIds.has(ach.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}