import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, GitCompare, Inbox, RefreshCw, Search, Star, Users, X } from 'lucide-react';
import { overallRating } from '@/lib/padel';
import { compatibilityLabel, offerCandidate } from '@/lib/partnerOffers';
import { evaluatePartnerCompatibility, calculatePartnershipInterest } from '@/players/teamCompatibility.js';
import { ModalShell, TooltipHint } from '@/components/design-system';

const sideName = side => side === 'left' || side === 'esquerda' ? 'esquerda' : side === 'right' || side === 'direita' ? 'direita' : 'versátil';

export default function PartnerOffersPanel({ profile, offers, loading, error, busyOfferId, focusOfferId, onRetry, onAccept, onReject, onSearch }) {
  const [compared, setCompared] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const pending = useMemo(() => (offers || []).filter(offer => offer.status === 'pending'), [offers]);
  const invalidOffers = useMemo(() => pending.filter(offer => !offerCandidate(offer)?.id), [pending]);
  const analyses = useMemo(() => pending.filter(offer => offerCandidate(offer)?.id).map(offer => {
    const candidate = offerCandidate(offer);
    const compatibility = evaluatePartnerCompatibility(profile, candidate);
    return { offer, candidate, compatibility, interest: calculatePartnershipInterest(profile, candidate, compatibility) };
  }), [pending, profile]);
  const comparedRows = analyses.filter(row => compared.includes(row.offer.id));
  const selectedAnalysis = analyses.find(row => row.offer.id === selectedOfferId) || null;

  useEffect(() => {
    if (focusOfferId && analyses.some(row => row.offer.id === focusOfferId)) setSelectedOfferId(focusOfferId);
  }, [analyses, focusOfferId]);

  if (loading) return <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Carregando propostas...</div>;
  if (error) return <div className="glass rounded-2xl p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-red-400"/><p className="mt-3 font-bold">Não foi possível carregar as propostas.</p><button onClick={onRetry} className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"><RefreshCw className="mr-2 inline h-3 w-3"/>Tentar novamente</button></div>;
  if (!pending.length) return <div className="glass rounded-2xl p-8 text-center"><Inbox className="mx-auto h-9 w-9 text-muted-foreground"/><h3 className="mt-3 font-black">Você ainda não possui propostas pendentes</h3><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Procure atletas disponíveis no mercado. Propostas recusadas continuam preservadas no histórico.</p><div className="mt-4 flex justify-center gap-2"><button onClick={onSearch} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"><Search className="mr-2 inline h-3 w-3"/>Buscar parceiros</button></div></div>;

  const toggleCompare = id => setCompared(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 3 ? [...current, id] : current);
  return <div className="space-y-4">
    {/* Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.15): o parágrafo
        explicativo sempre visível virou um TooltipHint ao lado do título —
        mesma informação, sob demanda em vez de ocupar espaço fixo. */}
    <section className="glass rounded-2xl border border-primary/25 p-4" aria-labelledby="partner-offers-title">
      <div className="flex items-center gap-2">
        <h2 id="partner-offers-title" className="font-black">Escolha sua dupla</h2>
        <TooltipHint label="Como escolher" content="Seu parceiro influencia desempenho, entrosamento e evolução. Compare lado preferencial, estilo, nível e interesse antes de decidir." />
      </div>
    </section>
    {invalidOffers.map(offer => <section key={offer.id} className="glass rounded-2xl border border-amber-500/30 p-4" role="status"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-400"/><div><h3 className="font-bold">Proposta indisponível</h3><p className="mt-1 text-xs text-muted-foreground">O atleta vinculado a esta proposta não existe mais neste save. O registro foi preservado para diagnóstico e não pode ser aceito.</p><button disabled={busyOfferId} onClick={()=>onReject(offer)} className="mt-3 rounded-xl bg-secondary px-3 py-2 text-xs font-bold disabled:opacity-50">Arquivar proposta</button></div></div></section>)}
    {comparedRows.length >= 2 && <Comparison rows={comparedRows} onClose={() => setCompared([])} />}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {analyses.map(({ offer, candidate, compatibility, interest }, index) => (
        <OfferCard
          key={offer.id}
          offer={offer}
          candidate={candidate}
          compatibility={compatibility}
          interest={interest}
          highlighted={offer.id === focusOfferId || index === 0}
          selected={compared.includes(offer.id)}
          busy={busyOfferId === offer.id}
          disabled={Boolean(busyOfferId)}
          onToggleCompare={() => toggleCompare(offer.id)}
          onAnalyze={() => setSelectedOfferId(offer.id)}
        />
      ))}
    </div>
    <ModalShell
      open={Boolean(selectedAnalysis)}
      onClose={() => setSelectedOfferId(null)}
      title={selectedAnalysis ? `Proposta de ${selectedAnalysis.candidate.name}` : 'Proposta de parceria'}
      description={selectedAnalysis ? `Compatibilidade ${selectedAnalysis.compatibility.total} · ${compatibilityLabel(selectedAnalysis.compatibility.total)}` : null}
      size="sm"
      footer={selectedAnalysis && <div className="grid grid-cols-2 gap-2"><button disabled={busyOfferId} onClick={() => onReject(selectedAnalysis.offer)} className="rounded-xl bg-red-500/15 px-4 py-3 text-sm font-bold text-red-400 disabled:opacity-50"><X className="mr-1 inline h-4 w-4"/>Recusar</button><button disabled={busyOfferId} onClick={() => onAccept(selectedAnalysis.offer)} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><Users className="mr-1 inline h-4 w-4"/>{busyOfferId === selectedAnalysis.offer.id ? 'Confirmando...' : 'Aceitar proposta'}</button></div>}
    >
      {selectedAnalysis && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs"><Metric label="Lado" value={sideName(selectedAnalysis.candidate.preferred_side || selectedAnalysis.candidate.position)}/><Metric label="Estilo" value={selectedAnalysis.candidate.play_style || selectedAnalysis.candidate.tactical_role || 'equilibrado'}/><Metric label="Ranking" value={selectedAnalysis.candidate.world_rank || selectedAnalysis.candidate.ranking_position || '—'}/><Metric label="Interesse" value={`${selectedAnalysis.interest.level} (${selectedAnalysis.interest.score})`}/></div>
        <div className="rounded-xl bg-secondary/35 p-3 text-sm"><p className="font-bold">Formação sugerida</p><p className="mt-1 text-muted-foreground">Você: {sideName(selectedAnalysis.compatibility.sideResolution.assignments.playerA)} · {selectedAnalysis.candidate.name}: {sideName(selectedAnalysis.compatibility.sideResolution.assignments.playerB)}</p></div>
        <p className="text-sm text-muted-foreground">Parceria temporária · {selectedAnalysis.offer.contract?.durationDays || 60} dias · divisão {selectedAnalysis.offer.contract?.prizeSplit || 50}%/{100-(selectedAnalysis.offer.contract?.prizeSplit || 50)}%</p>
      </div>}
    </ModalShell>
  </div>;
}

// Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.11): este era o card mais
// alto de toda a auditoria (~430-480px, sempre expandido). Nome/score/
// lado/estilo/ranking + os 2 botões de ação continuam sempre visíveis;
// formação sugerida + pontos fortes/atenção + termos do contrato ficam
// atrás de um toggle local, recolhidos por padrão.
function OfferCard({ offer, candidate, compatibility, interest, highlighted, selected, busy, disabled, onToggleCompare, onAnalyze }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article tabIndex={0} className={`glass rounded-2xl border p-4 ${highlighted ? 'border-primary/50' : 'border-transparent'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black">{candidate.name}</h3>
            {offer.recommended && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[9px] font-bold text-amber-300"><Star className="mr-1 inline h-3 w-3"/>Recomendado para sua primeira dupla</span>}
          </div>
          <p className="text-xs text-muted-foreground">{candidate.country || 'Nacionalidade não informada'} · OVR {overallRating(candidate)} · {candidate.level || 'iniciante'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black text-primary">{compatibility.total}</p>
          <p className="text-[9px] font-bold uppercase text-primary">{compatibilityLabel(compatibility.total)}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Metric label="Lado" value={sideName(candidate.preferred_side || candidate.position)}/><Metric label="Estilo" value={candidate.play_style || candidate.tactical_role || 'equilibrado'}/><Metric label="Ranking" value={candidate.world_rank || candidate.ranking_position || '—'}/><Metric label="Interesse" value={`${interest.level} (${interest.score})`}/></div>

      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-3 flex w-full items-center justify-between gap-2 text-[10px] font-bold text-muted-foreground hover:text-foreground">
        Formação sugerida, pontos fortes e termos
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-3 animate-fade-in">
          <div className="rounded-xl bg-secondary/35 p-3 text-xs"><p className="font-bold">Formação sugerida</p><p className="mt-1 text-muted-foreground">Você: {sideName(compatibility.sideResolution.assignments.playerA)} · {candidate.name}: {sideName(compatibility.sideResolution.assignments.playerB)}</p>{compatibility.sideResolution.penalties.total > 0 && <p className="mt-1 text-amber-400">Impacto estimado: -{compatibility.sideResolution.penalties.total}% durante a adaptação.</p>}</div>
          <div className="grid gap-2 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-green-400">Pontos fortes</p>{compatibility.strengths.slice(0,3).map(item=><p key={item} className="mt-1 text-xs text-muted-foreground"><Check className="mr-1 inline h-3 w-3 text-green-400"/>{item}</p>)}</div><div><p className="text-[10px] font-bold uppercase text-amber-400">Atenção</p>{compatibility.warnings.length ? compatibility.warnings.slice(0,2).map(item=><p key={item} className="mt-1 text-xs text-muted-foreground"><AlertTriangle className="mr-1 inline h-3 w-3 text-amber-400"/>{item}</p>) : <p className="mt-1 text-xs text-muted-foreground">Nenhuma limitação relevante.</p>}</div></div>
          <p className="text-[11px] text-muted-foreground">Parceria temporária · {offer.contract?.durationDays || 60} dias · divisão {offer.contract?.prizeSplit || 50}%/{100-(offer.contract?.prizeSplit || 50)}%</p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2"><button aria-pressed={selected} onClick={onToggleCompare} className={`rounded-xl py-2 text-xs font-bold ${selected ? 'bg-cyan-500/20 text-cyan-300' : 'glass'}`}><GitCompare className="mr-1 inline h-3 w-3"/>Comparar</button><button disabled={disabled} onClick={onAnalyze} className="rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"><Users className="mr-1 inline h-3 w-3"/>{busy ? 'Confirmando...' : 'Analisar proposta'}</button></div>
    </article>
  );
}

function Metric({label,value}) { return <div className="rounded-lg bg-secondary/35 p-2"><p className="text-[9px] uppercase text-muted-foreground">{label}</p><p className="truncate font-bold capitalize">{value}</p></div>; }
function Comparison({rows,onClose}) { return <section className="glass rounded-2xl border border-cyan-500/30 p-4 overflow-x-auto"><div className="mb-3 flex items-center justify-between"><h3 className="font-black"><GitCompare className="mr-2 inline h-4 w-4"/>Comparação de propostas</h3><button onClick={onClose} aria-label="Fechar comparação"><X className="h-4 w-4"/></button></div><table className="w-full min-w-[520px] text-xs"><thead><tr><th className="p-2 text-left">Critério</th>{rows.map(row=><th key={row.offer.id} className="p-2 text-left">{row.candidate.name}</th>)}</tr></thead><tbody>{[['Compatibilidade',r=>`${r.compatibility.total} · ${compatibilityLabel(r.compatibility.total)}`],['Lado',r=>sideName(r.candidate.preferred_side||r.candidate.position)],['Estilo',r=>r.candidate.play_style||r.candidate.tactical_role||'equilibrado'],['OVR',r=>overallRating(r.candidate)],['Interesse',r=>r.interest.level],['Penalidade de lado',r=>`${r.compatibility.sideResolution.penalties.total}%`],['Duração',r=>`${r.offer.contract?.durationDays||60} dias`]].map(([label,get])=><tr key={label} className="border-t border-border/40"><th className="p-2 text-left text-muted-foreground">{label}</th>{rows.map(row=><td key={row.offer.id} className="p-2 font-semibold capitalize">{get(row)}</td>)}</tr>)}</tbody></table></section>; }
