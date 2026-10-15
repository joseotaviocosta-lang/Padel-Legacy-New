import { resolve } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

const dir = resolve(process.cwd(), 'reports/screenshots-520d');
console.log('Target dir:', dir);
console.log('Exists?', existsSync(dir));
if (existsSync(dir)) {
  console.log('Files:', readdirSync(dir));
}
