import { buildHirePatch, getMedicalModifiers, buildTreatmentPatch, getDiagnosis } from '../worldTour/MedicalCenterManager.js';
export function runWorldTourMedicalCenterTest(){
 const base={id:'test',coins:50000,energy:35,fatigue:75,career_date:'2026-08-01',injury_status:'lesionado',injury_type:'Entorse',injury_severity:'moderada',injury_days_remaining:7};
 const hired={...base,...buildHirePatch(base,'physio_senior')};
 const treated={...hired,...buildTreatmentPatch(hired,'intensive_rehab')};
 const modifiers=getMedicalModifiers(hired), diagnosis=getDiagnosis(hired);
 const result={ok:modifiers.recoveryBonus>0&&treated.injury_days_remaining<base.injury_days_remaining&&diagnosis.injured,modifiers,treated,diagnosis};
 console.log('[WorldTourMedicalCenterTest]',result); return result;
}
if(typeof window!=='undefined') window.PadelWorldTourMedicalCenterTest={run:runWorldTourMedicalCenterTest};
