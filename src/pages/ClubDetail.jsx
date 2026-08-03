import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ChevronLeft, Building2, Users, Calendar, Briefcase, Star, MapPin } from 'lucide-react';
import { LoadingScreen } from '@/components/padel/ui';
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
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      {/* Back + Header */}
      <button onClick={() => navigate('/clubs')} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </button>

      <div className="relative overflow-hidden rounded-3xl glass p-5 md:p-6 grid-bg">
        <div className="absolute -top-10 -right-10 h-36 w-36 bg-primary/20 rounded-full blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/40 to-secondary flex items-center justify-center overflow-hidden shrink-0">
            {club.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-cover" /> : <span className="font-black text-primary text-2xl">{(club.name || '?')[0]?.toUpperCase()}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black tracking-tight">{club.name}</h1>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/15 text-primary">Nível {club.level || 1}</span>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{club.city || '—'}, {club.country || '—'}</p>
            {club.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{club.description}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-amber-400 tabular-nums flex items-center gap-1 justify-end"><Star className="h-5 w-5" />{club.reputation || 50}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Reputação</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
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
          onLeave={() => handle('leave', () => leaveClub(myMembership, club), 'Você saiu do clube')}
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
    </div>
  );
}