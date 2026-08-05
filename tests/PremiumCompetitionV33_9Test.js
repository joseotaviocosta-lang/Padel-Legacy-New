import fs from 'node:fs';
const checks=[['src/pages/Tournaments.jsx','PremiumPageHeader'],['src/pages/Matches.jsx','Preparação competitiva'],['src/pages/Achievements.jsx','Sala de conquistas'],['src/pages/History.jsx','Memória do esporte'],['src/pages/Legacy.jsx','Dinastia esportiva'],['src/components/design-system/PageHeader.jsx','pl-page-hero']];
for(const [file,needle] of checks){const text=fs.readFileSync(file,'utf8');if(!text.includes(needle))throw new Error(`${file}: não encontrou ${needle}`);}
console.log(`PremiumCompetitionV33_9Test: PASS (${checks.length}/${checks.length})`);
