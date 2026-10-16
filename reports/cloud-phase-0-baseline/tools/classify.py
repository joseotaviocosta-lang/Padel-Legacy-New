# CLOUD-0 — consolida run1 (paralelo), run2 (serial, só falhas) e a checagem
# em commits anteriores num results.json deduplicado + classification.json.
# Uso: python3 classify.py <scratch> <out_dir>
import json, os, sys
S, OUT = sys.argv[1], sys.argv[2]
norm = lambda t: os.path.basename(t)[:-4] if t.startswith('scripts/') and t.endswith('.mjs') else t
hist = json.load(open(f'{S}/hist.json'))
run1 = json.load(open(f'{S}/run1/results.json'))
run2 = {norm(r['test']): r for r in json.load(open(f'{S}/run2-serial/results.json'))['results']}
older = {}
for c in ('565437f', 'c5bf7c8', '742ee4a'):
    for r in json.load(open(f'{S}/hist-{c}/results.json'))['results']:
        older.setdefault(norm(r['test']), {})[c] = 'pass' if r['code'] == 0 else 'fail'

ENV_ART = 'Limitação cloud: lê artefatos de simulação só locais (reports/rebalance-527*/runs|micro|smoke|partner-dump, nunca versionados). Gates de lógica do mesmo teste passam.'
ENV_CHROME = 'Limitação cloud: puppeteer com Chrome fixo em C:/Program Files/Google/Chrome (caminho Windows).'
C = {
  # --- limitação do ambiente cloud
  **{t: ('env', ENV_ART) for t in ['test-final-commitment-triggers-separation-v527j', 'test-no-new-commitment-after-exit-v527j', 'test-no-overlapping-partnership-v527j', 'test-preexisting-commitment-preserved-v527j', 'test-settlement-after-exit-preserves-roster-v527j', 'test-normal-partner-strength-floor-v527g', 'test-normal-vs-optimizer-partner-choice-v527g', 'test-optimizer-no-stale-partner-v527i', 'test-optimizer-partner-refresh-v527i', 'test-partner-quality-over-time-v527h', 'test-partnership-state-segmentation-v527h']},
  'test-mobile-rendered-complexity-v520c': ('env', ENV_CHROME),
  'test-live-match-landscape-contract-v520d': ('env', ENV_CHROME + ' No Windows (5.31) também falhava, por asserção de viewport.'),
  'test-live-match-mobile-contract-v520d': ('env', ENV_CHROME + ' No Windows (5.31) também falhava, por asserção de viewport.'),
  'test-career-pace-production': ('env', 'Simulação de ~4 anos (1460 dias): estourou 40 min no paralelo e foi interrompida aos 26 min no serial. No Windows (5.30-B) também não concluiu. Não executável no orçamento de tempo desta fase.'),
  # --- teste obsoleto / incompatível com o comportamento atual (verificado no código)
  'test-achievement-save-migration': ('obsolete', 'PASSA no 9001 (565437f) e FALHA desde o 9002 (c5bf7c8), que pôs PlayerAchievement em NEVER_SEED_WITH_DEMO_DATA de propósito (achado 4 do playtest). O teste usava essa linha de seed como fixture legada. Lacuna: a tolerância a linhas pré-Fase-12 ficou sem cobertura.'),
  'test-global-header-calendar-rc': ('obsolete', 'Exige advanceCareerDayOnce em src/pages/Training.jsx, que desde 0275b9c é um redirecionamento de 15 linhas sem atalho de dia.'),
  'test-tournament-guided-flow': ('obsolete', 'Espera /press?tab=interviews; buildInterviewRoute passou a gerar /world/circuit?tab=press no 9001 (565437f).'),
  'test-phase15-5-1-tournament-interview-consistency': ('obsolete', 'Gate 79 (regex /localGame/) casa um COMENTÁRIO em tournamentBracketView.js:358, adicionado no 565437f. Falso positivo; 78/79 gates passam.'),
  'test-mobile-persistence-m3-7': ('obsolete', 'deepEqual entre avanço não transacional e transacional difere só em save_version (457 vs 3), um contador de gravações que diverge por definição quando o caminho transacional faz 1 commit. Falha já no 9001. Provável obsoleto; confirmar com o autor.'),
  'test-global-overlays-audit': ('obsolete', "Lê src/components/career/CareerAssistant.jsx, que não existe mais. Mesma mensagem no Windows (5.30-B/5.31/5.31-B)."),
  **{t: ('obsolete', "Roda src/ com node puro e quebra ao resolver o alias '@/'. Mesma mensagem no Windows (5.30-B).") for t in ['test-living-career-v34-5', 'test-living-career-v34-7', 'test-living-career-v34-8']},
  # --- preexistente (mesma mensagem nos relatórios Windows; falha também no 9001 quando checado)
  **{t: ('preexisting', 'Mesma falha registrada no Windows. Asserção estática sobre markup/estrutura que mudou nos redesigns; candidata a teste obsoleto, sem bug de jogo evidente.') for t in ['test-home-redesign', 'test-premium-home-v33-2', 'test-premium-interfaces-v33', 'test-premium-relations-v33-8', 'test-redesign-polish2', 'test-redesign-polish21', 'test-ui-redesign', 'test-page-hierarchy', 'test-onboarding-priority', 'test-mobile-compact-ux-m4', 'test-mobile-filters-postmatch-m4-2-2', 'test-mobile-game-app-experience-m4-2', 'test-mobile-game-flow-m4-3', 'test-mobile-m3-1-device-hotfix', 'test-mobile-m3-2-android-ux', 'test-staff-architecture-v29-1', 'test-training-center-unification-phase15-5', 'test-ranking-ui-authority-v56', 'test-living-career-v34-4', 'test-living-career-v34-9', 'test-phase15-4-mobile-flow-polish', 'test-phase15-5-4-critical-mobile-qa']},
  'test-micro-gate-post-partner-tactics-v527g': ('preexisting', 'Lê o artefato versionado reports/rebalance-527g/micro-post-527g.json, que não atinge o gate (Easy 38,9% < 40; R1 33,3% < 35). Dado congelado da 5.27-G; preexistente na 5.31.'),
  'test-notification-system-audit-rc': ('preexisting', "TypeError lendo 'is_read' de undefined. Mesma falha no Windows nas 3 fases. Causa não investigada a fundo (pode ser fixture)."),
  'test-phase15-3-economy-progression-navigation': ('preexisting', '4/66 gates; mesma contagem no Windows (5.30-B/5.31).'),
  'test-phase15-6-1-tournament-draw-consistency': ('preexisting', 'D-7: espera nenhuma chave, mas há chave. Mesma falha no Windows (5.30-B). Provável efeito do sorteio D-3 unificado (d5e5a2e); confirmar.'),
  'test-phase15-6-2-tournament-canonical-state': ('preexisting', 'Mesma asserção no Windows (5.30-B): inscrição real deve suceder com a linha seed presente.'),
  'test-phase15-7-first-tournament-parity': ('preexisting', 'Espera 1º torneio em 30-45 dias, obtém 28 (Londres). Mesma falha no Windows (5.30-B). Provável efeito do calendário de elite rebalanceado; decisão de design.'),
  'test-phase15-6-app-performance-calendar-hardening': ('preexisting', 'Mesma falha no Windows (5.30-B).'),
  'test-former-partner-world-continuity-v518': ('preexisting', 'Mesma asserção no Windows (5.30-B/5.31): ex-parceiro pareado mas nunca volta a campo sorteado.'),
  'test-partner-athlete-ovr-scale-v512': ('preexisting', 'Gate G/2 é um "achado" documental (overallRating não é a autoridade de OVR). Mesma falha na 5.31.'),
  'test-partner-engine-ovr-authority-v526b': ('preexisting', 'Modificadores de contexto do motor (química/energia/coach/vínculo). Falhava na 5.31 (sem log). Causa não determinada; tocar só com autorização (motor).'),
  'test-phase15-5-1-critical-training-center': ('preexisting', 'WorldEvent com id duplicado ao processar o circuito. Mesma mensagem no Windows (5.31/5.31-B). Possível bug real de id não determinístico; investigar.'),
  # --- causa não determinada (sem histórico Windows conclusivo)
  'test-career-persistence-integrity': ('undetermined', 'Após torneio completo + reload, o tournament_run do torneio disputado não está presente. Falha já no 9001. No Windows (5.30-B) estava como preexistente, sem a linha de falha. Persistência: PRIORIDADE ALTA para investigar.'),
  'test-ranking-rolling-window-fase4': ('undetermined', '4C.1: na semana 52 o total do inativo já decaiu (espera âncora cheia). Falha já no 9001; sem histórico Windows. rankingWindow.js mudou no 565437f. Pode ser regra nova ou bug de borda de janela.'),
  'test-masters-draw-size-comparison-v517': ('undetermined', '2 duplas do Top20 sem partida no modelo 24. No Windows estourava 240 s (sem resultado); aqui conclui e falha. Provável efeito do calendário de elite reduzido (Masters 44->12).'),
}
groups = {}
for r in run1['results']:
    groups.setdefault(norm(r['test']), []).append(r)
