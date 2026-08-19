import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Bell, BriefcaseBusiness, Building2, CheckCheck, GraduationCap, Handshake, Mail, Megaphone, Newspaper, Search, Shield, Sparkles } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, formatDate } from '@/lib/padel';
import { applyCareerCommunicationAction, dismissMessage, ensureContextualCareerCommunications, isCareerMessageUnread, listCareerCommunications, markAllCommunicationsRead, markCareerCommunicationRead, normalizeCareerMessage, resolveAndOpenNotification, resolveMessage } from '@/lib/careerCommunications.js';
import { CompactStats, Page, PageContent, PageHeader, StatusBadge, EmptyState, LoadingState, ModalShell, Surface } from '@/components/design-system';
import { resolveNotificationDestination } from '@/lib/notificationDestinations.js';
import { countUnreadCareerMessages, selectPendingDecisions } from '@/lib/notificationSelectors.js';
import { getNotificationCategory, getNotificationCategoryLabel, NOTIFICATION_CATEGORIES } from '@/lib/notificationCenter.js';
import { useCareer } from '@/careers/useCareer.js';
import { getMatchCheckpointRepository } from '@/careers/MatchCheckpointRepository.js';

const SENDER_ICONS = { treinador: GraduationCap, atleta: Handshake, empresario: BriefcaseBusiness, federacao: Shield, patrocinador: Sparkles, clube: Building2, imprensa: Newspaper, sistema: Bell };
const SENDER_TONES = { treinador: 'primary', atleta: 'success', empresario: 'premium', federacao: 'info', patrocinador: 'premium', clube: 'info', imprensa: 'warning', sistema: 'neutral' };

