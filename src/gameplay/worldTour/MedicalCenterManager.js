const STAFF = {
  physio_junior: { id:'physio_junior', role:'Fisioterapeuta', name:'Fisioterapeuta Júnior', cost:2500, salary:450, recoveryBonus:0.15, injuryReduction:0.08, diagnosis:0.55, relapseReduction:0.04 },
  physio_senior: { id:'physio_senior', role:'Fisioterapeuta', name:'Fisioterapeuta Sênior', cost:8500, salary:1200, recoveryBonus:0.32, injuryReduction:0.18, diagnosis:0.78, relapseReduction:0.12 },
  doctor_sports: { id:'doctor_sports', role:'Médico', name:'Médico do Esporte', cost:15000, salary:2200, recoveryBonus:0.22, injuryReduction:0.16, diagnosis:0.94, relapseReduction:0.22 },
};

const TREATMENTS = {
  basic_physio: { id:'basic_physio', label:'Fisioterapia básica', cost:350, energy:8, fatigue:12, daysReduction:0, relapseRisk:0.02, requiresInjury:false },
  intensive_rehab: { id:'intensive_rehab', label:'Reabilitação intensiva', cost:1200, energy:12, fatigue:18, daysReduction:1, relapseRisk:0.05, requiresInjury:true },
  early_clearance: { id:'early_clearance', label:'Avaliação para retorno antecipado', cost:1800, energy:5, fatigue:8, daysReduction:2, relapseRisk:0.16, requiresInjury:true },
};

function clamp(v,min,max){ return Math.max(min,Math.min(max,Number(v)||0)); }
export function getMedicalStaffCatalog(){ return Object.values(STAFF); }
export function getTreatmentCatalog(){ return Object.values(TREATMENTS); }
export function getHiredMedicalStaff(profile){
  const ids = Array.isArray(profile?.medical_staff_ids) ? profile.medical_staff_ids : [];
  return ids.map(id=>STAFF[id]).filter(Boolean);
}
export function getMedicalModifiers(profile){
  const staff = getHiredMedicalStaff(profile);
  return staff.reduce((acc,item)=>({
    recoveryBonus: acc.recoveryBonus + item.recoveryBonus,
    injuryReduction: acc.injuryReduction + item.injuryReduction,
    diagnosis: Math.max(acc.diagnosis,item.diagnosis),
    relapseReduction: acc.relapseReduction + item.relapseReduction,
    dailySalary: acc.dailySalary + Math.round(item.salary/30),
  }),{ recoveryBonus:0, injuryReduction:0, diagnosis:0.35, relapseReduction:0, dailySalary:0 });
}
export function canHireMedicalStaff(profile, staffId){
  const staff=STAFF[staffId];
  if(!staff) return {ok:false,reason:'Profissional inexistente.'};
  if(getHiredMedicalStaff(profile).some(x=>x.id===staffId)) return {ok:false,reason:'Profissional já contratado.'};
  if((Number(profile?.coins)||0)<staff.cost) return {ok:false,reason:'Moedas insuficientes.'};
  return {ok:true,staff};
}
export function buildHirePatch(profile, staffId){
  const check=canHireMedicalStaff(profile,staffId); if(!check.ok) throw new Error(check.reason);
  const ids=[...(Array.isArray(profile?.medical_staff_ids)?profile.medical_staff_ids:[]),staffId];
  return { medical_staff_ids:ids, coins:(Number(profile?.coins)||0)-check.staff.cost, medical_center_level:Math.min(3,ids.length), medical_staff_hired_at:new Date().toISOString() };
}
export function getDiagnosis(profile){
  const modifiers=getMedicalModifiers(profile);
  const injured=profile?.injury_status==='lesionado' && Number(profile?.injury_days_remaining)>0;
  if(!injured) return { injured:false, accuracy:modifiers.diagnosis, label:'Apto', details:'Sem lesão ativa.' };
  const precise=modifiers.diagnosis>=0.75;
  return { injured:true, accuracy:modifiers.diagnosis, label:precise?(profile.injury_type||'Lesão em recuperação'):'Desconforto em avaliação', severity:precise?profile.injury_severity:'indefinida', days:precise?Number(profile.injury_days_remaining):Math.max(1,Math.round(Number(profile.injury_days_remaining)*1.25)), details:precise?'Diagnóstico preciso da equipe médica.':'Estimativa provisória; contrate um médico para maior precisão.' };
}
export function canApplyTreatment(profile,treatmentId){
  const treatment=TREATMENTS[treatmentId]; if(!treatment) return {ok:false,reason:'Tratamento inexistente.'};
  if(treatment.requiresInjury && profile?.injury_status!=='lesionado') return {ok:false,reason:'Tratamento reservado para atletas lesionados.'};
  if((Number(profile?.coins)||0)<treatment.cost) return {ok:false,reason:'Moedas insuficientes.'};
  if(profile?.last_medical_treatment_date===profile?.career_date) return {ok:false,reason:'Já foi realizado um tratamento hoje.'};
  return {ok:true,treatment};
}
export function buildTreatmentPatch(profile,treatmentId){
  const check=canApplyTreatment(profile,treatmentId); if(!check.ok) throw new Error(check.reason);
  const t=check.treatment, modifiers=getMedicalModifiers(profile);
  const reduction=Math.max(0,Math.round(t.daysReduction*(1+modifiers.recoveryBonus)));
  const days=Math.max(0,(Number(profile?.injury_days_remaining)||0)-reduction);
  const released=profile?.injury_status==='lesionado' && days===0;
  const history=[...(Array.isArray(profile?.medical_treatment_history)?profile.medical_treatment_history:[]),{date:profile?.career_date,treatment_id:t.id,label:t.label,cost:t.cost,days_reduced:reduction}].slice(-30);
  return {
    coins:(Number(profile?.coins)||0)-t.cost,
    energy:clamp((Number(profile?.energy)||0)+t.energy,0,100),
    fatigue:clamp((Number(profile?.fatigue)||0)-t.fatigue,0,100),
    injury_days_remaining:days,
    injury_status:released?'apto':profile?.injury_status,
    injury_type:released?null:profile?.injury_type,
    injury_severity:released?null:profile?.injury_severity,
    last_medical_treatment_date:profile?.career_date,
    medical_treatment_history:history,
    early_return_relapse_risk:t.id==='early_clearance' && !released ? clamp(t.relapseRisk-modifiers.relapseReduction,0.02,0.3) : 0,
  };
}
export function getPreventionPlan(profile){
  const m=getMedicalModifiers(profile);
  const fatigue=Number(profile?.fatigue)||0, energy=Number(profile?.energy)||100;
  let recommendation='Carga normal';
  if(profile?.injury_status==='lesionado') recommendation='Reabilitação e repouso';
  else if(fatigue>=70||energy<35) recommendation='Descanso obrigatório';
  else if(fatigue>=45||energy<55) recommendation='Treino leve e fisioterapia';
  return { recommendation, injuryReduction:Math.round(m.injuryReduction*100), recoveryBonus:Math.round(m.recoveryBonus*100), diagnosisAccuracy:Math.round(m.diagnosis*100), relapseReduction:Math.round(m.relapseReduction*100) };
}
