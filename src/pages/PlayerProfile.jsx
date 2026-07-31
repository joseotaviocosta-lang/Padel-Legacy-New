import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Zap, ArrowUpRight, ArrowUpLeft, Waves, Circle, Hammer, Shield, Sword, Gauge, Brain, Flame, Edit3, Check, X, MapPin, Disc, Trophy, Coins } from 'lucide-react';
import { ensureMyProfile, levelForXp, nextLevelXp, overallRating, winRate, ATTRIBUTES, PLAY_STYLES, calculateAge, isRetired } from '@/lib/padel';
import LogoutButton from '@/components/LogoutButton';
import { LevelBadge, StatCard, AttributeBar } from '@/components/padel/Shared';
import PlayStyleSummary from '@/components/career/PlayStyleSummary';
import AttributeDistribution from '@/components/career/AttributeDistribution';
import { LoadingScreen } from '@/components/padel/ui';

const ICON_MAP = { Zap, ArrowUpRight, ArrowUpLeft, Waves, Circle, Hammer, Shield, Gauge, Brain, Flame };

export default function PlayerProfile() {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await base44.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        setForm({
          sport_name: p?.sport_name || '',
          avatar_url: p?.avatar_url || '',
          country: p?.country || '',
          city: p?.city || '',
          play_style: p?.play_style || 'Equilibrado',
          racket: p?.racket || '',
          bio: p?.bio || '',
        });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  const level = levelForXp(profile?.xp || 0);
  const nextXp = nextLevelXp(profile?.xp || 0);
  const levelProgress = Math.round(((profile?.xp || 0) / nextXp) * 100);

  async function save() {
    setSaving(true);
    try {
      const updated = await base44.entities.PlayerProfile.update(profile.id, form);
      setProfile(updated);
      setEditing(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header card */}
      <div className="relative overflow-hidden rounded-3xl glass p-5 md:p-7 grid-bg">
        <div className="absolute -top-16 -right-16 h-48 w-48 bg-primary/20 rounded-full blur-3xl" />
        <div className="relative flex flex-col items-center text-center gap-3">
          <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary/40 to-secondary overflow-hidden flex items-center justify-center ring-4 ring-primary/20">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl font-black text-primary">{(profile?.sport_name || 'J')[0]?.toUpperCase()}</span>
            )}
          </div>
          <div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">{profile?.sport_name}</h1>
              <LevelBadge level={level} size="md" />
              {profile?.position && (
                <span className="inline-flex items-center rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs font-bold">
                  {profile.position === 'direita' ? 'Lado Direito' : 'Lado Esquerdo'}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <MapPin className="h-3 w-3" /> {profile?.city || '—'}, {profile?.country || '—'} · {calculateAge(profile)} anos
            </p>
            {profile?.racket && (
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                <Disc className="h-3 w-3" /> {profile.racket}
              </p>
            )}
          </div>
          <div className="flex items-center gap-6 pt-2">
            <div className="text-center">
              <p className="text-3xl font-black text-primary text-glow tabular-nums">{overallRating(profile)}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overall</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-black tabular-nums">{profile?.xp || 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">XP</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-black text-amber-400 tabular-nums">{winRate(profile)}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Vitórias</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-black text-yellow-400 tabular-nums flex items-center gap-1 justify-center"><Coins className="h-5 w-5" />{profile?.coins || 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Moedas</p>
            </div>
          </div>
          <div className="w-full max-w-xs">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>{level}</span><span>{nextXp} XP</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-700" style={{ width: `${levelProgress}%` }} />
            </div>
          </div>
          <button
            onClick={() => editing ? save() : setEditing(true)}
            disabled={saving}
            className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/15 text-primary font-semibold text-sm hover:bg-primary/25 transition-colors"
          >
            {editing ? <><Check className="h-4 w-4" /> Salvar</> : <><Edit3 className="h-4 w-4" /> Editar perfil</>}
          </button>
          {editing && (
            <button onClick={() => { setEditing(false); }} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
              <X className="h-3 w-3" /> Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="glass rounded-2xl p-5 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Nome esportivo"><input className="padel-input" value={form.sport_name} onChange={e => setForm({ ...form, sport_name: e.target.value })} /></Field>
            <Field label="Avatar (URL)"><input className="padel-input" value={form.avatar_url} onChange={e => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://..." /></Field>
            <Field label="País"><input className="padel-input" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></Field>
            <Field label="Cidade"><input className="padel-input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Estilo de jogo">
              <select className="padel-input" value={form.play_style} onChange={e => setForm({ ...form, play_style: e.target.value })}>
                {PLAY_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Raquete"><input className="padel-input" value={form.racket} onChange={e => setForm({ ...form, racket: e.target.value })} placeholder="Marca / modelo" /></Field>
          </div>
          <Field label="Bio"><textarea rows={3} className="padel-input resize-none" value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="Conte sua história no padel..." /></Field>
        </div>
      )}

      {!editing && profile?.bio && (
        <div className="glass rounded-2xl p-5">
          <h2 className="font-bold text-sm mb-2">Sobre</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-stagger">
        <StatCard icon={Sword} label="Partidas" value={profile?.matches_played || 0} />
        <StatCard icon={Trophy} label="Vitórias" value={profile?.wins || 0} accent="text-amber-400" />
        <StatCard icon={X} label="Derrotas" value={profile?.losses || 0} accent="text-destructive" />
        <StatCard icon={Trophy} label="Torneios" value={profile?.tournaments_won || 0} accent="text-purple-400" />
      </div>

      {/* Play style summary */}
      <PlayStyleSummary profile={profile} />

      {/* Attribute distribution */}
      <AttributeDistribution profile={profile} onDistribute={setProfile} />

      {/* Attributes */}
      <div className="glass rounded-2xl p-5">
        <h2 className="font-bold text-sm mb-4 flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Atributos</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {ATTRIBUTES.map(attr => (
            <AttributeBar key={attr.key} label={attr.label} value={profile?.[attr.key] || 0} icon={ICON_MAP[attr.icon]} />
          ))}
        </div>
      </div>

      {/* Retirement notice */}
      {isRetired(profile) && (
        <div className="glass rounded-2xl p-4 border border-amber-500/40 bg-amber-500/5">
          <p className="text-sm text-amber-200 text-center">
            🏆 Jogador aposentado aos 40 anos. Uma carreira de legado construído no padel.
          </p>
        </div>
      )}

      {/* Logout */}
      <div className="flex justify-center pt-2">
        <LogoutButton variant="standalone" />
      </div>
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