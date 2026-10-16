// Troca o JSX de retorno de TournamentCard (Tournaments.jsx) pelo arquivo dado.
const fs = require('fs');
const [file, cardFile] = process.argv.slice(2);
let s = fs.readFileSync(file, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const a = s.indexOf('  return (\n    <div className={`glass rounded-2xl p-4 border ${config.card}');
const b = s.indexOf('function Reward(');
if (a < 0 || b < 0) { console.error('markers', a, b); process.exit(1); }
s = s.slice(0, a) + fs.readFileSync(cardFile, 'utf8').replace(/\r\n/g, '\n') + '\n' + s.slice(b);
fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
