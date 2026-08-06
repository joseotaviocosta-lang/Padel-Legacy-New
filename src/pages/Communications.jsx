import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, BriefcaseBusiness, Building2, CheckCheck, GraduationCap, Handshake, Inbox, Mail, Megaphone, Newspaper, Search, Shield, Sparkles, X } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile, formatDate } from '@/lib/padel';
import { applyCareerCommunicationAction, COMMUNICATION_CATEGORIES, ensureContextualCareerCommunications, listCareerCommunications, markAllCommunicationsRead, normalizeCareerMessage } from '@/lib/careerCommunications.js';
import { buildCareerMemory, getCareerAgent, getMemoryHighlights } from '@/lib/careerMemory.js';
import { markMessageRead, resolveMessage, dismissMessage } from '@/lib/partnershipSystem.js';
import { Page, PageContent, PageHeader, StatCard, StatusBadge, EmptyState, LoadingState, Surface } from '@/components/design-system';

const SENDER_ICONS = { treinador: GraduationCap, atleta: Handshake, empresario: BriefcaseBusiness, federacao: Shield, patrocinador: Sparkles, clube: Building2, imprensa: Newspaper, sistema: Bell };
const SENDER_TONES = { treinador: 'primary', atleta: 'success', empresario: 'premium', federacao: 'info', patrocinador: 'premium', clube: 'info', imprensa: 'warning', sistema: 'neutral' };

