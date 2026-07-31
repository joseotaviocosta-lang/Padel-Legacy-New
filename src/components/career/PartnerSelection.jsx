import React, { useState } from 'react';
import { X, Users, Lock, Check } from 'lucide-react';
import { getAvailablePartners, getLockedPartners, canChangePartner, daysUntilPartnerUnlock } from '@/lib/career';
import { formPartnerContract, getSuggestedPartnerTerms } from '@/game-core';
import { overallRating } from '@/lib/padel';
import PlayStyleSummary from '@/components/career/PlayStyleSummary';
import { useToast } from '@/components/ui/use-toast';

const TIER_COLORS = {
  'Iniciante': 'bg-slate-500/15 text-slate-300',
  'Amador': 'bg-green-500/15 text-green-300',
  'Competitivo': 'bg-cyan-500/15 text-cyan-300',
  'Avançado': 'bg-blue-500/15 text-blue-300',
  'Elite': 'bg-purple-500/15 text-purple-300',
  'Lenda': 'bg-amber-500/15 text-amber-300',
};

export default function PartnerSelection({ profile, onClose, onPartnerSelected }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const canChange = canChangePartner(profile);
  const daysLocked = daysUntilPartnerUnlock(profile);
  const available = getAvailablePartners(profile).sort((a, b) => overallRating(a) - overallRating(b));
  const locked = getLockedPartners(profile).sort((a, b) => overallRating(b) - overallRating(a)).slice(0, 6);
  const currentPartnerId = profile?.partner_id;
  const { toast } = useToast();

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    try {
      const terms = getSuggestedPartnerTerms(profile, selected);
      const result = await formPartnerContract(profile, selected, terms);
      onPartnerSelected?.(result.profile);
      toast({ title: 'Contrato confirmado!', description: `${selected.name} é sua dupla por ${terms.durationDays} dias.` });
      onClose?.();
    } catch (e) {
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div className="glass rounded-t-3xl md:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Escolha sua Dupla
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!canChange && (
          <div className="glass rounded-xl p-3 border border-amber-500/30 bg-amber-500/5 flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Sua dupla atual está travada por mais <span className="text-amber-400 font-bold">{daysLocked} dias</span>. Você poderá trocar após esse período.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground mb-3">
          {canChange
            ? 'Parceiros do seu nível disponíveis. Suba de nível para desbloquear jogadores de elite!'
            : 'Veja as duplas disponíveis:'}
        </p>

        {/* Available partners */}
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {available.length === 0 && (
            <div className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/5 text-center">
              <p className="text-sm font-bold text-amber-300">Nenhum parceiro foi carregado.</p>
              <p className="text-xs text-muted-foreground mt-1">Recarregue a página. O modo local deve oferecer jogadores iniciantes automaticamente.</p>
            </div>
          )}
          {available.map(bot => (
            <button
              key={bot.id}
              onClick={() => canChange && setSelected(bot)}
              disabled={!canChange}
              className={`w-full glass rounded-xl p-3 flex items-center gap-3 transition-all border ${
                selected?.id === bot.id ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'
              } ${!canChange ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary/40'} ${currentPartnerId === bot.id ? 'border-primary/40' : ''}`}
            >
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <span className="font-black text-primary">{(bot.name || 'P')[0]}</span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm truncate">{bot.name}</p>
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${TIER_COLORS[bot.level] || TIER_COLORS['Iniciante']}`}>
                    {bot.level}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-1">OVR {overallRating(bot)}</p>
                <PlayStyleSummary profile={bot} compact />
              </div>
              {currentPartnerId === bot.id && (
                <span className="text-[9px] font-bold text-primary uppercase">Atual</span>
              )}
              {selected?.id === bot.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Locked partners (aspirational) */}
        {canChange && locked.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Desbloqueie ao evoluir
            </p>
            <div className="space-y-2">
              {locked.map(bot => (
                <div key={bot.id} className="glass rounded-xl p-3 flex items-center gap-3 opacity-40">
                  <div className="h-10 w-10 rounded-xl bg-secondary/40 flex items-center justify-center shrink-0">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{bot.name}</p>
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${TIER_COLORS[bot.level] || TIER_COLORS['Iniciante']}`}>
                        {bot.level}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">OVR {overallRating(bot)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {canChange && (
          <button
            onClick={confirm}
            disabled={!selected || saving}
            className="w-full mt-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? 'Salvando...' : selected ? <>Confirmar {selected.name}</> : 'Selecione um parceiro'}
          </button>
        )}
      </div>
    </div>
  );
}