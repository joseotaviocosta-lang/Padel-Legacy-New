import React, { useEffect, useState } from 'react';
import { Newspaper, Trophy, Swords, TrendingUp, Crown, Calendar, Globe } from 'lucide-react';
import { generateJournal } from '@/lib/journal';
import { LoadingScreen, TabBar } from '@/components/padel/ui';
import { ensureMyProfile } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
import WorldFeed from '@/components/world/WorldFeed';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const TIER_BADGE = {
  Major: 'bg-amber-500/15 text-amber-300',
  P1: 'bg-purple-500/15 text-purple-300',
  P2: 'bg-cyan-500/15 text-cyan-300',
};

export default function Journal() {
  const [journal, setJournal] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('jornal');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
      } catch {}
      const j = await generateJournal();
      setJournal(j);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  const TABS = [
    { key: 'jornal', label: 'Jornal', icon: Newspaper },
    { key: 'mundo', label: 'Mundo', icon: Globe },
  ];

  if (!journal?.hasContent) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="glass rounded-2xl p-10 text-center">
          <Newspaper className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Ainda não há notícias do circuito.</p>
          <p className="text-xs text-muted-foreground mt-1">Jogue algumas partidas para ver o jornal em ação!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} variant="buttons" />

      {activeTab === 'mundo' && <WorldFeed profile={profile} />}

      {activeTab === 'jornal' && (
      <>
      {/* Newspaper header */}
      <div className="glass rounded-2xl p-6 grid-bg relative overflow-hidden">
        <div className="absolute -top-12 -right-12 h-40 w-40 bg-primary/15 rounded-full blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Newspaper className="h-6 w-6 text-primary" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">Jornal do Circuito</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">{journal.headline}</h1>
          {journal.summary && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{journal.summary}</p>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Champions */}
        {journal.champions.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2"><Crown className="h-4 w-4 text-amber-400" /> Campeões Recentes</h2>
            <div className="space-y-2">
              {journal.champions.slice(0, 6).map((c, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{c.team}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {c.month ? `${MONTHS[c.month - 1]} · ` : ''}{c.tournament}
                    </p>
                  </div>
                  {c.tier && (
                    <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${TIER_BADGE[c.tier] || TIER_BADGE.P2}`}>
                      {c.tier}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Teams */}
        {journal.topTeams.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Top Duplas</h2>
            <div className="space-y-2">
              {journal.topTeams.map((t, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <div className={`text-lg font-black w-5 text-center ${i === 0 ? 'text-amber-400' : 'text-muted-foreground/50'}`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{t.team}</p>
                    <p className="text-[10px] text-muted-foreground">{t.titles} título(s)</p>
                  </div>
                  <span className="text-sm font-black text-primary tabular-nums">{t.points}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rivalries */}
        {journal.rivalries.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2"><Swords className="h-4 w-4 text-red-400" /> Rivalidades</h2>
            <div className="space-y-3">
              {journal.rivalries.slice(0, 3).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-bold truncate flex-1 text-right">{r.teamA}</span>
                  <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded shrink-0">{r.count}x</span>
                  <span className="font-bold truncate flex-1">{r.teamB}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Results */}
        {journal.recentResults.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2"><Calendar className="h-4 w-4 text-cyan-400" /> Resultados Recentes</h2>
            <div className="space-y-2">
              {journal.recentResults.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
                  <div className="flex-1 min-w-0 text-right">
                    <p className={`font-bold truncate ${r.winner === r.teamA ? 'text-primary' : 'text-muted-foreground'}`}>{r.teamA}</p>
                  </div>
                  <span className="text-[10px] font-black bg-secondary px-2 py-0.5 rounded tabular-nums shrink-0">{r.scoreA}-{r.scoreB}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold truncate ${r.winner === r.teamB ? 'text-primary' : 'text-muted-foreground'}`}>{r.teamB}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}