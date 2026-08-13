import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, getWorldRank } from '@/lib/padel';
import { CardGrid, EmptyState, Page, PageContent, PageHeader, PageSkeleton, StatCard } from '@/components/design-system';
import SeasonPanel from '@/components/home/SeasonPanel';
import { getSeasonWindow } from '@/lib/seasonProgress';

export default function Season() {
  const [profile, setProfile] = useState(null);
  const [worldRank, setWorldRank] = useState({ rank: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await localGame.auth.me();
        const currentProfile = await ensureMyProfile(user);
        if (!active) return;
        setProfile(currentProfile);
        if (currentProfile) {
          const rank = await getWorldRank(currentProfile);
          if (active) setWorldRank(rank || { rank: 0, total: 0 });
        }
      } catch (error) {
        console.error('[Game Core 3.3.1] Falha ao carregar Temporada:', error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <PageSkeleton variant="stats" rows={3} />;

  if (!profile) {
    return (
      <Page size="default">
        <PageContent>
          <EmptyState icon={CalendarDays} title="Nenhum perfil encontrado" description="Crie seu perfil para acompanhar a temporada." />
        </PageContent>
      </Page>
    );
  }

  const window = getSeasonWindow(profile.career_date);

  return (
    <Page size="default">
      <PageContent>
        <PageHeader
          icon={CalendarDays}
          title={`Temporada ${window.year}`}
          description="Acompanhe metas, desempenho e projeção do seu ano esportivo."
          tone="brand"
          breadcrumb={['Competir', 'Temporada']}
        />

        <CardGrid columns={3}>
          <StatCard label="Data da carreira" value={formatDate(profile.career_date)} tone="neutral" />
          <StatCard label="Ranking mundial" value={worldRank.rank ? `#${worldRank.rank}` : '—'} tone="brand" />
          <StatCard label="Dias restantes" value={window.remaining.toLocaleString('pt-BR')} tone="info" />
        </CardGrid>

        <SeasonPanel profile={profile} worldRank={worldRank} />
      </PageContent>
    </Page>
  );
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}
