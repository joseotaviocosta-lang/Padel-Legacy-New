import { attach } from './attach.mjs';
import { mobile } from './mob.mjs';
const { browser, page, state, shot, sleep, errors } = await attach();
const { tap, waitFor } = mobile(page, sleep, state, shot);
const vis = async () => page.evaluate(() => { const v = (e) => e.getClientRects().length > 0; return { url: location.pathname + location.search, dialogs: [...document.querySelectorAll('[role=dialog],[aria-modal=true]')].filter(v).map((d) => ({ text: d.innerText.replace(/\s+/g, ' ').slice(0, 250), buttons: [...d.querySelectorAll('button')].filter(v).map((b) => b.innerText.trim()).filter(Boolean) })) }; });
console.log('tap', await tap(/^Roma Pré-Temporada · Hoje$/, 8000));
console.log(JSON.stringify(await vis(), null, 1)); await shot('a15');
console.log('errors', JSON.stringify(errors));
browser.disconnect();
