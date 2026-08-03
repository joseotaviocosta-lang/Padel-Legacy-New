import React, { useMemo, useState } from 'react';
import { Stethoscope, UserPlus, Sparkles, Shield, HeartPulse } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { getMedicalStaffCatalog, getHiredMedicalStaff, getTreatmentCatalog, buildHirePatch, buildTreatmentPatch, canHireMedicalStaff, canApplyTreatment, getDiagnosis, getPreventionPlan } from '@/gameplay/worldTour/MedicalCenterManager.js';
import { useToast } from '@/components/ui/use-toast';

export default function MedicalCenterPanel({ profile, onProfileUpdate }) {
  const [busy,setBusy]=useState(null); const {toast}=useToast();
  const hired=useMemo(()=>getHiredMedicalStaff(profile),[profile]);
  const diagnosis=useMemo(()=>getDiagnosis(profile),[profile]);
  const plan=useMemo(()=>getPreventionPlan(profile),[profile]);
  async function applyPatch(patch,title){
    setBusy(title); try{ const updated=await localGame.entities.PlayerProfile.update(profile.id,patch); onProfileUpdate?.(updated); toast({title,description:'Alteração salva na carreira.'}); }
    catch(e){toast({title:'Não foi possível',description:e.message||'Erro médico.',variant:'destructive'});} finally{setBusy(null);}
  }
  return <div className="glass rounded-2xl p-4 border border-cyan-500/20 space-y-4">
    <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center"><Stethoscope className="h-5 w-5 text-cyan-400"/></div><div><p className="text-sm font-semibold">Centro Médico</p><p className="text-xs text-muted-foreground">Equipe, diagnóstico, prevenção e tratamentos.</p></div></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
      <div className="rounded-xl bg-background/40 p-3"><p className="text-muted-foreground">Diagnóstico</p><p className="font-bold">{plan.diagnosisAccuracy}%</p></div>
      <div className="rounded-xl bg-background/40 p-3"><p className="text-muted-foreground">Recuperação</p><p className="font-bold text-emerald-400">+{plan.recoveryBonus}%</p></div>
      <div className="rounded-xl bg-background/40 p-3"><p className="text-muted-foreground">Prevenção</p><p className="font-bold text-cyan-400">-{plan.injuryReduction}%</p></div>
      <div className="rounded-xl bg-background/40 p-3"><p className="text-muted-foreground">Plano</p><p className="font-bold">{plan.recommendation}</p></div>
    </div>
    <div className="rounded-xl bg-background/40 p-3 text-xs"><p className="font-semibold flex items-center gap-2"><HeartPulse className="h-4 w-4 text-rose-400"/>{diagnosis.label}</p><p className="text-muted-foreground mt-1">{diagnosis.details}{diagnosis.injured?` Retorno estimado: ${diagnosis.days} dias.`:''}</p></div>
    <div><p className="text-xs font-bold uppercase tracking-wider mb-2">Equipe médica ({hired.length})</p><div className="grid md:grid-cols-3 gap-2">{getMedicalStaffCatalog().map(staff=>{const check=canHireMedicalStaff(profile,staff.id);const active=hired.some(x=>x.id===staff.id);return <button key={staff.id} disabled={active||!check.ok||busy} onClick={()=>applyPatch(buildHirePatch(profile,staff.id),`Contratado: ${staff.name}`)} className="text-left rounded-xl border border-border/50 p-3 disabled:opacity-50 hover:border-cyan-500/40"><p className="font-semibold text-xs flex gap-1"><UserPlus className="h-3.5 w-3.5"/>{staff.name}</p><p className="text-[10px] text-muted-foreground mt-1">Recuperação +{Math.round(staff.recoveryBonus*100)}% · Lesões -{Math.round(staff.injuryReduction*100)}%</p><p className="text-[10px] font-bold mt-2">{active?'Contratado':`${staff.cost.toLocaleString('pt-BR')} moedas`}</p></button>})}</div></div>
    <div><p className="text-xs font-bold uppercase tracking-wider mb-2">Tratamentos</p><div className="grid md:grid-cols-3 gap-2">{getTreatmentCatalog().map(t=>{const check=canApplyTreatment(profile,t.id);return <button key={t.id} disabled={!check.ok||busy} onClick={()=>applyPatch(buildTreatmentPatch(profile,t.id),t.label)} className="text-left rounded-xl border border-border/50 p-3 disabled:opacity-50 hover:border-emerald-500/40"><p className="font-semibold text-xs flex gap-1"><Sparkles className="h-3.5 w-3.5"/>{t.label}</p><p className="text-[10px] text-muted-foreground mt-1">+{t.energy} energia · -{t.fatigue} fadiga{t.daysReduction?` · até ${t.daysReduction} dias`:''}</p><p className="text-[10px] font-bold mt-2">{t.cost.toLocaleString('pt-BR')} moedas</p></button>})}</div></div>
    {Number(profile?.early_return_relapse_risk)>0&&<div className="flex gap-2 text-xs text-amber-300"><Shield className="h-4 w-4"/>Retorno antecipado ativo: risco de recaída de {Math.round(Number(profile.early_return_relapse_risk)*100)}%.</div>}
  </div>;
}
