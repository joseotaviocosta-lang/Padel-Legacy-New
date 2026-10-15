import { attach } from './tauri.mjs';
const { browser, page, errors, state, shot, sleep, clickText } = await attach();
const steps = [];
const dump = async (tag) => { const s = await state(700); steps.push({ tag, url: s.url, buttons: s.buttons.filter((b) => !/Expandir|Recolher|Ver detalhes|ANÁLISE|Inscrever|Legacy Finals|Crown|Elite|Masters|Circuit|Platinum|Gold|Silver|Bronze|Pré-Temporada|Todos|Futuros|Passados/.test(b)).slice(0, 25), text: s.text.slice(0, 300) }); };
console.log('preparar', await clickText('Preparar', { exact: true })); await sleep(2000); await dump('apos-preparar'); await shot('t9-prep');
console.log(JSON.stringify(steps, null, 1)); console.log('errors', JSON.stringify(errors));
browser.disconnect();
