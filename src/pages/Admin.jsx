import React, { useEffect, useState } from 'react';
import { LayoutDashboard, TrendingUp, Bot, Trophy, Building2, Users } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { fetchAdminStats } from '@/lib/adminStats';
import { LoadingScreen, PageHeader, TabBar } from '@/components/padel/ui';
import OverviewTab from '@/components/admin/OverviewTab';
import EconomyTab from '@/components/admin/EconomyTab';
import GrowthTab from '@/components/admin/GrowthTab';
import TournamentsTab from '@/components/admin/TournamentsTab';
import ClubsTab from '@/components/admin/ClubsTab';
import PersonnelTab from '@/components/admin/PersonnelTab';

const TABS = [
  { key: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { key: 'economy', label: 'Economia', icon: TrendingUp },
  { key: 'growth', label: 'Crescimento', icon: Bot },
  { key: 'tournaments', label: 'Torneios', icon: Trophy },
  { key: 'clubs', label: 'Clubes', icon: Building2 },
  { key: 'personnel', label: 'Pessoal', icon: Users },
];

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        await ensureMyProfile(user);
        const data = await fetchAdminStats();
        setStats(data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading || !stats) return <LoadingScreen />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={LayoutDashboard} title="Painel Administrativo" subtitle="Indicadores globais do universo do jogo" accent="primary" />

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="segmented" />

      {activeTab === 'overview' && <OverviewTab stats={stats} />}
      {activeTab === 'economy' && <EconomyTab stats={stats} />}
      {activeTab === 'growth' && <GrowthTab stats={stats} />}
      {activeTab === 'tournaments' && <TournamentsTab stats={stats} />}
      {activeTab === 'clubs' && <ClubsTab stats={stats} />}
      {activeTab === 'personnel' && <PersonnelTab stats={stats} />}
    </div>
  );
}