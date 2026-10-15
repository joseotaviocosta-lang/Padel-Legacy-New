import React from 'react';
import { Surface, SurfaceHeader, StatCard, StatusBadge } from '@/components/design-system';
import { Button } from '@/components/ui/button';
import { ClipboardList, Sparkles, HeartPulse, CalendarCheck } from 'lucide-react';
import { formatStaffPlan, formatStaffRecommendations } from '@/lib/staffReportPresentation.js';

// Playthrough 5.13 (continuação), Partes D/E — o relatório EXATO que
// motivou a notificação da comissão.
//
// Antes, clicar em "Evolução da comissão" ou "Bruno Salvatierra tem uma
// novidade" abria apenas o topo da página de Comissão Técnica: o
// `destination` não levava identificador nenhum, então não havia como saber
// qual relatório mostrar. O conteúdo já existia na própria mensagem
// (`metadata.recommendations/synergy/moral/proposed_plan`) — só não tinha
// onde aparecer.
//
// Este bloco não inventa dado: renderiza o que a mensagem já carrega.
export default function StaffReportHighlight({ report, highlightedMemberName, onAction }) {
  if (!report) return null;
  const metadata = report.metadata || {};
  // Playthrough 5.19, Partes A/B — toda formatação passa por
  // `staffReportPresentation`, a fonte única. Antes, `String(plan)` produzia
  // "[object Object]" e as recomendações caíam num `JSON.stringify` porque o
  // código procurava `label`/`message` num shape que é `{priority,title,body}`.
  // O formatter também entende o save legado, em que `proposed_plan` guarda o
  // mapa de dias em vez do rótulo.
  const recommendations = formatStaffRecommendations(metadata.recommendations);
  const synergy = Number(metadata.synergy);
  const moral = Number(metadata.moral);
  const plan = formatStaffPlan(
    metadata.proposed_plan ?? (metadata.proposed_plan_sessions ? { plan: metadata.proposed_plan_sessions } : null),
  );
  const planDetail = plan?.detail || metadata.proposed_plan_reason || 'recomendação da semana';
  const when = report.career_date || null;
  // `formatAlternative` (competitiveStaffReview.js) já devolve string, mas um
  // save legado pode trazer objeto — o formatter cobre os dois sem vazar.
  const alternatives = formatStaffRecommendations(metadata.alternatives);
  const ctaLabel = metadata.cta_label || report.actions?.[0]?.label || null;

  return (
    <Surface variant="premium" className="border-primary/40 ring-1 ring-primary/30">
      <SurfaceHeader
        icon={ClipboardList}
        title={report.subject || report.title || 'Relatório da comissão'}
        description={when ? `Registrado em ${when}` : 'Relatório da comissão técnica'}
        action={<StatusBadge tone="brand">Da sua notificação</StatusBadge>}
      />

      {highlightedMemberName ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Profissional relacionado: <span className="font-bold text-foreground">{highlightedMemberName}</span>
        </p>
      ) : null}

      {(report.body || report.content) ? (
        <p className="mb-4 text-sm leading-relaxed">{report.body || report.content}</p>
      ) : null}

      {(Number.isFinite(synergy) || Number.isFinite(moral) || plan) ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Number.isFinite(synergy) ? (
            <StatCard label="Sinergia" value={`${synergy}%`} detail="integração da comissão" icon={Sparkles} tone="info" />
          ) : null}
          {Number.isFinite(moral) ? (
            <StatCard label="Moral" value={`${moral}%`} detail="clima do grupo" icon={HeartPulse} tone={moral >= 60 ? 'success' : 'warning'} />
          ) : null}
          {plan ? (
            <StatCard label="Plano proposto" value={plan.title} detail={planDetail} icon={CalendarCheck} tone="brand" />
          ) : null}
        </div>
      ) : null}

      {recommendations.length ? (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Recomendações</p>
          <ul className="space-y-1.5">
            {recommendations.map((item, index) => (
              <li key={index} className="flex gap-2 text-sm">
                <span className="text-primary">•</span>
                <span>
                  <span className="font-bold text-foreground">{item.title}</span>
                  {item.body ? <span className="text-muted-foreground"> — {item.body}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {alternatives.length ? (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Alternativas</p>
          <ul className="space-y-1.5">
            {alternatives.map((item, index) => (
              <li key={index} className="flex gap-2 text-xs text-muted-foreground">
                <span>•</span>
                <span>{item.body ? `${item.title} — ${item.body}` : item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Playthrough 5.14 (continuação), Partes H/I/J/K — o relatório já
          carregava `cta_id`/`cta_label` no metadata, mas não renderizava
          botão nenhum: o jogador lia "recomendamos X" e não tinha como agir
          dali. O botão apenas DELEGA para o handler da página, que reusa o
          fluxo canônico (TournamentRegistrationModal / navegação para a
          chave) — este componente nunca cria inscrição por conta própria. */}
      {ctaLabel && metadata.recommended_tournament_id ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => onAction?.({
              id: metadata.cta_id || 'view_tournament',
              tournamentId: metadata.recommended_tournament_id,
              tournamentName: metadata.recommended_tournament_name || null,
            })}
          >
            {ctaLabel}
          </Button>
          {metadata.deadline && metadata.cta_id === 'register' ? (
            <span className="text-[11px] text-muted-foreground">Inscrição até {metadata.deadline}</span>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}
