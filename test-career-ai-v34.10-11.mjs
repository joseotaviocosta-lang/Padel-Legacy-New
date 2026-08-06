import fs from 'node:fs';
const required = [
  'src/lib/strategicCareerAI.js', 'src/lib/livingStaff.js',
  'src/components/career/StrategicCareerPanel.jsx', 'src/components/staff/StaffLivePanel.jsx',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Arquivo ausente: ${file}`);
const ai = fs.readFileSync('src/lib/strategicCareerAI.js','utf8');
const staff = fs.readFileSync('src/lib/livingStaff.js','utf8');
const hub = fs.readFileSync('src/pages/CareerHub.jsx','utf8');
const staffPage = fs.readFileSync('src/pages/Staff.jsx','utf8');
const checks = [
  [ai.includes('buildStrategicCareerState'), 'estado estratégico'],
  [ai.includes('buildStrategicWeeklyPlan'), 'plano semanal'],
  [staff.includes('ensureWeeklyStaffMeeting'), 'reunião persistente'],
  [staff.includes('deriveStaffMood'), 'humor da comissão'],
  [hub.includes('StrategicCareerPanel'), 'integração Home'],
  [staffPage.includes('StaffLivePanel'), 'integração Comissão'],
];
for (const [ok,label] of checks) if (!ok) throw new Error(`Falhou: ${label}`);
console.log(`CareerAIAndLivingStaffV34Test: PASS (${checks.length}/${checks.length})`);