export default function Communications() {
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState(null);
  const [memoryHighlights, setMemoryHighlights] = useState([]);

  const load = async () => {
    setLoading(true);
    const user = await localGame.auth.me();
    const activeProfile = await ensureMyProfile(user);
    setProfile(activeProfile);
    if (activeProfile) {
      const [tournaments, matches, partnerships, sponsorContracts] = await Promise.all([
        localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []),
        localGame.entities.Match.filter({ profile_id: activeProfile.id }, '-created_date', 40).catch(() => []),
        localGame.entities.Partnership.filter({ profile_id: activeProfile.id, status: 'ativa' }, '-started_career_date', 1).catch(() => []),
        localGame.entities.PlayerContract.filter({ profile_id: activeProfile.id, is_active: true }, '-created_date', 20).catch(() => []),
      ]);
      const nextTournament = (tournaments || []).filter((item) => item.start_date >= activeProfile.career_date).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
      const context = { nextTournament, matches, partnership: partnerships?.[0] || null, sponsorContracts, partnerName: activeProfile.partner_name };
      const memory = buildCareerMemory(activeProfile, context);
      setAgent(getCareerAgent(activeProfile));
      setMemoryHighlights(getMemoryHighlights(activeProfile, memory));
      await ensureContextualCareerCommunications(activeProfile, context);
      setMessages(await listCareerCommunications(activeProfile.id));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const unread = messages.filter((item) => item.status === 'nao_lida').length;
  const pending = messages.filter((item) => item.status === 'decisao_pendente').length;
  const senders = new Set(messages.map((item) => item.sender_type)).size;
  const filtered = useMemo(() => messages.filter((item) => {
    const matchesCategory = category === 'all' || item.sender_type === category;
    const haystack = `${item.title} ${item.content} ${item.sender_name}`.toLowerCase();
    return matchesCategory && haystack.includes(query.trim().toLowerCase());
  }), [messages, category, query]);

  async function openMessage(message) {
    const normalized = normalizeCareerMessage(message);
    setSelected(normalized);
    if (normalized.status === 'nao_lida') {
      await markMessageRead(normalized.id);
      setMessages((current) => current.map((row) => row.id === normalized.id ? { ...row, status: 'lida' } : row));
      window.dispatchEvent(new CustomEvent('padel:communications-updated'));
      window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
    }
  }

  async function markAll() {
    if (!profile?.id) return;
    await markAllCommunicationsRead(profile.id);
    setMessages((current) => current.map((row) => row.status === 'nao_lida' ? { ...row, status: 'lida' } : row));
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

  if (loading) return <LoadingState label="Carregando comunicações" />;

  return (
    <Page size="wide">
      <PageContent>
        <PageHeader eyebrow="Living Career" title="Central de Comunicações" description="Treinador, parceiro, empresário, federação, clube, imprensa e sistema em uma única caixa de entrada." icon={Inbox} action={unread > 0 ? <button type="button" onClick={markAll} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><CheckCheck className="h-4 w-4" /> Marcar todas como lidas</button> : null} />
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Não lidas" value={unread} detail="Aguardando sua atenção" icon={Mail} tone={unread ? 'primary' : 'neutral'} />
          <StatCard label="Decisões" value={pending} detail="Precisam de uma resposta" icon={AlertCircle} tone={pending ? 'warning' : 'neutral'} />
          <StatCard label="Fontes ativas" value={senders} detail="Pessoas e organizações" icon={Megaphone} tone="info" />
        </div>
        {agent && <Surface className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-premium/15"><BriefcaseBusiness className="h-5 w-5 text-premium" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-premium">Seu empresário</p><h2 className="font-black">{agent.name}</h2><p className="text-xs text-muted-foreground">{agent.personalityLabel} · {agent.description}</p></div></div>
            <div className="flex gap-2"><StatusBadge tone="premium">Confiança {agent.trust}</StatusBadge><StatusBadge tone="info">Negociação {agent.negotiation}</StatusBadge></div>
          </div>
          {memoryHighlights.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-3">{memoryHighlights.map((highlight) => <div key={highlight} className="rounded-xl bg-secondary/45 px-3 py-2 text-xs font-semibold text-muted-foreground">{highlight}</div>)}</div>}
        </Surface>

        <Surface className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {COMMUNICATION_CATEGORIES.map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-colors ${category === item.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/55 text-muted-foreground hover:text-foreground'}`}>{item.label}</button>)}
            </div>
            <label className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-3 py-2 lg:w-72"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar mensagens" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
          </div>
        </Surface>

        {filtered.length === 0 ? <EmptyState icon={Inbox} title="Nenhuma comunicação encontrada" description={query || category !== 'all' ? 'Altere os filtros ou a busca.' : 'Quando algo importante acontecer na carreira, aparecerá aqui.'} /> : <div className="grid gap-2 lg:grid-cols-2">{filtered.map((message) => {
          const Icon = SENDER_ICONS[message.sender_type] || Bell;
          const isUnread = message.status === 'nao_lida';
          return <button type="button" key={message.id} onClick={() => openMessage(message)} className={`group rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/80 ${isUnread ? 'border-primary/35 bg-primary/[0.045]' : 'border-border/65 bg-card/55'}`}><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/70"><Icon className="h-5 w-5 text-primary" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className={`truncate text-sm ${isUnread ? 'font-black' : 'font-bold'}`}>{message.title}</p>{isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}</div><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{message.sender_name}</p><p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{message.content}</p><div className="mt-3 flex items-center gap-2"><StatusBadge tone={SENDER_TONES[message.sender_type] || 'neutral'}>{COMMUNICATION_CATEGORIES.find((item) => item.id === message.sender_type)?.label || 'Sistema'}</StatusBadge>{message.career_date && <span className="text-[10px] text-muted-foreground">{formatDate(message.career_date)}</span>}{message.status === 'decisao_pendente' && <StatusBadge tone="warning">Decisão pendente</StatusBadge>}</div></div></div></button>;
        })}</div>}
      </PageContent>

      {selected && <><button type="button" aria-label="Fechar mensagem" onClick={() => setSelected(null)} className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-sm" /><div className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-h-[88vh] max-w-xl overflow-y-auto rounded-3xl border border-border/70 bg-card p-5 shadow-2xl sm:inset-x-6 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{selected.sender_name}</p><h2 className="mt-1 text-xl font-black">{selected.title}</h2></div><button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 hover:bg-secondary"><X className="h-5 w-5" /></button></div><p className="mt-5 whitespace-pre-line text-sm leading-7 text-foreground/90">{selected.content}</p>{selected.actions?.length > 0 && selected.status === 'decisao_pendente' && <div className="mt-5 space-y-2">{selected.actions.map((action, index) => <button key={action.id} type="button" onClick={() => handleAction(action)} className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${index === 0 ? 'border-primary/30 bg-primary text-primary-foreground' : 'border-border/70 bg-secondary/55 hover:bg-secondary'}`}><span className="block text-sm font-bold">{action.label}</span>{action.description && <span className={`mt-1 block text-[10px] ${index === 0 ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>{action.description}</span>}</button>)}<button type="button" onClick={handleDismiss} className="w-full rounded-xl bg-secondary px-4 py-3 text-sm font-bold text-muted-foreground">Decidir depois</button></div>}</div></>}
    </Page>
  );
}
