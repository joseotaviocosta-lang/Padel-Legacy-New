import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Plus, MapPin, Users, Trophy, Crown, Star } from 'lucide-react';
import { ensureMyProfile } from '@/lib/padel';
import { LoadingScreen } from '@/components/padel/ui';
import { Page, PageContent, PageHeader, Surface, StatCard, StatusBadge, EmptyState, ModalShell } from '@/components/design-system';
import { createClub } from '@/lib/clubs';
import { ensureWorldClubCatalog } from '@/lib/sportsEconomyV26';

export default function Clubs() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', country: 'Brasil', description: '' });

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        await ensureWorldClubCatalog(72);
        const list = await localGame.entities.Club.list('-club_points', 120);
        setClubs(list || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  async function submit() {
    setSubmitting(true);
    try {
      await createClub(profile, form);
      const list = await localGame.entities.Club.list('-club_points', 120);
      setClubs(list || []);
      setShowForm(false);
      setForm({ name: '', city: '', country: 'Brasil', description: '' });
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  const topClub = clubs[0] || null;
  const totalMembers = clubs.reduce((sum, club) => sum + Number(club.member_count || 0), 0);
  const countries = new Set(clubs.map(club => club.country).filter(Boolean)).size;

  return (
    <Page>
      <PageContent>
        <PageHeader
          eyebrow="Rede mundial de desenvolvimento"
          title="Clubes do circuito"
          description="Conheça estruturas, benefícios e comunidades capazes de acelerar a evolução da sua carreira."
          icon={Users}
          tone="brand"
          action={<button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90"><Plus className="h-4 w-4" /> Criar clube</button>}
          stats={[<StatusBadge key="clubs" tone="info">{clubs.length} clubes ativos</StatusBadge>, <StatusBadge key="countries" tone="success">{countries} países</StatusBadge>]}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Clubes ativos" value={clubs.length} detail="Circuito mundial" icon={Users} tone="brand" />
          <StatCard label="Associados" value={totalMembers.toLocaleString('pt-BR')} detail="Comunidade global" icon={Users} tone="info" />
          <StatCard label="Clube líder" value={topClub?.name || '—'} detail={topClub ? `${topClub.club_points || 0} pontos` : 'Sem classificação'} icon={Crown} tone="premium" />
        </div>

        {clubs.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum clube disponível" description="Crie o primeiro clube do universo e comece a construir uma comunidade esportiva." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
          {clubs.map((c, i) => (
            <Surface key={c.id} variant="interactive" padding="default" onClick={() => navigate(`/clubs/${c.id}`)} className="relative cursor-pointer overflow-hidden">
              {i === 0 && <div className="absolute top-3 right-3"><Crown className="h-4 w-4 text-amber-400" /></div>}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center overflow-hidden">
                  {c.logo_url ? <img src={c.logo_url} alt="" className="h-full w-full object-cover" /> : <span className="font-black text-primary text-xl">{(c.name || '?')[0]?.toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base truncate">{c.name}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{c.city || '—'}, {c.country || '—'}</p>
                </div>
              </div>
              {c.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{c.description}</p>}
              <div className="grid grid-cols-3 gap-1 mb-3 text-[9px]"><span className="rounded bg-secondary/30 p-1.5">Entrada {(c.membership_fee ?? (c.monthly_fee || 100) * 2).toLocaleString('pt-BR')}</span><span className="rounded bg-secondary/30 p-1.5">Treino +{Math.round(Math.min(0.12, 0.03 + Math.max(1, c.level || 1) * 0.01) * 100)}%</span><span className="rounded bg-secondary/30 p-1.5">Recuperação +{Math.min(5, Math.max(1, c.level || 1))}</span></div>
              <div className="flex items-center gap-4 pt-3 border-t border-border/40">
                <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-bold">{c.member_count || 0}</span><span className="text-[10px] text-muted-foreground">membros</span></div>
                <div className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-400" /><span className="text-xs font-bold">{c.reputation || 50}</span></div>
                <div className="flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-amber-400" /><span className="text-xs font-bold">{c.trophies || 0}</span></div>
                <div className="flex-1 text-right"><span className="text-sm font-black text-primary tabular-nums">{c.club_points || 0}</span><span className="text-[10px] text-muted-foreground ml-1">pts</span></div>
              </div>
            </Surface>
          ))}
          </div>
        )}

      {/* Create modal */}
      <ModalShell
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Criar clube"
        size="sm"
        footer={(
          <button onClick={submit} disabled={submitting || !form.name} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 glow-primary">
            {submitting ? 'Criando...' : 'Criar clube'}
          </button>
        )}
      >
        <div className="space-y-3">
          <Field label="Nome do clube"><input className="padel-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Padel Masters SP" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade"><input className="padel-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="País"><input className="padel-input" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></Field>
          </div>
          <Field label="Descrição"><textarea rows={3} className="padel-input resize-none" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Sobre o clube..." /></Field>
        </div>
      </ModalShell>
      </PageContent>
    </Page>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