results, cls = [], {}
for t, rs in sorted(groups.items()):
    ok = all(x['code'] == 0 for x in rs)
    r = rs[0]
    row = {'test': t, 'sources': sorted({s for x in rs for s in x['sources']}), 'run1': 'pass' if ok else ('timeout' if r['timedOut'] else 'fail'), 'seconds': r['seconds'], 'summary': r['summary']}
    if not ok:
        r2 = run2.get(t)
        row['run2_serial'] = None if not r2 else ('pass' if r2['code'] == 0 else 'fail')
        row['failLines'] = r['failLines'][:6]
        row['history_windows'] = hist.get(t)
        row['older_commits'] = older.get(t)
        cat, why = C.get(t, ('undetermined', 'sem triagem'))
        row['classification'] = cat; row['evidence'] = why
        cls.setdefault(cat, []).append(t)
    elif hist.get(t) and any(v != 'pass' for v in hist[t].values()):
        row['note'] = f'falhava no Windows {hist[t]}; aqui passa (o runner de fase cortava em 240 s ou o gate foi atualizado)'
    results.append(row)
summary = {'unique_tests': len(results), 'pass': sum(r['run1'] == 'pass' for r in results), 'fail': sum(r['run1'] != 'pass' for r in results), 'classification_counts': {k: len(v) for k, v in cls.items()}, 'new_confirmed_regressions': cls.get('regression', [])}
json.dump({'summary': summary, 'results': results}, open(f'{OUT}/results.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'summary': summary, 'by_class': cls}, open(f'{OUT}/classification.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False, indent=1)); print([t for t, v in C.items() if t not in groups])
