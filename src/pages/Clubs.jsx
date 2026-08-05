import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { Plus, MapPin, Users, Trophy, X, Crown, Star } from 'lucide-react';
import { ensureMyProfile } from '@/lib/padel';
import { LoadingScreen, PageHeader, EmptyStateCard } from '@/components/padel/ui';
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

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={Users} title="Clubes" subtitle={`${clubs.length} clubes ativos no circuito mundial`} accent="primary">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity glow-primary"
        >
          <Plus className="h-4 w-4" /> Criar
        </button>
      </PageHeader>

      {clubs.length === 0 ? (
        <EmptyStateCard icon={Users} message="Nenhum clube ainda. Crie o primeiro clube do universo." />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {clubs.map((c, i) => (
            <div key={c.id} onClick={() => navigate(`/clubs/${c.id}`)} className="glass rounded-2xl p-4 relative overflow-hidden cursor-pointer glass-hover">
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
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={() => setShowForm(false)}>
          <div className="glass rounded-t-3xl md:rounded-3xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black">Criar clube</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <Field label="Nome do clube"><input className="padel-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Padel Masters SP" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cidade"><input className="padel-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
                <Field label="País"><input className="padel-input" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></Field>
              </div>
              <Field label="Descrição"><textarea rows={3} className="padel-input resize-none" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Sobre o clube..." /></Field>
              <button onClick={submit} disabled={submitting || !form.name} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 glow-primary">
                {submitting ? 'Criando...' : 'Criar clube'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">{label}</label>
      {children}
    </div>
  );
}
