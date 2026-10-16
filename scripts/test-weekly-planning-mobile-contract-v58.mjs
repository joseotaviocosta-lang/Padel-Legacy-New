import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
// Fase 5.30 — os cartões de planejamento viraram LINHAS da agenda da Home.
// Mesmo contrato mobile: a linha encolhe sem overflow (min-w-0 + truncate),
// a ação cabe no celular (botão sm secundário, shrink-0) e cada item tem
// rótulo acessível próprio. O "sem overflow" é medido no app real em
// test-home-mobile-overflow-v530.mjs.
assert.ok(source.includes('className="flex min-w-0 items-center gap-3 px-3 py-2.5" aria-label={`Agenda: ${item.name}`}'), 'linhas da agenda precisam poder encolher e ter rótulo acessível');
assert.ok(source.includes('<p className="truncate text-xs font-bold">{item.name}'), 'nome do torneio trunca em vez de estourar');
assert.ok(/level="secondary" size="sm" onClick=\{\(\) => onRegister\?\.\(item\.id\)\} className="shrink-0/.test(source), 'CTA de inscrição compacto e secundário na linha');
console.log('test-weekly-planning-mobile-contract-v58: PASS');
