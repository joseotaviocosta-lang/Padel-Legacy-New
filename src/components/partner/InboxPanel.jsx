import React, { useState, useMemo } from 'react';
import { Inbox, Mail, Check, X, Clock, AlertCircle, UserCheck } from 'lucide-react';
import { getInbox, markMessageRead, resolveMessage, dismissMessage } from '@/lib/partnershipSystem';
import { LoadingScreen } from '@/components/padel/ui';

const TYPE_ICONS = {
  proposta_parceria: UserCheck,
  mensagem: Mail,
  decisao: AlertCircle,
  conselho_assessor: Inbox,
  negociacao: AlertCircle,
  aviso_sistema: Inbox,
};

const PRIORITY_COLORS = {
  baixa: 'text-muted-foreground',
  normal: 'text-cyan-400',
  alta: 'text-amber-400',
  urgente: 'text-red-400',
};

const STATUS_LABELS = {
  nao_lida: { label: 'Nova', bg: 'bg-primary/15 text-primary' },
  lida: { label: 'Lida', bg: 'bg-secondary/50 text-muted-foreground' },
  decisao_pendente: { label: 'Pendente', bg: 'bg-amber-500/15 text-amber-400' },
  resolvida: { label: 'Resolvida', bg: 'bg-green-500/15 text-green-400' },
  ignorada: { label: 'Ignorada', bg: 'bg-secondary/50 text-muted-foreground' },
};

export default function InboxPanel({ profile, onAction }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const msgs = await getInbox(profile.id);
    setMessages(msgs || []);
    setLoading(false);
  }

  React.useEffect(() => { load(); }, [profile?.id]);

  const filtered = useMemo(() => {
    if (filter === 'all') return messages;
    if (filter === 'pending') return messages.filter(m => m.status === 'decisao_pendente');
    if (filter === 'unread') return messages.filter(m => m.status === 'nao_lida');
    return messages.filter(m => m.sender_type === filter);
  }, [messages, filter]);

  async function handleSelect(msg) {
    setSelected(msg);
    if (msg.status === 'nao_lida') {
      await markMessageRead(msg.id);
      load();
    }
  }

  async function handleAction(msg, action) {
    await resolveMessage(msg.id, action.id);
    setSelected(null);
    onAction?.(action, msg);
    load();
  }

  async function handleDismiss(msg) {
    await dismissMessage(msg.id);
    setSelected(null);
    load();
  }

  if (loading) return <LoadingScreen />;

  const filters = [
    { id: 'all', label: 'Todas' },
    { id: 'unread', label: 'Não lidas' },
    { id: 'pending', label: 'Pendentes' },
    { id: 'atleta', label: 'Atletas' },
    { id: 'empresario', label: 'Empresário' },
    { id: 'treinador', label: 'Treinador' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${filter === f.id ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Caixa de entrada vazia.</p>
        </div>
      ) : (
        <div className="space-y-2 animate-stagger">
          {filtered.map(msg => {
            const Icon = TYPE_ICONS[msg.message_type] || Mail;
            const status = STATUS_LABELS[msg.status] || STATUS_LABELS.nao_lida;
            return (
              <button
                key={msg.id}
                onClick={() => handleSelect(msg)}
                className={`w-full glass rounded-2xl p-4 text-left transition-all border ${msg.status === 'nao_lida' ? 'border-primary/30' : 'border-transparent'} hover:border-primary/40`}
              >
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${msg.sender_type === 'empresario' ? 'bg-amber-500/15' : msg.sender_type === 'treinador' ? 'bg-primary/15' : 'bg-secondary/60'}`}>
                    <Icon className={`h-5 w-5 ${msg.sender_type === 'empresario' ? 'text-amber-400' : msg.sender_type === 'treinador' ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm truncate ${msg.status === 'nao_lida' ? 'font-bold' : 'font-medium'}`}>{msg.title}</p>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${status.bg}`}>{status.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{msg.sender_name} · {msg.sender_type}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{msg.content}</p>
                  </div>
                  {msg.priority === 'alta' && <span className="text-amber-400 text-[10px] font-bold">●</span>}
                  {msg.priority === 'urgente' && <span className="text-red-400 text-[10px] font-bold">●</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Message detail modal */}
      {selected && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="fixed bottom-0 inset-x-0 z-50 md:absolute md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg p-4">
            <div className="glass-premium rounded-3xl p-5 max-h-[85vh] overflow-y-auto scrollbar-none animate-slide-up">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{selected.sender_type}</p>
                  <h3 className="font-black text-base">{selected.title}</h3>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-secondary/60">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold">{selected.sender_name}</span>
                {selected.career_date && <span className="text-[10px] text-muted-foreground">· {selected.career_date}</span>}
                <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[selected.priority] || ''}`}>{selected.priority}</span>
              </div>

              <p className="text-sm text-foreground/90 leading-relaxed mb-4">{selected.content}</p>

              {selected.expires_career_date && (
                <div className="glass rounded-xl p-2 flex items-center gap-2 mb-3">
                  <Clock className="h-3.5 w-3.5 text-amber-400" />
                  <p className="text-[10px] text-muted-foreground">Expira em {selected.expires_career_date}</p>
                </div>
              )}

              {/* Actions */}
              {selected.actions && selected.actions.length > 0 && selected.status === 'decisao_pendente' && (
                <div className="space-y-2">
                  {selected.actions.map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleAction(selected, action)}
                      className={`w-full py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                        action.id === 'decline'
                          ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                          : 'bg-primary text-primary-foreground hover:opacity-90'
                      }`}
                    >
                      {action.id === 'decline' ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {selected.status !== 'decisao_pendente' && (
                <button onClick={() => setSelected(null)} className="w-full py-2.5 rounded-xl glass text-xs font-semibold text-muted-foreground">
                  Fechar
                </button>
              )}

              {selected.status === 'decisao_pendente' && (
                <button onClick={() => handleDismiss(selected)} className="w-full mt-2 py-2 text-[10px] text-muted-foreground hover:text-foreground">
                  Ignorar
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}