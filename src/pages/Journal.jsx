import React, { useEffect, useState } from 'react';
import { Calendar, Crown, Globe, Newspaper, Swords, TrendingUp, Trophy } from 'lucide-react';
import { generateJournal } from '@/lib/journal';
import { LoadingScreen, TabBar } from '@/components/padel/ui';
import { ensureMyProfile } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
import WorldFeed from '@/components/world/WorldFeed';
import {
  CardGrid,
  EmptyState,
  Page,
  PageContent,
  PageHeader,
  StatCard,
  StatusBadge,
  Surface,
  SurfaceHeader,
} from '@/components/design-system';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const TIER_TONE = {
  Silver: 'neutral',
  Gold: 'premium',
  Platinum: 'info',
  Masters: 'brand',
  Elite: 'premium',
  Crown: 'premium',
};

export default function Journal() {
  const [journal, setJournal] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('jornal');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const currentProfile = await ensureMyProfile(user);
        setProfile(currentProfile);
      } catch {
        // O jornal mundial pode ser exibido mesmo sem perfil carregado.
      }
      const nextJournal = await generateJournal();
      setJournal(nextJournal);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingScreen />;

  const tabs = [
    { key: 'jornal', label: 'Jornal', icon: Newspaper },
    { key: 'mundo', label: 'Mundo', icon: Globe },
  ];

  const championCount = journal?.champions?.length || 0;
  const rivalryCount = journal?.rivalries?.length || 0;
  const resultCount = journal?.recentResults?.length || 0;

  return (
    <Page size="default">
      <PageContent>
        <PageHeader
          eyebrow="Cobertura oficial"
          title="Jornal do Circuito"
          description={journal?.summary || 'Resultados, campeões, rivalidades e histórias do mundo profissional do padel.'}
          icon={Newspaper}
          tone="brand"
          breadcrumb={['Mundo', 'Notícias']}
          stats={journal?.hasContent ? [
            <StatusBadge key="champions" tone="premium" icon={Crown}>{championCount} campeões</StatusBadge>,
            <StatusBadge key="results" tone="info" icon={Calendar}>{resultCount} resultados</StatusBadge>,
          ] : undefined}
        />

        <CardGrid columns={3}>
          <StatCard label="Campeões recentes" value={championCount} detail="Títulos registrados" icon={Trophy} tone="premium" />
          <StatCard label="Rivalidades" value={rivalryCount} detail="Confrontos em destaque" icon={Swords} tone="danger" />
          <StatCard label="Resultados" value={resultCount} detail="Últimas partidas do circuito" icon={Calendar} tone="info" />
        </CardGrid>

        <Surface padding="compact">
          <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} variant="buttons" />
        </Surface>

        {activeTab === 'mundo' && <WorldFeed profile={profile} />}

        {activeTab === 'jornal' && !journal?.hasContent && (
          <EmptyState
            icon={Newspaper}
            title="Ainda não há notícias do circuito"
            description="Avance o calendário e dispute partidas para que o jornal acompanhe a evolução do mundo."
          />
        )}

        {activeTab === 'jornal' && journal?.hasContent && (
          <>
            <Surface variant="premium" padding="spacious">
              <SurfaceHeader title={journal.headline} description="A principal manchete do circuito neste momento." icon={Newspaper} />
              {journal.summary && <p className="text-sm leading-relaxed text-muted-foreground">{journal.summary}</p>}
            </Surface>

            <div className="grid gap-4 lg:grid-cols-2">
              {journal.champions.length > 0 && (
                <Surface>
                  <SurfaceHeader title="Campeões recentes" description="Últimos vencedores do circuito." icon={Crown} />
                  <div className="space-y-2">
                    {journal.champions.slice(0, 6).map((champion, index) => (
                      <div key={`${champion.team}-${champion.tournament}-${index}`} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/25 px-3 py-2.5">
                        <Trophy className="h-4 w-4 shrink-0 text-amber-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{champion.team}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {champion.month ? `${MONTHS[champion.month - 1]} · ` : ''}{champion.tournament}
                          </p>
                        </div>
                        {champion.tier && <StatusBadge tone={TIER_TONE[champion.tier] || 'neutral'}>{champion.tier}</StatusBadge>}
                      </div>
                    ))}
                  </div>
                </Surface>
              )}

              {journal.topTeams.length > 0 && (
                <Surface>
                  <SurfaceHeader title="Top duplas" description="Equipes com maior destaque na temporada." icon={TrendingUp} />
                  <div className="space-y-2">
                    {journal.topTeams.map((team, index) => (
                      <div key={`${team.team}-${index}`} className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/25 px-3 py-2.5">
                        <span className={`w-7 text-center text-lg font-black ${index === 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>#{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{team.team}</p>
                          <p className="text-[10px] text-muted-foreground">{team.titles} título(s)</p>
                        </div>
                        <span className="text-sm font-black tabular-nums text-primary">{team.points}</span>
                      </div>
                    ))}
                  </div>
                </Surface>
              )}

              {journal.rivalries.length > 0 && (
                <Surface>
                  <SurfaceHeader title="Rivalidades" description="Confrontos que estão marcando o circuito." icon={Swords} />
                  <div className="space-y-3">
                    {journal.rivalries.slice(0, 4).map((rivalry, index) => (
                      <div key={`${rivalry.teamA}-${rivalry.teamB}-${index}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border/50 bg-secondary/25 px-3 py-3 text-xs">
                        <span className="truncate text-right font-bold">{rivalry.teamA}</span>
                        <StatusBadge tone="danger">{rivalry.count}x</StatusBadge>
                        <span className="truncate font-bold">{rivalry.teamB}</span>
                      </div>
                    ))}
                  </div>
                </Surface>
              )}

              {journal.recentResults.length > 0 && (
                <Surface>
                  <SurfaceHeader title="Resultados recentes" description="Placar das últimas partidas relevantes." icon={Calendar} />
                  <div className="space-y-2">
                    {journal.recentResults.slice(0, 6).map((result, index) => (
                      <div key={`${result.teamA}-${result.teamB}-${index}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border/50 bg-secondary/25 px-3 py-2.5 text-xs">
                        <span className={`truncate text-right font-bold ${result.winner === result.teamA ? 'text-primary' : 'text-muted-foreground'}`}>{result.teamA}</span>
                        <span className="rounded-lg bg-secondary px-2 py-1 text-[10px] font-black tabular-nums">{result.scoreA}-{result.scoreB}</span>
                        <span className={`truncate font-bold ${result.winner === result.teamB ? 'text-primary' : 'text-muted-foreground'}`}>{result.teamB}</span>
                      </div>
                    ))}
                  </div>
                </Surface>
              )}
            </div>
          </>
        )}
      </PageContent>
    </Page>
  );
}
