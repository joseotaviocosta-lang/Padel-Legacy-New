import React, { useEffect, useMemo, useState } from 'react';
import { Globe2, Users, Building2, Trophy, MapPin } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import {
  CountryFlag, EmptyState, Page, PageContent, PageHeader, PageSkeleton, PlayerAvatar, StatCard, Surface,
} from '@/components/design-system';
import { buildCountryDirectory } from '@/lib/countryDirectory.js';

// Playthrough 5.22-E, Partes AB/AD/AE — diretório de PAÍSES.
//
// Não é "ranking de países": é um diretório/estatística montado só com dados
// canônicos reais (AthleteProfile e Club). Não inventa ranking de país nem
// posição que não exista. Campos sem dado real são omitidos.
export default function Countries() {
  const [athletes, setAthletes] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [athleteList, clubList] = await Promise.all([
          localGame.entities.AthleteProfile.list('-world_ranking_points', 1500).catch(() => []),
          localGame.entities.Club.list('-club_points', 200).catch(() => []),
        ]);
        if (!active) return;
        setAthletes(athleteList || []);
        setClubs(clubList || []);
      } catch (e) {
        console.error('[Countries]', e);
        if (active) setSourceError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Playthrough 5.24, Parte C — a MESMA autoridade canônica do header do
  // Ranking (src/lib/countryDirectory.js). Header e página não podem divergir.
  const countries = useMemo(() => buildCountryDirectory(athletes, clubs), [athletes, clubs]);

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  const totals = countries.reduce((acc, c) => ({
    athletes: acc.athletes + c.athletes,
    clubs: acc.clubs + c.clubs,
  }), { athletes: 0, clubs: 0 });

  return (
    <Page><PageContent>
      <PageHeader
        dense
        icon={Globe2}
        title="Países"
        description="Representação real do circuito por país: atletas, clubes e melhores nomes."
        tone="brand"
        hudLabel="Diretório de países"
        hudItems={[
          { label: 'países', value: countries.length, icon: Globe2 },
          { label: 'atletas', value: totals.athletes, icon: Users, tone: 'info' },
          { label: 'clubes', value: totals.clubs, icon: Building2, tone: 'success' },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Países no circuito" value={countries.length} detail="Com ao menos um atleta" icon={Globe2} tone="brand" />
        <StatCard label="Atletas representados" value={totals.athletes.toLocaleString('pt-BR')} detail="População ativa" icon={Users} tone="info" />
        <StatCard label="Clubes mapeados" value={totals.clubs.toLocaleString('pt-BR')} detail="Em todos os países" icon={Building2} tone="success" />
      </div>

      {sourceError ? (
        <EmptyState icon={Globe2} title="Não foi possível carregar os países" description="Sua carreira e seu save não foram afetados." />
      ) : countries.length === 0 ? (
        <EmptyState icon={Globe2} title="Nenhum país no circuito" description="O diretório será preenchido conforme o circuito mundial evoluir." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {countries.map((country) => (
            <Surface key={country.name} padding="default" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <CountryFlag country={country.name} />
                  <h3 className="truncate font-bold text-base">{country.name}</h3>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{country.athletes}</span>
                  {country.clubs > 0 && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{country.clubs}</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{country.representation}% do circuito</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{country.totalPoints.toLocaleString('pt-BR')} pts somados</span>
              </div>

              {country.topAthletes.length > 0 && (
                <div className="space-y-1.5 border-t border-border/50 pt-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    <Trophy className="h-3 w-3" /> Melhores atletas
                  </p>
                  {country.topAthletes.map((athlete) => (
                    <div key={athlete.id || athlete.name} className="flex items-center gap-2 text-xs">
                      <PlayerAvatar name={athlete.name} shape="rounded" className="h-6 w-6" />
                      <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{athlete.name}</span>
                      <span className="font-black tabular-nums text-primary">{athlete.points.toLocaleString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          ))}
        </div>
      )}

      {clubs.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> A contagem de clubes vem do diretório real de clubes do circuito.
        </p>
      )}
    </PageContent></Page>
  );
}
