import React, { useState, useMemo, useEffect } from 'react';
import { Search, Users, X, Crown, ChevronDown } from 'lucide-react';
import { Button } from '@/components/design-system';
import { getAvailablePartners, getLockedPartners, getRealPartnerCandidates, canChangePartner, daysUntilPartnerUnlock } from '@/lib/career';
import { overallRating } from '@/lib/padel';
import { computeCompatibility, compatibilityLabel } from '@/lib/partnershipSystem';
import PlayStyleSummary from '@/components/career/PlayStyleSummary';
import { calculatePartnershipInterest } from '@/players/teamCompatibility.js';
import { localGame } from '@/api/localGameClient.js';
import { listRetiredPartnerOriginIds, excludeRetiredPartnerTemplates } from '@/lib/partnerAthlete.js';

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
  // 5.26-C, Bloco D — templates do catálogo cujo atleta já se aposentou.
  const [retiredIds, setRetiredIds] = useState(() => new Set());
  const canChange = canChangePartner(profile);
  const daysLocked = daysUntilPartnerUnlock(profile);

  useEffect(() => {
    let active = true;
    if (!profile) { setRealCandidates([]); return undefined; }
    getRealPartnerCandidates(profile).then((rows) => { if (active) setRealCandidates(rows || []); }).catch(() => { if (active) setRealCandidates([]); });
    listRetiredPartnerOriginIds().then((ids) => { if (active) setRetiredIds(ids); }).catch(() => {});
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
    return [...excludeRetiredPartnerTemplates(getAvailablePartners(profile), retiredIds), ...realCandidates].map(scored);
  }, [profile, relationships, realCandidates, retiredIds]);

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

  // Fase 5.31 — BUSCA ENXUTA. Antes: 3 linhas de filtros (busca + 4 pílulas
  // de lado + 3 de ordenação) e cards com estilo de jogo completo sempre
  // aberto, e o card inteiro era um <button> com outro <button> dentro.
  // Agora: busca + 2 seletores numa linha; o card mostra nome, OVR, lado,
  // interesse e compatibilidade; estilo, detalhamento e "Convidar" (único
  // primário) só ao abrir. Mesmos filtros, mesma ordenação, mesmos dados.
  return (
    <div className="space-y-3">
      <div className="glass flex items-center gap-2 rounded-2xl p-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar atleta por nome ou país..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select value={sideFilter} onChange={(e) => setSideFilter(e.target.value)} aria-label="Filtrar por lado preferido" className="min-h-10 min-w-0 rounded-xl border border-border/60 bg-background/70 px-2.5 text-xs font-bold outline-none">
          {[['all', 'Todos os lados'], ['right', 'Direita'], ['left', 'Esquerda'], ['flex', 'Versátil']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar candidatos" className="min-h-10 min-w-0 rounded-xl border border-border/60 bg-background/70 px-2.5 text-xs font-bold outline-none">
          {[['compat', 'Compatibilidade'], ['rating', 'Overall'], ['name', 'Nome']].map(([id, label]) => <option key={id} value={id}>Ordenar: {label}</option>)}
        </select>
      </div>

      {!canChange && (
        <div className="glass flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5">
          <X className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-muted-foreground">
            Parceria atual travada por mais <span className="font-bold text-amber-400">{daysLocked} dias</span>. Você pode buscar, mas não convidar ainda.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {filtered.map(({ bot, compat, interest }) => {
          const cl = compatibilityLabel(compat.total);
          const open = selected === bot.id;
          const age = athleteAges[bot.id] ?? bot.age;
          return (
            <article key={bot.id} data-partner-candidate="search" className={`glass rounded-2xl border transition-all ${open ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'}`}>
              <button type="button" onClick={() => setSelected(open ? null : bot.id)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-black text-primary">{bot.name[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-sm font-semibold">
                    {bot.is_real && <Crown className="h-3 w-3 shrink-0 text-amber-400" aria-label="Atleta real" />}
                    <span className="truncate">{bot.name}</span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground"><strong className="text-foreground">OVR {overallRating(bot)}</strong> · {sideLabel(bot.preferred_side)} · {bot.level}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">Interesse {interest.level}{interest.friction ? <span className="text-amber-400"> · condições exigentes</span> : ''}{age ? ` · ${age} anos` : ''}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-lg font-black leading-none tabular-nums ${cl.color}`}>{compat.total}</span>
                  <span className={`block text-[8px] font-bold uppercase ${cl.color}`}>{cl.label}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="space-y-2 border-t border-border/40 p-3 pt-2.5 animate-fade-in">
                  <p className="text-[11px] text-muted-foreground">{bot.country}</p>
                  <PlayStyleSummary profile={bot} compact />
                  {compat.sideResolution && <p className="text-[11px] text-muted-foreground">{compat.sideResolution.explanation}</p>}
                  {compat.warnings?.map(warning => <p key={warning} className="text-[11px] text-amber-400">⚠ {warning}</p>)}
                  {Object.entries(compat.breakdown).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-24 text-[10px] capitalize text-muted-foreground">{factorLabel(key)}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary/70" style={{ width: `${val}%` }} /></div>
                      <span className="w-8 text-right text-[10px] font-bold tabular-nums">{val}</span>
                    </div>
                  ))}
                  {canChange && (
                    <Button level="primary" size="touch" onClick={() => onInvite(bot)} className="mt-1 w-full">
                      <Users className="h-3.5 w-3.5" /> Convidar {bot.name.split(' ')[0]}
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Locked (aspirational) — sinalizado, nunca oculto (Fase 9.4). */}
      {locked.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <X className="h-3 w-3" /> Ainda fora de alcance
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {locked.map(({ bot, interestGated, interest }) => (
              <div key={bot.id} data-partner-candidate="locked" className="glass rounded-xl p-2.5 opacity-50">
                <p className="flex items-center gap-1 truncate text-xs font-semibold">
                  {bot.is_real && <Crown className="h-2.5 w-2.5 shrink-0 text-amber-400" aria-label="Atleta real" />}
                  <span className="truncate">{bot.name}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">OVR {overallRating(bot)}</p>
                <p className="mt-0.5 line-clamp-2 text-[9px] text-muted-foreground">
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
