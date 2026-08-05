import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ChevronLeft, Building2, Users, Calendar, Briefcase, Star, MapPin } from 'lucide-react';
import { LoadingScreen } from '@/components/padel/ui';
import { Page, PageContent, PageHeader, Surface, StatCard, StatusBadge } from '@/components/design-system';
import { useToast } from '@/components/ui/use-toast';
import { ensureMyProfile } from '@/lib/padel';
import { joinClub, leaveClub, hireClubStaff, fireClubStaff, hostEvent, addCourt, buildFacility } from '@/lib/clubs';
import ClubOverview from '@/components/clubs/ClubOverview';
import ClubMembers from '@/components/clubs/ClubMembers';
import ClubEvents from '@/components/clubs/ClubEvents';
import ClubStaffPanel from '@/components/clubs/ClubStaffPanel';

const TABS = [
  { id: 'overview', label: 'Visão Geral', icon: Building2 },
  { id: 'members', label: 'Associados', icon: Users },
  { id: 'events', label: 'Eventos', icon: Calendar },
  { id: 'staff', label: 'Equipe', icon: Briefcase },
];

export default function ClubDetail() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(null);
  const { toast } = useToast();

  useEffect(() => { load(); }, [clubId]);

  async function load() {
    try {
      const user = await localGame.auth.me();
      const p = await ensureMyProfile(user);
      setProfile(p);
      const c = await localGame.entities.Club.get(clubId);
      setClub(c);
      const [m, e, s] = await Promise.all([
        localGame.entities.ClubMember.filter({ club_id: clubId }),
        localGame.entities.ClubEvent.filter({ club_id: clubId }),
        localGame.entities.ClubStaff.filter({ club_id: clubId }),
      ]);
      setMembers(m || []);
      setEvents(e || []);
      setStaff(s || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function refresh() {
    const currentProfile = await ensureMyProfile(await localGame.auth.me());
    if (currentProfile) setProfile(currentProfile);
    const c = await localGame.entities.Club.get(clubId);
    setClub(c);
    const [m, e, s] = await Promise.all([
      localGame.entities.ClubMember.filter({ club_id: clubId }),
      localGame.entities.ClubEvent.filter({ club_id: clubId }),
      localGame.entities.ClubStaff.filter({ club_id: clubId }),
    ]);
    setMembers(m || []);
    setEvents(e || []);
    setStaff(s || []);
  }

  async function handle(action, fn, msg) {
    setBusy(action);
    try {
      const result = await fn();
      if (result?.profile) setProfile(result.profile);
      if (result?.club) setClub(result.club);
      await refresh();
      toast({ title: msg });
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally { setBusy(null); }
  }

  if (loading) return <LoadingScreen />;
  if (!club) return <div className="p-6 text-center text-muted-foreground">Clube não encontrado.</div>;

  const isOwner = club.owner_profile_id === profile?.id;
  const myMembership = members.find(m => m.profile_id === profile?.id);
  const isMember = !!myMembership;

  return (
    <Page>
      <PageContent>
        <button onClick={() => navigate('/clubs')} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground transition hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Voltar aos clubes
        </button>

        <PageHeader
          eyebrow="Estrutura esportiva"
          title={club.name}
          description={club.description || `${club.city || '—'}, ${club.country || '—'} • centro de desenvolvimento do circuito.`}
          icon={Building2}
          tone="brand"
          stats={[
            <StatusBadge key="level" tone="info">Nível {club.level || 1}</StatusBadge>,
            <StatusBadge key="location" tone="neutral"><MapPin className="h-3 w-3" /> {club.city || '—'}, {club.country || '—'}</StatusBadge>,
            isOwner ? <StatusBadge key="owner" tone="premium">Seu clube</StatusBadge> : isMember ? <StatusBadge key="member" tone="success">Associado</StatusBadge> : null,
          ].filter(Boolean)}
        />

        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Reputação" value={club.reputation || 50} detail="Prestígio no circuito" icon={Star} tone="premium" />
          <StatCard label="Associados" value={members.length} detail="Comunidade ativa" icon={Users} tone="brand" />
          <StatCard label="Eventos" value={events.length} detail="Agenda do clube" icon={Calendar} tone="info" />
          <StatCard label="Equipe" value={staff.length} detail="Profissionais contratados" icon={Briefcase} tone="success" />
        </div>

        <Surface padding="compact" className="sticky top-2 z-20 backdrop-blur-xl">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'}`}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
          </div>
        </Surface>

      {tab === 'overview' && (
        <ClubOverview club={club} profile={profile} isOwner={isOwner}
          onAddCourt={() => handle('court', () => addCourt(club, profile), 'Quadra adicionada!')}
          onBuildFacility={(f) => handle('facility', () => buildFacility(club, f, profile), `${f.name} construído!`)}
          busy={busy}
        />
      )}
      {tab === 'members' && (
        <ClubMembers members={members} isMember={isMember} isOwner={isOwner}
          onJoin={() => handle('join', () => joinClub(profile, club), 'Você se associou ao clube!')}
          onLeave={() => handle('leave', () => leaveClub(myMembership, club, profile), 'Você saiu do clube')}
          busy={busy}
        />
      )}
      {tab === 'events' && (
        <ClubEvents events={events} isOwner={isOwner}
          onHost={(data) => handle('event', () => hostEvent(club, data), 'Evento criado!')}
          busy={busy}
        />
      )}
      {tab === 'staff' && (
        <ClubStaffPanel staff={staff} isOwner={isOwner}
          onHire={(st) => handle('hire', () => hireClubStaff(club, st), `${st.name} contratado!`)}
          onFire={(s) => handle('fire', () => fireClubStaff(s, club), 'Funcionário demitido')}
          busy={busy}
        />
      )}
      </PageContent>
    </Page>
  );
}
