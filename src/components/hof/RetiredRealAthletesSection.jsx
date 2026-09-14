import React from 'react';
import { Award, Flag, History, Swords, Trophy, Users } from 'lucide-react';
import { EmptyStateCard } from '@/components/padel/ui';
import { PageSection, Surface, StatCard, CardGrid, PlayerAvatar } from '@/components/design-system';

// Fase 9.3, item 3 — seção nova, coexistindo com HOF_LEGENDS (lore fixo):
// lê `AthleteCareerLegacy` (já gravado corretamente desde a Fase 2.6 pra
// TODO atleta que se aposenta, filtrado aqui a `is_real:true` pelo
// chamador). Sem schema novo — `HallOfFameEntry` (zero leitores em todo o
// projeto) ficaria fazendo a mesma coisa que `AthleteCareerLegacy` já faz
// de graça; introduzi-lo aqui duplicaria a fonte de verdade sem ganho.
export default function RetiredRealAthletesSection({ rows = [], loading = false }) {
  const totalTitles = rows.reduce((sum, row) => sum + Number(row.career_titles || 0), 0);
  const totalWins = rows.reduce((sum, row) => sum + Number(row.career_wins || 0), 0);

  return (
    <PageSection>
      <Surface padding="compact">
        <p className="text-sm text-muted-foreground">
          Atletas <strong>reais</strong> do circuito que se aposentaram durante a sua
          carreira — diferente das lendas ao lado, que são história fixa do padel, esta
          lista é sobre quem você viu jogar e se despedir na sua própria partida.
        </p>
      </Surface>

      {rows.length > 0 && (
        <CardGrid columns={3}>
          <StatCard label="Aposentados na sua carreira" value={rows.length} detail="Atletas reais" icon={History} tone="premium" />
          <StatCard label="Títulos somados" value={totalTitles} detail="Ao longo das carreiras" icon={Trophy} tone="brand" />
          <StatCard label="Vitórias somadas" value={totalWins} detail="Ao longo das carreiras" icon={Award} tone="info" />
        </CardGrid>
      )}

      {loading ? (
        <Surface padding="compact"><p className="text-sm text-muted-foreground">Carregando...</p></Surface>
      ) : rows.length === 0 ? (
        <EmptyStateCard
          icon={History}
          title="Ninguém se aposentou ainda"
          message="Quando um atleta real do circuito encerrar a carreira durante a sua partida, ele aparece aqui."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 animate-stagger">
          {rows.map((row) => <RetiredRealAthleteCard key={row.athlete_id || row.id} row={row} />)}
        </div>
      )}
    </PageSection>
  );
}

function RetiredRealAthleteCard({ row }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-start gap-3">
        <PlayerAvatar name={row.name} size="lg" shape="circle" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black leading-tight">{row.name}</h3>
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {row.country && <><Flag className="h-2.5 w-2.5" />{row.country} · </>}
            Aposentado em {row.retirement_date || '—'}{row.retirement_age ? ` (${row.retirement_age} anos)` : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatPill label="Títulos" value={row.career_titles || 0} icon={Trophy} />
        <StatPill label="Vitórias" value={row.career_wins || 0} icon={Award} />
        <StatPill label="Anos ativo" value={row.years_active || 0} icon={History} />
      </div>
      {row.main_partner_name && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Users className="h-3 w-3" /> Parceiro principal: <span className="font-semibold text-foreground">{row.main_partner_name}</span>
        </p>
      )}
      {row.best_ranking_position && (
        <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Swords className="h-3 w-3" /> Melhor ranking: <span className="font-semibold text-foreground">#{row.best_ranking_position}</span>
        </p>
      )}
    </div>
  );
}

function StatPill({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg bg-secondary/40 p-1.5 text-center">
      <div className="flex items-center justify-center gap-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <p className="text-sm font-black tabular-nums text-foreground">{value}</p>
      </div>
      <p className="text-[8px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
