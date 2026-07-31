import React from 'react';
import { Link } from 'react-router-dom';
import { Globe, Users, ChevronRight } from 'lucide-react';

export default function RankingCards({ profile, worldRank, teamRank }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link to="/ranking" className="glass glass-hover rounded-2xl p-4 flex flex-col gap-2 group">
        <div className="flex items-center justify-between">
          <div className="h-8 w-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
            <Globe className="h-4 w-4 text-cyan-400" />
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
        <div>
          <p className="text-2xl font-black text-cyan-400 tabular-nums">#{worldRank?.rank || '—'}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Mundial · {worldRank?.total || 0} jogadores</p>
        </div>
      </Link>
      <Link to="/ranking" className="glass glass-hover rounded-2xl p-4 flex flex-col gap-2 group">
        <div className="flex items-center justify-between">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Users className="h-4 w-4 text-amber-400" />
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
        <div>
          <p className="text-2xl font-black text-amber-400 tabular-nums">#{teamRank?.rank || '—'}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">Dupla · {profile?.partner_name || 'Sem dupla'}</p>
        </div>
      </Link>
    </div>
  );
}