export default function Communications() {
  const { activeCareer } = useCareer();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openedMessageRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const user = await localGame.auth.me();
    const activeProfile = await ensureMyProfile(user);
    setProfile(activeProfile);
    if (activeProfile) {
      const [tournaments, matches, partnerships, sponsorContracts, calendarEvents, registrations, pressArticles, activeMatchCheckpoint] = await Promise.all([
        localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []),
        localGame.entities.Match.filter({ profile_id: activeProfile.id }, '-created_date', 40).catch(() => []),
        localGame.entities.Partnership.filter({ profile_id: activeProfile.id, status: 'ativa' }, '-started_career_date', 1).catch(() => []),
        localGame.entities.PlayerContract.filter({ profile_id: activeProfile.id, is_active: true }, '-created_date', 20).catch(() => []),
        localGame.entities.CalendarEvent.filter({ profile_id: activeProfile.id }, 'start_date', 100).catch(() => []),
        localGame.entities.TournamentRegistration.filter({ profile_id: activeProfile.id }, '-registered_at', 100).catch(() => []),
        localGame.entities.PressArticle.filter({ profile_id: activeProfile.id }, '-created_date', 100).catch(() => []),
        getMatchCheckpointRepository().read(activeCareer?.career_id).catch(() => null),
      ]);
      const nextTournament = (tournaments || []).filter((item) => item.start_date >= activeProfile.career_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
      const context = { nextTournament, matches, partnership: partnerships?.[0] || null, sponsorContracts, partnerName: activeProfile.partner_name, calendarEvents, registrations, pressArticles, activeMatchCheckpoint };
      await ensureContextualCareerCommunications(activeProfile, context);
      setMessages(await listCareerCommunications(activeProfile.id, 120, { matches, profile: activeProfile, pressArticles }));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let active = true;
    const safeLoad = async () => {
      if (!active || document.hidden) return;
      await load();
    };
    // Mesmo debounce do sino: um avanço de dia dispara profile-updated +
    // communications-refresh duas vezes (fase rápida + secundária).
    let timer = null;
    const debouncedLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; safeLoad(); }, 150);
    };
    window.addEventListener('padel:communications-refresh', debouncedLoad);
    window.addEventListener('padel:communications-updated', debouncedLoad);
    window.addEventListener('padel:profile-updated', debouncedLoad);
    window.addEventListener('focus', safeLoad);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('padel:communications-refresh', debouncedLoad);
      window.removeEventListener('padel:communications-updated', debouncedLoad);
      window.removeEventListener('padel:profile-updated', debouncedLoad);
      window.removeEventListener('focus', safeLoad);
    };
  }, []);

  useEffect(() => {
    const requestedId = searchParams.get('message');
    if (!requestedId || !messages.length || openedMessageRef.current === requestedId) return;
    const requested = messages.find((message) => String(message.id) === requestedId);
    if (requested) {
      openedMessageRef.current = requestedId;
      void openMessage(requested);
    }
  }, [messages, searchParams]);

  const unread = countUnreadCareerMessages(messages);
  const pending = selectPendingDecisions(messages).length;
  const filtered = useMemo(() => messages.filter((item) => {
    const matchesCategory = category === 'all' || getNotificationCategory(item) === category;
    const haystack = `${item.title} ${item.content} ${item.sender_name}`.toLowerCase();
    return matchesCategory && haystack.includes(query.trim().toLowerCase());
  }), [messages, category, query]);

  // Mobile M2 (docs/MOBILE_M2_SHELL.md): causa raiz do bug "marca como lida
  // mas não navega" — esta função só abria o modal de detalhe e nunca
  // chamava navigate; era preciso um segundo toque em "Abrir recurso"
  // (dentro do modal) para sair da página. Mensagens com decisão pendente
  // continuam abrindo o modal (o jogador precisa ler o conteúdo completo e
  // escolher uma ação ali), mas uma mensagem com destino específico e sem
  // decisão pendente agora navega direto no primeiro toque — igual ao sino
  // — via o mesmo resolveAndOpenNotification compartilhado.
  async function openMessage(message) {
    const normalized = normalizeCareerMessage(message);
    const needsDecisionReview = normalized.status === 'decisao_pendente';
    const wasUnread = isCareerMessageUnread(normalized);
    if (wasUnread) {
      setMessages((current) => current.map((row) => row.id === normalized.id ? { ...row, is_read: true, is_new: false, ...(row.status === 'nao_lida' ? { status: 'lida' } : {}) } : row));
    }
    const destination = resolveNotificationDestination(normalized);
    if (destination.actionable && !needsDecisionReview) {
      await resolveAndOpenNotification(normalized, { navigate });
      return;
    }
    setSelected(normalized);
    if (wasUnread) {
      await markCareerCommunicationRead(normalized);
      window.dispatchEvent(new CustomEvent('padel:communications-updated'));
      window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
    }
  }

  async function markAll() {
    if (!profile?.id) return;
    await markAllCommunicationsRead(profile.id);
    setMessages((current) => current.map((row) => isCareerMessageUnread(row) ? { ...row, is_read: true, is_new: false, ...(row.status === 'nao_lida' ? { status: 'lida' } : {}) } : row));
    window.dispatchEvent(new CustomEvent('padel:communications-updated'));
    window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
  }

  async function handleAction(action) {
    if (!selected) return;
    const updatedProfile = await applyCareerCommunicationAction(profile, selected, action);
    if (updatedProfile) setProfile(updatedProfile);
    await resolveMessage(selected.id, action.id);
    setSelected(null);
    await load();
    window.dispatchEvent(new CustomEvent('padel:communications-updated'));
    window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
  }

  async function handleDismiss() {
    if (!selected) return;
    await dismissMessage(selected.id);
    setSelected(null);
    await load();
    window.dispatchEvent(new CustomEvent('padel:communications-updated'));
    window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
  }

  if (loading) return <LoadingState label="Carregando notificações" />;

  return (
    <Page size="wide">
      <PageContent>
        <PageHeader dense eyebrow="Living Career" title="Central de Notificações" description="Acontecimentos e decisões relevantes da carreira em um único lugar." icon={Bell} action={unread > 0 ? <button type="button" onClick={markAll} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><CheckCheck className="h-4 w-4" /> Marcar todas como lidas</button> : null} />
        {/* Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.13): 3 StatCards
            viram uma linha compacta. */}
        <CompactStats items={[
          { label: 'não lidas', value: unread, icon: Mail, tone: unread ? 'brand' : 'neutral' },
          { label: 'decisões', value: pending, icon: AlertCircle, tone: pending ? 'warning' : 'neutral' },
          { label: 'histórico', value: messages.length, icon: Megaphone, tone: 'info' },
        ]} />

        <Surface className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {NOTIFICATION_CATEGORIES.map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-colors ${category === item.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/55 text-muted-foreground hover:text-foreground'}`}>{item.label}</button>)}
            </div>
            <label className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2 lg:w-72"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar notificações" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
          </div>
        </Surface>

        {filtered.length === 0 ? <EmptyState icon={Bell} title="Você está em dia" description={query || category !== 'all' ? 'Altere os filtros ou a busca.' : 'Nenhuma notificação exige sua atenção agora.'} /> : <div className="grid gap-2 lg:grid-cols-2">{filtered.map((message) => {
          const Icon = SENDER_ICONS[message.sender_type] || Bell;
          const isUnread = isCareerMessageUnread(message);
          {/* Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.13): preview de 2
              linhas vira 1 linha; padding reduzido de p-4 para p-3. */}
          return <button type="button" key={message.id} onClick={() => openMessage(message)} className={`group rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/80 ${isUnread ? 'border-primary/35 bg-primary/[0.045]' : 'border-border/65 bg-card/55'}`}><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/70"><Icon className="h-4.5 w-4.5 text-primary" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className={`truncate text-sm ${isUnread ? 'font-black' : 'font-bold'}`}>{message.title}</p>{isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}</div><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{message.sender_name}</p><p className="mt-1.5 line-clamp-1 text-xs leading-relaxed text-muted-foreground">{message.content}</p><div className="mt-2 flex items-center gap-2"><StatusBadge tone={SENDER_TONES[message.sender_type] || 'neutral'}>{getNotificationCategoryLabel(message)}</StatusBadge>{message.career_date && <span className="text-[10px] text-muted-foreground">{formatDate(message.career_date)}</span>}{message.status === 'decisao_pendente' && <StatusBadge tone="warning">Decisão pendente</StatusBadge>}</div></div></div></button>;
        })}</div>}
      </PageContent>

      <ModalShell
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title}
        description={selected?.sender_name}
        size="sm"
      >
        {selected && <div className="space-y-5">
          <p className="whitespace-pre-line text-sm leading-7 text-foreground/90">{selected.content}</p>
          {resolveNotificationDestination(selected).actionable && (
            <Link to={resolveNotificationDestination(selected).route} onClick={() => setSelected(null)} className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground">{resolveNotificationDestination(selected).label}</Link>
          )}
          {selected.actions?.length > 0 && selected.status === 'decisao_pendente' && <div className="space-y-2">
            {selected.actions.map((action, index) => <button key={action.id} type="button" onClick={() => handleAction(action)} className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${index === 0 ? 'border-primary/30 bg-primary text-primary-foreground' : 'border-border/70 bg-secondary/55 hover:bg-secondary'}`}><span className="block text-sm font-bold">{action.label}</span>{action.description && <span className={`mt-1 block text-[10px] ${index === 0 ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>{action.description}</span>}</button>)}
            <button type="button" onClick={handleDismiss} className="w-full rounded-xl bg-secondary px-4 py-3 text-sm font-bold text-muted-foreground">Decidir depois</button>
          </div>}
        </div>}
      </ModalShell>
    </Page>
  );
}
