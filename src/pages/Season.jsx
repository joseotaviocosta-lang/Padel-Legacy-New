import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ensureMyProfile, getWorldRank } from '@/lib/padel';
import { PageContainer, PageHeader, GlassCard, EmptyStateCard } from '@/components/padel/ui';
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
        const user = await base44.auth.me();
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

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando temporada…
      </div>
    );
  }

  if (!profile) {
    return <EmptyStateCard icon={CalendarDays} message="Crie seu perfil para acompanhar a temporada." />;
  }

  const window = getSeasonWindow(profile.career_date);

  return (
    <PageContainer>
      <PageHeader
        icon={CalendarDays}
        title={`Temporada ${window.year}`}
        subtitle="Acompanhe metas, desempenho e projeção do seu ano esportivo"
      />

      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Summary label="Data da carreira" value={formatDate(profile.career_date)} />
          <Summary label="Ranking mundial" value={worldRank.rank ? `#${worldRank.rank}` : '—'} />
          <Summary label="Dias restantes" value={window.remaining.toLocaleString('pt-BR')} />
        </div>

        <SeasonPanel profile={profile} worldRank={worldRank} />
      </div>
    </PageContainer>
  );
}

function Summary({ label, value }) {
  return (
    <GlassCard className="p-4">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums">{value}</p>
    </GlassCard>
  );
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
}
