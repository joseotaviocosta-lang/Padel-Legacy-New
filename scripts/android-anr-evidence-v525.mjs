// Playthrough 5.25, Partes 4-6 — EVIDÊNCIA DE ANR já ocorrida no aparelho.
// Sem root: o Android guarda ANRs no DropBox (data_app_anr, com a stack da
// main thread no momento do bloqueio) e no buffer de eventos (am_anr).
// Uso: node scripts/android-anr-evidence-v525.mjs [label]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADB = process.env.ADB || 'C:/Android/sdk/platform-tools/adb.exe';
const PKG = 'com.padellegacy.game';
const OUT = resolve(`reports/android-anr-525/${process.argv[2] || 'evidence'}`);
mkdirSync(OUT, { recursive: true });
const adb = (...args) => { try { return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }); } catch (e) { return `ERRO: ${e.message}`; } };

const dropbox = adb('shell', 'dumpsys', 'dropbox', '--print', 'data_app_anr');
writeFileSync(resolve(OUT, 'dropbox-data_app_anr.txt'), dropbox);
const ours = dropbox.split(/(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} data_app_anr)/).filter((e) => e.includes(PKG));
console.log(`ANRs do ${PKG} no DropBox: ${ours.length}`);
for (const [i, entry] of ours.entries()) {
  writeFileSync(resolve(OUT, `anr-${i + 1}.txt`), entry);
  const head = entry.split('\n').slice(0, 12).join('\n');
  const subject = (entry.match(/Subject: (.*)/) || [])[1];
  // Stack da main thread ("main" prio=...) até a próxima thread.
  const main = (entry.match(/"main"[\s\S]*?(?=\n\n"|\n----- end)/) || [''])[0].split('\n').slice(0, 40).join('\n');
  console.log(`\n=== ANR #${i + 1}: ${subject || ''}\n${head}\n--- main thread ---\n${main}`);
}
writeFileSync(resolve(OUT, 'events-am_anr.txt'), adb('logcat', '-d', '-b', 'events', '-v', 'threadtime').split('\n').filter((l) => /am_anr|am_crash|am_proc_died|am_kill/.test(l) && l.includes(PKG)).join('\n'));
writeFileSync(resolve(OUT, 'logcat-crash.txt'), adb('logcat', '-d', '-b', 'crash', '-v', 'threadtime'));
writeFileSync(resolve(OUT, 'meminfo.txt'), adb('shell', 'dumpsys', 'meminfo', PKG));
writeFileSync(resolve(OUT, 'package.txt'), adb('shell', 'dumpsys', 'package', PKG));
console.log(`\n→ ${OUT}`);
