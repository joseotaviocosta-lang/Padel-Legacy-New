import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, GitCompare, Inbox, RefreshCw, Search, Star, Users, X } from 'lucide-react';
import { overallRating } from '@/lib/padel';
import { compatibilityLabel, offerCandidate } from '@/lib/partnerOffers';
import { evaluatePartnerCompatibility, calculatePartnershipInterest } from '@/players/teamCompatibility.js';
import { Button, ModalActions, ModalShell, TooltipHint } from '@/components/design-system';

const sideName = side => side === 'left' || side === 'esquerda' ? 'esquerda' : side === 'right' || side === 'direita' ? 'direita' : 'versátil';
const styleOf = candidate => candidate.play_style || candidate.tactical_role || 'equilibrado';
const termsOf = offer => ({ days: offer.contract?.durationDays || 60, split: offer.contract?.prizeSplit || 50 });

export default function PartnerOffersPanel({ profile, offers, loading, error, busyOfferId, focusOfferId, onRetry, onAccept, onReject, onSearch, currentPartnership = null }) {
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
  if (error) return <div className="glass rounded-2xl p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-red-400"/><p className="mt-3 font-bold">Não foi possível carregar as propostas.</p><Button level="secondary" size="sm" onClick={onRetry} className="mt-4"><RefreshCw className="h-3 w-3"/>Tentar novamente</Button></div>;
  if (!pending.length) return <div className="glass rounded-2xl p-6 text-center"><Inbox className="mx-auto h-8 w-8 text-muted-foreground"/><h3 className="mt-3 font-black">Nenhuma proposta pendente</h3><p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">Procure atletas disponíveis no mercado. Propostas recusadas continuam no histórico.</p><Button level="secondary" size="sm" onClick={onSearch} className="mt-4"><Search className="h-3 w-3"/>Buscar parceiros</Button></div>;

  const toggleCompare = id => setCompared(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 3 ? [...current, id] : current);
  return <div className="space-y-3">
    {/* Mobile M4 (M4.15): a explicação fica num TooltipHint ao lado do título. */}
    <div className="flex items-center gap-2 px-1" aria-labelledby="partner-offers-title">
      <h2 id="partner-offers-title" className="text-sm font-black">Escolha sua dupla · {analyses.length} proposta{analyses.length === 1 ? '' : 's'}</h2>
      <TooltipHint label="Como escolher" content="Seu parceiro influencia desempenho, entrosamento e evolução. Compare lado preferencial, estilo, nível e interesse antes de decidir. Toque em uma proposta para ver formação, pontos fortes e termos." />
    </div>
    {invalidOffers.map(offer => <section key={offer.id} className="glass rounded-2xl border border-amber-500/30 p-3" role="status"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-400"/><div><h3 className="text-sm font-bold">Proposta indisponível</h3><p className="mt-1 text-xs text-muted-foreground">O atleta desta proposta não existe mais neste save. O registro foi preservado e não pode ser aceito.</p><Button level="ghost" size="sm" disabled={Boolean(busyOfferId)} onClick={()=>onReject(offer)} className="mt-2">Arquivar proposta</Button></div></div></section>)}
    {comparedRows.length >= 2 && <Comparison rows={comparedRows} onClose={() => setCompared([])} />}
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {analyses.map(({ offer, candidate, compatibility, interest }) => (
        <OfferCard
          key={offer.id}
          offer={offer}
          candidate={candidate}
          compatibility={compatibility}
          interest={interest}
          highlighted={offer.id === focusOfferId || offer.recommended}
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
      footer={selectedAnalysis && <ModalActions
        secondary={<Button level="ghost" disabled={Boolean(busyOfferId)} onClick={() => onReject(selectedAnalysis.offer)} className="text-red-400"><X className="h-4 w-4"/>Recusar</Button>}
        primary={<Button level="primary" size="touch" disabled={Boolean(busyOfferId)} onClick={() => onAccept(selectedAnalysis.offer)} sublabel={`${termsOf(selectedAnalysis.offer).days} dias · você fica com ${termsOf(selectedAnalysis.offer).split}%`}><Users className="h-4 w-4"/>{busyOfferId === selectedAnalysis.offer.id ? 'Confirmando...' : 'Aceitar proposta'}</Button>}
      />}
    >
      {selectedAnalysis && <OfferDetail analysis={selectedAnalysis} currentPartnership={currentPartnership} />}
    </ModalShell>
  </div>;
}

// Fase 5.31 — DETALHE SOB DEMANDA. Tudo o que o card compacto não mostra:
// formação sugerida, pontos fortes/atenção, termos e (quando já existe uma
// dupla) a comparação com o parceiro atual — só com dados que já existem.
function OfferDetail({ analysis, currentPartnership }) {
  const { offer, candidate, compatibility, interest } = analysis;
  const terms = termsOf(offer);
  return <div className="space-y-3 text-xs">
    <div className="grid grid-cols-2 gap-2"><Metric label="Lado" value={sideName(candidate.preferred_side || candidate.position)}/><Metric label="Estilo" value={styleOf(candidate)}/><Metric label="Ranking" value={candidate.world_rank || candidate.ranking_position || '—'}/><Metric label="Interesse" value={`${interest.level} (${interest.score})`}/></div>
    {offer.first_partnership_reason && <div className="rounded-xl bg-primary/10 p-3"><p className="font-bold text-primary">{offer.first_partnership_reason.title}</p><p className="mt-1 text-muted-foreground">{offer.first_partnership_reason.body}</p></div>}
    <div className="rounded-xl bg-secondary/35 p-3"><p className="font-bold">Formação sugerida</p><p className="mt-1 text-muted-foreground">Você: {sideName(compatibility.sideResolution.assignments.playerA)} · {candidate.name}: {sideName(compatibility.sideResolution.assignments.playerB)}</p>{compatibility.sideResolution.penalties.total > 0 && <p className="mt-1 text-amber-400">Impacto estimado: -{compatibility.sideResolution.penalties.total}% durante a adaptação.</p>}</div>
    <div className="grid gap-2 sm:grid-cols-2"><div><p className="text-[10px] font-bold uppercase text-green-400">Pontos fortes</p>{compatibility.strengths.slice(0,3).map(item=><p key={item} className="mt-1 text-muted-foreground"><Check className="mr-1 inline h-3 w-3 text-green-400"/>{item}</p>)}</div><div><p className="text-[10px] font-bold uppercase text-amber-400">Atenção</p>{compatibility.warnings.length ? compatibility.warnings.slice(0,2).map(item=><p key={item} className="mt-1 text-muted-foreground"><AlertTriangle className="mr-1 inline h-3 w-3 text-amber-400"/>{item}</p>) : <p className="mt-1 text-muted-foreground">Nenhuma limitação relevante.</p>}</div></div>
    {currentPartnership ? (
      <div className="rounded-xl border border-border/50 p-3" data-offer-vs-current>
        <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">Dupla atual × proposta</p>
        <CompareRow label="Parceiro" a={currentPartnership.partner_name} b={candidate.name} />
        <CompareRow label="Química" a={`${currentPartnership.chemistry ?? '—'} atual`} b={`${compatibility.total} estimada`} />
        <CompareRow label="Sua parte" a={`${currentPartnership.prize_split_pct ?? 50}%`} b={`${terms.split}%`} />
      </div>
    ) : null}
    <p className="text-[11px] text-muted-foreground">Parceria temporária · {terms.days} dias · divisão {terms.split}%/{100 - terms.split}%</p>
  </div>;
}

// Mobile M4 (M4.11) + 5.31: o card mostra só o essencial para decidir —
// nome, tipo, OVR, lado, estilo, interesse, termos e a compatibilidade. Uma
// ação secundária ("Analisar"); o único primário ("Aceitar") fica no modal.
function OfferCard({ offer, candidate, compatibility, interest, highlighted, selected, busy, disabled, onToggleCompare, onAnalyze }) {
  const terms = termsOf(offer);
  const label = compatibilityLabel(compatibility.total);
  return (
    <article tabIndex={0} data-partner-candidate="offer" className={`glass rounded-2xl border p-3 ${highlighted ? 'border-primary/50' : 'border-transparent'}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-black text-primary">{(candidate.name || '?')[0]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-black">{candidate.name}</h3>
            {offer.recommended
              ? <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300"><Star className="h-2.5 w-2.5"/>Recomendado</span>
              : <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">Proposta</span>}
          </div>
          <p className="truncate text-[11px] text-muted-foreground"><strong className="text-foreground">OVR {overallRating(candidate)}</strong> · {sideName(candidate.preferred_side || candidate.position)} · <span className="capitalize">{styleOf(candidate)}</span></p>
          <p className="truncate text-[11px] text-muted-foreground">Interesse {interest.level} · {terms.days} dias · você {terms.split}%</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-black leading-none text-primary tabular-nums">{compatibility.total}</p>
          <p className="mt-0.5 text-[9px] font-bold uppercase text-primary">{label}</p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-[auto_1fr] gap-2">
        <Button level="ghost" size="sm" aria-pressed={selected} onClick={onToggleCompare} className={selected ? 'bg-cyan-500/20 text-cyan-300' : ''}><GitCompare className="h-3 w-3"/>Comparar</Button>
        <Button level="secondary" size="sm" disabled={disabled} onClick={onAnalyze}>{busy ? 'Confirmando...' : 'Analisar proposta'}</Button>
      </div>
    </article>
  );
}

function Metric({label,value}) { return <div className="rounded-lg bg-secondary/35 p-2"><p className="text-[9px] uppercase text-muted-foreground">{label}</p><p className="truncate font-bold capitalize">{value}</p></div>; }
function CompareRow({ label, a, b }) { return <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2 py-0.5"><span className="text-muted-foreground">{label}</span><span className="truncate">{a}</span><strong className="truncate">{b}</strong></div>; }

// 5.31: sem tabela de largura mínima (520px estourava no celular, rolando de
// lado). Grade com uma coluna por proposta, valores truncados.
function Comparison({rows,onClose}) {
  const criteria = [['Compatib.',r=>`${r.compatibility.total}`],['OVR',r=>overallRating(r.candidate)],['Lado',r=>sideName(r.candidate.preferred_side||r.candidate.position)],['Estilo',r=>styleOf(r.candidate)],['Interesse',r=>r.interest.level],['Pen. lado',r=>`${r.compatibility.sideResolution.penalties.total}%`],['Duração',r=>`${termsOf(r.offer).days}d`]];
  const cols = { gridTemplateColumns: `4.5rem repeat(${rows.length}, minmax(0, 1fr))` };
  return <section className="glass rounded-2xl border border-cyan-500/30 p-3" data-partner-comparison>
    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black"><GitCompare className="mr-1.5 inline h-4 w-4"/>Comparação</h3><button type="button" onClick={onClose} aria-label="Fechar comparação" className="p-1"><X className="h-4 w-4"/></button></div>
    <div className="grid gap-x-2 text-[11px]" style={cols}>
      <span />{rows.map(row=><strong key={row.offer.id} className="truncate">{row.candidate.name.split(' ')[0]}</strong>)}
      {criteria.map(([label,get])=><React.Fragment key={label}><span className="border-t border-border/40 py-1 text-muted-foreground">{label}</span>{rows.map(row=><span key={row.offer.id} className="truncate border-t border-border/40 py-1 font-semibold capitalize">{get(row)}</span>)}</React.Fragment>)}
    </div>
  </section>;
}
