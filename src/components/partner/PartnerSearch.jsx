import React, { useState, useMemo, useEffect } from 'react';
import { Search, Users, X, Crown } from 'lucide-react';
import { getAvailablePartners, getLockedPartners, getRealPartnerCandidates, canChangePartner, daysUntilPartnerUnlock } from '@/lib/career';
import { overallRating } from '@/lib/padel';
import { computeCompatibility, compatibilityLabel } from '@/lib/partnershipSystem';
import PlayStyleSummary from '@/components/career/PlayStyleSummary';
import { calculatePartnershipInterest } from '@/players/teamCompatibility.js';
import { localGame } from '@/api/localGameClient.js';

export default function PartnerSearch({ profile, relationships, onInvite, onCompare }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('compat');
  const [selected, setSelected] = useState(null);
  const [sideFilter, setSideFilter] = useState('all');
  // Fase 15.2 (Bug 3/G1/G2): tenta ler a idade viva de AthleteProfile pelo
  // mesmo id estável (stableAthleteId, athleteSchema.js) que o mundo usa,
  // para não recalcular nada em paralelo. Hotfix 15.5.2: esses bots
  // (bots.js/athleteCatalog.js) nunca são persistidos em AthleteProfile
  // (mesma lacuna que partnershipSystem.js já tolera com .catch(() => null)
  // no update de mercado ao selecionar parceiro) — a busca abaixo praticamente
  // sempre retorna vazio, então sem fallback a idade nunca aparecia. bot.age
  // (gerado uma única vez no catálogo) é usado só quando não há registro vivo.
  const [athleteAges, setAthleteAges] = useState({});
  // Fase 9.4 — atletas reais livres (`AthleteProfile.filter({market_status:
  // 'livre', is_real:true})`, mesmo pool que o mercado espontâneo já usa),
  // buscados à parte por serem assíncronos — mesmo padrão já usado acima
  // pra `athleteAges`. Somam-se ao catálogo de bots (`BOTS_BY_DIFFICULTY`),
  // nunca o substituem.
  const [realCandidates, setRealCandidates] = useState([]);
  const canChange = canChangePartner(profile);
  const daysLocked = daysUntilPartnerUnlock(profile);

  useEffect(() => {
    let active = true;
    if (!profile) { setRealCandidates([]); return undefined; }
    getRealPartnerCandidates(profile).then((rows) => { if (active) setRealCandidates(rows || []); }).catch(() => { if (active) setRealCandidates([]); });
    return () => { active = false; };
  }, [profile]);

  // Fase 9.4 — mesma pontuação/fricção do mercado espontâneo
  // (`calculatePartnershipInterest`, nunca um segundo cálculo): candidato
  // real com `interest.available` cai no mesmo grupo "disponível" que um
  // bot equivalente; abaixo do piso, some pra "Ainda fora de alcance"
  // (mesma seção que já existe pra bots travados por reputação/ranking) —
  // aparece sinalizado, nunca oculto por completo.
  const allCandidates = useMemo(() => {
    if (!profile) return [];
    const scored = (candidate) => {
      const compat = computeCompatibility(profile, candidate, relationships);
      return { bot: candidate, compat, interest: calculatePartnershipInterest(profile, candidate, compat) };
    };
    return [...getAvailablePartners(profile), ...realCandidates].map(scored);
  }, [profile, relationships, realCandidates]);

  const available = useMemo(() => allCandidates.filter(({ interest }) => interest.available), [allCandidates]);
  const realInterestGatedLocked = useMemo(
    () => allCandidates.filter(({ bot, interest }) => bot.is_real && !interest.available).map(({ bot, interest }) => ({ bot, interestGated: true, interest })),
    [allCandidates],
  );

  useEffect(() => {
    let active = true;
    const ids = available.map(({ bot }) => bot.id).filter(Boolean);
    if (!ids.length) return undefined;
    localGame.entities.AthleteProfile.filter({ id: { $in: ids } }).then((rows) => {
      if (!active) return;
      setAthleteAges(Object.fromEntries((rows || []).map((row) => [row.id, row.age])));
    }).catch(() => {});
    return () => { active = false; };
  }, [available]);

  const filtered = useMemo(() => {
    let list = available;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(({ bot }) => bot.name.toLowerCase().includes(s) || (bot.country || '').toLowerCase().includes(s));
    }
    if (sideFilter !== 'all') list = list.filter(({ bot }) => bot.preferred_side === sideFilter);
    if (sort === 'compat') list = [...list].sort((a, b) => b.compat.total - a.compat.total);
    if (sort === 'rating') list = [...list].sort((a, b) => overallRating(b.bot) - overallRating(a.bot));
    if (sort === 'name') list = [...list].sort((a, b) => a.bot.name.localeCompare(b.bot.name));
    return list;
  }, [available, search, sort, sideFilter]);

  // Fase 5.1, item 2 — getLockedPartners agora mistura dois motivos:
  // nível (XP) e interesse (reputação/ranking, calculatePartnershipInterest).
  // Recalcula o interesse aqui só pra distinguir qual mensagem mostrar —
  // barato (4 candidatos, mesmo teto de antes), evita reimplementar a
  // checagem de nível em getLockedPartners só pra devolver o motivo.
  const locked = useMemo(() => {
    const lockedBots = getLockedPartners(profile).slice(0, 4).map(bot => {
      const interest = calculatePartnershipInterest(profile, bot);
      return { bot, interestGated: !interest.available, interest };
    });
    // Fase 9.4, item 2 — real de baixo interesse nunca some da tela: cai
    // aqui, na MESMA seção "Ainda fora de alcance" que bots travados por
    // reputação/ranking já usam — sinalizado (nome, OVR, nível de
    // interesse calculado), nunca oculto.
    const lockedReals = [...realInterestGatedLocked].sort((a, b) => b.interest.score - a.interest.score).slice(0, 4);
    return [...lockedBots, ...lockedReals];
  }, [profile, realInterestGatedLocked]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="glass rounded-2xl p-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar atleta por nome ou país..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filtrar por lado preferido">
        {[['all', 'Todos os lados'], ['right', 'Direita'], ['left', 'Esquerda'], ['flex', 'Versátil']].map(([id, label]) => (
          <button key={id} onClick={() => setSideFilter(id)} className={`px-3 py-1.5 rounded-lg text-xs ${sideFilter === id ? 'bg-cyan-500/20 text-cyan-300' : 'glass text-muted-foreground'}`}>{label}</button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex gap-2">
        {[
          { id: 'compat', label: 'Compatibilidade' },
          { id: 'rating', label: 'Overall' },
          { id: 'name', label: 'Nome' },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setSort(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${sort === s.id ? 'bg-primary text-primary-foreground' : 'glass text-muted-foreground hover:text-foreground'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {!canChange && (
        <div className="glass rounded-xl p-3 border border-amber-500/30 bg-amber-500/5 flex items-center gap-2">
          <X className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Parceria atual travada por mais <span className="text-amber-400 font-bold">{daysLocked} dias</span>. Você pode buscar, mas não convidar ainda.
          </p>
        </div>
      )}

      {/* Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-stagger">
        {filtered.map(({ bot, compat, interest }) => {
          const cl = compatibilityLabel(compat.total);
          return (
            <button
              key={bot.id}
              onClick={() => setSelected(selected === bot.id ? null : bot.id)}
              className={`glass rounded-2xl p-4 text-left transition-all border ${selected === bot.id ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/40'}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="font-black text-primary">{bot.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1 font-semibold text-sm truncate">
                    {bot.is_real && <Crown className="h-3 w-3 shrink-0 text-amber-400" aria-label="Atleta real" />}
                    {bot.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{bot.country}{(athleteAges[bot.id] ?? bot.age) ? ` · ${athleteAges[bot.id] ?? bot.age} anos` : ''} · OVR {overallRating(bot)} · {bot.level}</p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-black tabular-nums ${cl.color}`}>{compat.total}</p>
                  <p className={`text-[8px] uppercase font-bold ${cl.color}`}>{cl.label}</p>
                </div>
              </div>
              <p className="mb-2 text-[10px] text-muted-foreground">
                Lado: {sideLabel(bot.preferred_side)} · Interesse {interest.level}
                {interest.friction && <span className="text-amber-400"> (condições mais exigentes)</span>}
              </p>
              <PlayStyleSummary profile={bot} compact />
              {selected === bot.id && (
                <div className="mt-3 pt-3 border-t border-border/40 space-y-2 animate-fade-in">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold">Detalhamento</p>
                  {compat.sideResolution && <p className="text-[11px] text-muted-foreground">{compat.sideResolution.explanation}</p>}
                  {compat.warnings?.map(warning => <p key={warning} className="text-[11px] text-amber-400">⚠ {warning}</p>)}
                  {Object.entries(compat.breakdown).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-24 capitalize">{factorLabel(key)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${val}%` }} />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums w-8 text-right">{val}</span>
                    </div>
                  ))}
                  {canChange && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onInvite(bot); }}
                      className="w-full mt-2 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                    >
                      <Users className="h-3.5 w-3.5" /> Convidar {bot.name.split(' ')[0]}
                    </button>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Locked (aspirational) */}
      {locked.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
            <X className="h-3 w-3" /> Ainda fora de alcance
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {locked.map(({ bot, interestGated, interest }) => (
              <div key={bot.id} className="glass rounded-xl p-3 opacity-40 text-center">
                <p className="flex items-center justify-center gap-1 text-xs font-semibold truncate">
                  {bot.is_real && <Crown className="h-2.5 w-2.5 shrink-0 text-amber-400" aria-label="Atleta real" />}
                  {bot.name}
                </p>
                <p className="text-[10px] text-muted-foreground">OVR {overallRating(bot)}</p>
                <p className="text-[9px] text-muted-foreground mt-1">
                  {interestGated ? `Interesse ${interest?.level || 'muito baixo'} (${interest?.score ?? 0}/100) — reputação/ranking ainda baixos` : 'Suba de nível para desbloquear'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function factorLabel(key) {
  const map = { position: 'Posição', style: 'Estilo', personality: 'Personalidade', level: 'Nível', schedule: 'Agenda', chemistry: 'Química', overall: 'Overall' };
  return map[key] || key;
}

function sideLabel(side) {
  return side === 'left' ? 'esquerda' : side === 'right' ? 'direita' : 'versátil';
}
