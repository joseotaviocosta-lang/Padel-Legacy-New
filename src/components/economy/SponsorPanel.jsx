import React, { useMemo, useState } from 'react';
import { Star, Check, Lock, Coins, RefreshCw, AlertTriangle, Handshake, Search, SlidersHorizontal } from 'lucide-react';
import { GlassCard, EmptyStateCard } from '@/components/padel/ui';
import { SPONSOR_CATALOG, getSponsorTierStyle, canSign, calculateProfileMatch, negotiateOffer, getSponsorCategory, validateSponsorSlot, SPONSOR_SLOT_LIMITS } from '@/lib/sponsors';
import SponsorNegotiationModal from './SponsorNegotiationModal';
import { formatDate } from '@/lib/padel';

const formatNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('pt-BR') : fallback.toLocaleString('pt-BR');
};

export default function SponsorPanel({ profile, contracts, onSign, onTerminate, onRenew, busy }) {
  const [negotiating, setNegotiating] = useState(null);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [sort, setSort] = useState('match_desc');
  const activeContracts = (contracts || []).filter(c => c && c.is_active);
  const validSponsors = useMemo(() => (SPONSOR_CATALOG || []).filter(s => s && s.id && s.name), []);
  const activeSponsorIds = activeContracts.map(c => c?.sponsor_id).filter(Boolean);

  const industries = useMemo(() => ['all', ...Array.from(new Set(validSponsors.map(s => s.industry).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))], [validSponsors]);

  const filteredSponsors = useMemo(() => {
    let result = validSponsors.map(sponsor => ({
      sponsor,
      check: (() => { const eligibility = canSign(sponsor, profile); return eligibility.ok ? validateSponsorSlot(sponsor, activeContracts) : eligibility; })(),
      match: calculateProfileMatch(sponsor, profile),
      offer: negotiateOffer(sponsor, profile),
      isActive: activeSponsorIds.includes(sponsor.id),
    }));
    const term = search.trim().toLowerCase();
    if (term) result = result.filter(x => [x.sponsor.name, x.sponsor.industry, x.sponsor.country, x.sponsor.description].some(v => String(v || '').toLowerCase().includes(term)));
    if (tierFilter !== 'all') result = result.filter(x => x.sponsor.tier === tierFilter);
    if (industryFilter !== 'all') result = result.filter(x => x.sponsor.industry === industryFilter);
    if (availabilityFilter === 'eligible') result = result.filter(x => x.check.ok && !x.isActive);
    if (availabilityFilter === 'locked') result = result.filter(x => !x.check.ok);
    if (availabilityFilter === 'active') result = result.filter(x => x.isActive);
    if (sort === 'match_desc') result.sort((a, b) => b.match.score - a.match.score);
    if (sort === 'salary_desc') result.sort((a, b) => b.offer.monthly_salary - a.offer.monthly_salary);
    if (sort === 'salary_asc') result.sort((a, b) => a.offer.monthly_salary - b.offer.monthly_salary);
    if (sort === 'tier_desc') { const rank = { Ouro: 3, Prata: 2, Bronze: 1 }; result.sort((a, b) => rank[b.sponsor.tier] - rank[a.sponsor.tier]); }
    if (sort === 'name_asc') result.sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name, 'pt-BR'));
    return result;
  }, [profile, activeContracts, validSponsors, search, tierFilter, industryFilter, availabilityFilter, sort]);

  return (
    <div className="space-y-4">
      <GlassCard><h2 className="font-bold text-sm mb-2">Slots de patrocínio</h2><div className="grid grid-cols-2 md:grid-cols-5 gap-2">{Object.entries(SPONSOR_SLOT_LIMITS).map(([category, limit]) => { const used = activeContracts.filter((contract) => { const sponsor = validSponsors.find((item) => item.id === contract.sponsor_id || item.name === contract.sponsor_name); return (contract.sponsor_category || (sponsor && getSponsorCategory(sponsor))) === category; }).length; return <div key={category} className="rounded-lg bg-secondary/30 p-2"><p className="text-[9px] uppercase text-muted-foreground">{category}</p><p className="text-sm font-black">{used}/{limit}</p></div>; })}</div><p className="text-[10px] text-muted-foreground mt-2">Marcas da mesma categoria competem pelo mesmo espaço. Contratos legados são preservados.</p></GlassCard>
      {/* Active contracts */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Check className="h-4 w-4 text-green-400" /> Contratos Ativos
        </h2>
        {activeContracts.length === 0 ? (
          <EmptyStateCard icon={Star} message="Nenhum contrato ativo. Negocie com um patrocinador abaixo!" />
        ) : (
          <div className="space-y-2">
            {activeContracts.map((c, i) => {
              const sponsor = validSponsors.find(s => s?.id === c?.sponsor_id)
                || validSponsors.find(s => String(s?.name || '').toLowerCase() === String(c?.sponsor_name || '').toLowerCase());
              const tier = getSponsorTierStyle(c.sponsor_tier);
              const satisfaction = c.satisfaction_score || 50;
              const category = c.sponsor_category || (sponsor ? getSponsorCategory(sponsor) : 'legado');
              const satColor = satisfaction >= 70 ? 'text-green-400' : satisfaction >= 40 ? 'text-amber-400' : 'text-destructive';
              const canRenew = c.is_renewable && sponsor;
              return (
                <div key={c.id || i} className="rounded-xl bg-secondary/30 p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-9 w-9 rounded-lg bg-secondary/40 flex items-center justify-center text-lg shrink-0">
                      {sponsor?.logo_emoji || '🏢'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold">{c.sponsor_name}</p>
                        <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded border ${tier.badge}`}>{tier.label}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {formatNumber(c.monthly_salary)} moedas/mês · até {c.end_date ? formatDate(c.end_date) : 'data a definir'} · {c.duration_months || 6} meses · slot {category}
                      </p>
                    </div>
                  </div>
                  {/* Satisfaction bar */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[9px] mb-0.5">
                      <span className="text-muted-foreground">Satisfação do patrocinador</span>
                      <span className={`font-bold ${satColor}`}>{satisfaction}/100</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                      <div className={`h-full rounded-full ${satColor.replace('text-', 'bg-')}`} style={{ width: `${satisfaction}%` }} />
                    </div>
                    {satisfaction < 35 && (
                      <p className="text-[9px] text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> Risco de rescisão por mau desempenho!
                      </p>
                    )}
                  </div>
                  {/* Marketing requirements */}
                  {c.marketing_requirements && c.marketing_requirements.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {c.marketing_requirements.slice(0, 4).map(req => (
                        <span key={req} className="px-1.5 py-0.5 rounded-full text-[8px] font-semibold bg-secondary/50 text-muted-foreground">
                          {req}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {canRenew && (
                      <button
                        onClick={() => onRenew(c, sponsor)}
                        disabled={busy === 'renew'}
                        className="text-[10px] text-primary hover:text-primary/80 font-semibold px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" /> Renovar
                      </button>
                    )}
                    <button
                      onClick={() => onTerminate(c)}
                      disabled={busy === 'terminate'}
                      className="text-[10px] text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      Rescindir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Available sponsors */}
      <GlassCard>
        <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
          <Star className="h-4 w-4 text-amber-400" /> Patrocinadores Disponíveis
        </h2>
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar patrocinador, setor ou país..." className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary/30 border border-border/40 text-sm" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary/30 border border-border/40 text-xs">
              <option value="all">Todos os níveis</option><option value="Bronze">Bronze</option><option value="Prata">Prata</option><option value="Ouro">Ouro</option>
            </select>
            <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary/30 border border-border/40 text-xs">
              {industries.map(industry => <option key={industry} value={industry}>{industry === 'all' ? 'Todos os setores' : industry}</option>)}
            </select>
            <select value={availabilityFilter} onChange={(e) => setAvailabilityFilter(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary/30 border border-border/40 text-xs">
              <option value="all">Todos os status</option><option value="eligible">Posso negociar</option><option value="locked">Bloqueados</option><option value="active">Contratos ativos</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-3 py-2 rounded-xl bg-secondary/30 border border-border/40 text-xs">
              <option value="match_desc">Melhor compatibilidade</option><option value="salary_desc">Maior salário</option><option value="salary_asc">Menor exigência</option><option value="tier_desc">Maior nível</option><option value="name_asc">Nome A-Z</option>
            </select>
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><SlidersHorizontal className="h-3 w-3" /> {filteredSponsors.length} de {validSponsors.length} patrocinadores</p>
        </div>
        {filteredSponsors.length === 0 ? (
          <EmptyStateCard icon={Star} message="Nenhum patrocinador encontrado com esses filtros." />
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredSponsors.map(({ sponsor, check, match, offer, isActive }) => {
            const tier = getSponsorTierStyle(sponsor.tier);
            const canNegotiate = check.ok && !isActive;
            return (
              <div key={sponsor.id} className={`rounded-xl border p-3 ${isActive ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-secondary/20'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-secondary/40 flex items-center justify-center text-base">
                      {sponsor.logo_emoji || '🏢'}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{sponsor.name}</p>
                      <p className="text-[8px] text-muted-foreground">{sponsor.industry} · {sponsor.country}</p>
                    </div>
                  </div>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${tier.badge}`}>{tier.label}</span>
                </div>

                {/* Match score */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${match.score >= 70 ? 'bg-green-400' : match.score >= 50 ? 'bg-primary' : 'bg-amber-400'}`}
                      style={{ width: `${match.score}%` }}
                    />
                  </div>
                  <span className={`text-[9px] font-bold ${match.score >= 70 ? 'text-green-400' : match.score >= 50 ? 'text-primary' : 'text-amber-400'}`}>
                    {match.score}%
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                  <span className="flex items-center gap-0.5"><Coins className="h-3 w-3 text-yellow-400" />{formatNumber(offer?.monthly_salary)}/mês</span>
                  <span className="flex items-center gap-0.5 text-green-400">+{formatNumber(offer?.sign_bonus)}</span>
                  <span className="text-cyan-400">{offer?.duration_months || 6}m</span>
                </div>

                {(!check.ok || isActive) && (
                  <div className="flex items-center gap-1 text-[9px] text-amber-400 mb-2">
                    <Lock className="h-3 w-3" />
                    {isActive ? 'Contrato ativo' : check.reason}
                  </div>
                )}

                {isActive ? (
                  <div className="flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-primary">
                    <Check className="h-3.5 w-3.5" /> Ativo
                  </div>
                ) : (
                  <button
                    onClick={() => setNegotiating(sponsor)}
                    disabled={!canNegotiate}
                    className="w-full py-2 rounded-xl bg-primary/15 text-primary font-semibold text-xs hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <Handshake className="h-3.5 w-3.5" /> Negociar
                  </button>
                )}
              </div>
            );
          })}
        </div>
        )}
      </GlassCard>

      {negotiating && (
        <SponsorNegotiationModal
          sponsor={negotiating}
          profile={profile}
          onSign={(s) => {
            setNegotiating(null);
            onSign(s);
          }}
          onClose={() => setNegotiating(null)}
          busy={busy === 'sign'}
        />
      )}
    </div>
  );
}
