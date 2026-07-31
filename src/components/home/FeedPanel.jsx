import React from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, MessageCircle, Bell, Trophy, Dumbbell, Star } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { getMockMessages, getMockNotifications } from '@/lib/simulatedData';

const ICON_MAP = { Trophy, Dumbbell, Star, Newspaper, MessageCircle, Bell };

export default function FeedPanel({ posts, profile, upcomingTournaments }) {
  const messages = getMockMessages(profile);
  const notifications = getMockNotifications(profile, upcomingTournaments);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {/* News */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-cyan-400" /> Notícias
          </h2>
          <Link to="/journal" className="text-xs text-primary font-medium">Ver tudo</Link>
        </div>
        {(!posts || posts.length === 0) ? (
          <EmptyStateCard icon={Newspaper} message="Sem notícias no momento." />
        ) : (
          <div className="space-y-2">
            {posts.slice(0, 3).map((p, i) => (
              <div key={p.id || i} className="rounded-xl bg-secondary/30 p-2.5">
                <p className="text-xs font-semibold truncate">{p.author_name}</p>
                <p className="text-[10px] text-muted-foreground line-clamp-2">{p.content}</p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Messages */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <MessageCircle className="h-4 w-4 text-primary" /> Mensagens
        </h2>
        <div className="space-y-2">
          {messages.map((m, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl bg-secondary/30 p-2.5">
              <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-black text-primary">{m.avatar}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold truncate">{m.from}</p>
                  <span className="text-[9px] text-muted-foreground">{m.time}</span>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">{m.content}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Notifications */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4 text-amber-400" /> Notificações
        </h2>
        <div className="space-y-2">
          {notifications.map((n, i) => {
            const Icon = ICON_MAP[n.icon] || Bell;
            return (
              <div key={i} className={`flex items-start gap-2.5 rounded-xl p-2.5 ${n.read ? 'bg-secondary/20' : 'bg-primary/5 border border-primary/20'}`}>
                <div className="h-7 w-7 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
                  <Icon className={`h-3.5 w-3.5 ${n.accent || 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold truncate">{n.title}</p>
                    <span className="text-[9px] text-muted-foreground">{n.time}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{n.message}</p>
                </div>
                {!n.read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />}
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}