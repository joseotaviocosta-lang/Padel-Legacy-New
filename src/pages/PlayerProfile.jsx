import React, { useEffect, useState } from 'react';
import { localGame } from '@/api/localGameClient.js';
import { Zap, ArrowUpRight, ArrowUpLeft, Waves, Circle, Hammer, Shield, Sword, Gauge, Brain, Flame, Edit3, Check, X, Trophy, Coins } from 'lucide-react';
import { ensureMyProfile, careerExperienceSummary, careerExperienceUnlocks, overallRating, winRate, ATTRIBUTES, calculateAge, isRetired } from '@/lib/padel';
import { PLAY_STYLE_OPTIONS } from '@/lib/initialCareerProfiles.js';
import { CAREER_DIFFICULTY_OPTIONS, getCareerDifficultyOption } from '@/lib/careerDifficultyLabels.js';
import LogoutButton from '@/components/LogoutButton';
import { LevelBadge, AttributeBar } from '@/components/padel/Shared';
import PlayStyleSummary from '@/components/career/PlayStyleSummary';
import AttributeDistribution from '@/components/career/AttributeDistribution';
import { LoadingScreen } from '@/components/padel/ui';
import { Page, PageContent, PageHeader, StatCard as PremiumStatCard, StatusBadge, Surface, SurfaceHeader, ProgressBar as PremiumProgressBar } from '@/components/design-system';

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
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        setForm({
          sport_name: p?.sport_name || '',
          avatar_url: p?.avatar_url || '',
          country: p?.country || '',
          city: p?.city || '',
          play_style: p?.play_style || 'Equilibrado',
          career_difficulty: p?.career_difficulty || 'hard',
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

  const careerExperience = careerExperienceSummary(profile?.xp || 0);
  const experienceUnlocks = careerExperienceUnlocks(careerExperience.level);

  async function save() {
    setSaving(true);
    try {
      const updated = await localGame.entities.PlayerProfile.update(profile.id, form);
      setProfile(updated);
      setEditing(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  return (
    <Page>
      <PageContent className="max-w-6xl space-y-5">
        <PageHeader
          eyebrow="Carreira"
          title={profile?.sport_name || 'Meu atleta'}
          description={`${profile?.city || 'Cidade não definida'}, ${profile?.country || 'País não definido'} · ${calculateAge(profile)} anos`}
          icon={Zap}
          tone="brand"
          breadcrumb={['Carreira', 'Perfil']}
          stats={<>
            <StatusBadge tone="brand">Overall {overallRating(profile)}</StatusBadge>
            <StatusBadge tone="info">Experiência {careerExperience.level}/{careerExperience.maxLevel}</StatusBadge>
            <StatusBadge tone={isRetired(profile) ? 'neutral' : 'success'}>{isRetired(profile) ? 'Aposentado' : 'Carreira ativa'}</StatusBadge>
            <StatusBadge tone="premium">Dificuldade: {getCareerDifficultyOption(profile?.career_difficulty)?.label || 'Difícil'}</StatusBadge>
          </>}
          action={<button onClick={() => editing ? save() : setEditing(true)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground hover:brightness-110 disabled:opacity-50">{editing ? <><Check className="h-4 w-4" />Salvar perfil</> : <><Edit3 className="h-4 w-4" />Editar perfil</>}</button>}
        />
        <Surface variant="elevated">
          <div className="grid gap-5 lg:grid-cols-[auto,1fr] lg:items-center">
            <div className="mx-auto h-24 w-24 overflow-hidden rounded-3xl bg-gradient-to-br from-primary/35 to-secondary ring-4 ring-primary/15 lg:mx-0">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-4xl font-black text-primary">{(profile?.sport_name || 'J')[0]?.toUpperCase()}</span>}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <LevelBadge level={`Experiência ${careerExperience.level}/${careerExperience.maxLevel}`} size="md" />
                {profile?.play_style && <StatusBadge tone="premium">{profile.play_style}</StatusBadge>}
                {profile?.racket && <StatusBadge tone="info">{profile.racket}</StatusBadge>}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{profile?.bio || 'Construa sua história no circuito e acompanhe aqui a evolução completa do atleta.'}</p>
              <div className="mt-4"><div className="mb-1.5 flex justify-between text-xs"><span className="font-bold">{careerExperience.title}</span><span className="text-muted-foreground">{careerExperience.isMax ? 'Nível máximo' : `${careerExperience.nextXp.toLocaleString('pt-BR')} XP`}</span></div><PremiumProgressBar value={careerExperience.progress} max={100} tone="brand" /><p className="mt-2 text-[11px] text-muted-foreground">{experienceUnlocks.latest.title}: {experienceUnlocks.latest.description}</p></div>
            </div>
          </div>
        </Surface>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PremiumStatCard label="Overall" value={overallRating(profile)} detail="Força esportiva atual" icon={Sword} tone="brand" />
          <PremiumStatCard label="XP de carreira" value={(profile?.xp || 0).toLocaleString('pt-BR')} detail={careerExperience.title} icon={Zap} tone="info" />
          <PremiumStatCard label="Aproveitamento" value={`${winRate(profile)}%`} detail={`${profile?.wins || 0} vitórias`} icon={Trophy} tone="success" />
          <PremiumStatCard label="Moedas" value={(profile?.coins || 0).toLocaleString('pt-BR')} detail="Saldo disponível" icon={Coins} tone="premium" />
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
                {PLAY_STYLE_OPTIONS.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}
              </select>
            </Field>
            <Field label="Raquete"><input className="padel-input" value={form.racket} onChange={e => setForm({ ...form, racket: e.target.value })} placeholder="Marca / modelo" /></Field>
            <Field label="Dificuldade da carreira">
              <select className="padel-input" value={form.career_difficulty} onChange={e => setForm({ ...form, career_difficulty: e.target.value })}>
                {CAREER_DIFFICULTY_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-amber-300">Alterar dificuldade modifica o ritmo futuro da carreira. Atributos e progresso já conquistados não são alterados.</p>
            </Field>
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

      <Surface>
        <SurfaceHeader title="Resumo competitivo" description="Resultados acumulados da carreira oficial." icon={Trophy} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <PremiumStatCard label="Partidas" value={profile?.matches_played || 0} icon={Sword} />
          <PremiumStatCard label="Vitórias" value={profile?.wins || 0} icon={Trophy} tone="success" />
          <PremiumStatCard label="Derrotas" value={profile?.losses || 0} icon={X} tone="danger" />
          <PremiumStatCard label="Títulos" value={profile?.tournaments_won || 0} icon={Trophy} tone="premium" />
        </div>
      </Surface>

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
      </PageContent>
    </Page>
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
