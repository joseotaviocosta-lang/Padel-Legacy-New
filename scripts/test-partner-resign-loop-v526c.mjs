// Playthrough 5.26-C, Bloco D — laço de re-contratação diária do mesmo parceiro.
// Causa (medida na 5.26: até 123 re-contratações): o atleta materializado de
// um template do catálogo se aposenta → processPartnerDay encerra a dupla →
// a busca oferece o MESMO template → startPartnership reaproveita a linha
// aposentada → encerrada de novo no dia seguinte.
// Esta suíte cobre a regra (startPartnership, busca, candidatos reais) e roda
// a reprodução de 30 dias (scripts/repro-partner-retired-loop-v526c.mjs).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';
import * as act from './lib/v526Actions.mjs';

const { check, finish } = makeSuite('test-partner-resign-loop-v526c');
const work = mkdtempSync(join(tmpdir(), 'pl526c-resign-'));
const { rt, profile: p0 } = await bootCareer('partner-resign-526c');
try {
  const A = await act.loadActionModules(rt);
  const E = rt.localGame.entities;
  await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Teste' });
  const fresh = () => E.PlayerProfile.get(p0.id);
  await act.ensurePartner(rt, A, await fresh(), (rows) => rows[0]);
  const catalog = A.career.getAvailablePartners(await fresh());
  const [retiredBot, otherBot] = catalog.slice(-2);
  // Materializa e aposenta (mesmo patch de evolveAthleteCareerMonth).
  const materialized = await A.partnerAthlete.materializePartnerAthlete(retiredBot, { careerDate: (await fresh()).career_date });
  await E.AthleteProfile.update(materialized.id, { retired: true, career_status: 'aposentado', market_status: 'aposentado' });

  await check('isRetiredAthlete: retired, career_status e status', () => {
    assert.equal(A.partnerAthlete.isRetiredAthlete({ retired: true }), true);
    assert.equal(A.partnerAthlete.isRetiredAthlete({ career_status: 'aposentado' }), true);
    assert.equal(A.partnerAthlete.isRetiredAthlete({ status: 'retired' }), true);
    assert.equal(A.partnerAthlete.isRetiredAthlete({ career_status: 'ativo' }), false);
    assert.equal(A.partnerAthlete.isRetiredAthlete(null), false);
  });

  await check('startPartnership recusa template aposentado e NÃO encerra a dupla atual', async () => {
    const before = await A.partnership.getActivePartnership(p0.id);
    assert.ok(before, 'pré-condição: dupla ativa');
    await assert.rejects(() => A.partnership.startPartnership(fresh(), retiredBot, 60, 50).then(async (r) => r), /encerrou a carreira/);
    const after = await A.partnership.getActivePartnership(p0.id);
    assert.equal(after?.id, before.id);
  });

  await check('startPartnership com template ativo continua funcionando', async () => {
    const res = await A.partnership.startPartnership(await fresh(), otherBot, 60, 50);
    assert.equal(res.partnership.status, 'ativa');
  });

  await check('busca (catálogo) exclui o template aposentado e mantém os demais', async () => {
    const ids = await A.partnerAthlete.listRetiredPartnerOriginIds();
    assert.ok(ids.has(String(retiredBot.id)));
    const list = A.partnerAthlete.excludeRetiredPartnerTemplates(catalog, ids);
    assert.equal(list.some((b) => b.id === retiredBot.id), false);
    assert.equal(list.length, catalog.length - 1);
  });

  await check('candidatos reais da busca excluem aposentados', async () => {
    // No início do mundo nenhum real está livre: o cenário é montado (um real
    // livre aposentado com market_status ainda 'livre', outro livre ativo).
    const [real, active] = ((await E.AthleteProfile.filter({ is_real: true })) || []).slice(-2);
    assert.ok(real && active, 'pré-condição: dois atletas reais');
    await E.AthleteProfile.update(real.id, { market_status: 'livre', retired: true, career_status: 'aposentado' });
    await E.AthleteProfile.update(active.id, { market_status: 'livre' });
    const rows = await A.career.getRealPartnerCandidates(await fresh());
    assert.equal(rows.some((r) => r.id === real.id), false);
    assert.equal(rows.some((r) => r.id === active.id), true);
  });

  await check('reprodução de 30 dias: parceiro aposentado nunca é re-contratado', () => {
    const out = join(work, 'repro.json');
    const r = spawnSync(process.execPath, ['scripts/repro-partner-retired-loop-v526c.mjs'], { encoding: 'utf8', env: { ...process.env, RS_DAYS: '30', RS_OUT: out }, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(r.status, 0, r.stderr?.slice(-500));
    const { summary, days } = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(summary.retiredResigns, 0);
    assert.equal(summary.endedByRetirement, 1);
    assert.ok(summary.finalPartner && summary.finalPartner !== summary.retiredPartner);
    // Nenhum dia termina sem dupla depois da troca (a recusa não trava a busca).
    assert.equal(days.slice(1).filter((d) => !d.activeAfter).length, 0);
  });
} finally {
  await rt.close();
  rmSync(work, { recursive: true, force: true });
}
finish();
