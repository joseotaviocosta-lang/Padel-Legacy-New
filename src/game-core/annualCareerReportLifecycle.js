import { localGame } from '@/api/localGameClient.js';
import {
  annualReportId,
  annualReportYearKey,
  buildAnnualCareerReport,
  createAnnualCareerSnapshot,
  didCareerYearChange,
} from '@/lib/annualCareerReportModel.js';

const REPORT_ENTITY = 'AnnualCareerReport';

async function reportById(id) {
  return localGame.entities[REPORT_ENTITY].get(id).catch(() => null);
}

async function collectCircuitSnapshotData() {
  const safe = (promise) => promise.catch(() => []);
  const [athletes, teamRankings] = await Promise.all([
    safe(localGame.entities['AthleteProfile'].list('ranking_position', 500)),
    safe(localGame.entities['TeamRanking'].list('-ranking_points', 600)),
  ]);
  return { athletes, teamRankings };
}

export async function ensureAnnualReportCycle(profile) {
  if (!profile?.id || !profile?.career_date) return profile;
  const year = annualReportYearKey(profile.career_date);
  if (profile.annual_report_state?.year === year && profile.annual_report_state?.startSnapshot) return profile;
  const circuitData = await collectCircuitSnapshotData();
  return localGame.entities['PlayerProfile'].update(profile.id, {
    annual_report_state: {
      year,
      startSnapshot: createAnnualCareerSnapshot(profile, circuitData),
      initializedDate: profile.career_date,
      source: profile.annual_report_state ? 'reconciled' : 'career-cycle',
    },
  });
}

async function collectAnnualReportData(profileId) {
  const safe = (promise) => promise.catch(() => []);
  const [
    matches, trainings, transactions, pressArticles, achievements, missions,
    staff, contracts, partnerships, tournaments, monthlyReports, athletes, teamRankings,
  ] = await Promise.all([
    safe(localGame.entities['Match'].list('-date', 5000)),
    safe(localGame.entities['TrainingSession'].filter({ profile_id: profileId }, '-date', 5000)),
    safe(localGame.entities['FinancialTransaction'].filter({ profile_id: profileId }, '-month', 5000)),
    safe(localGame.entities['PressArticle'].filter({ profile_id: profileId }, '-published_date', 3000)),
    safe(localGame.entities['PlayerAchievement'].filter({ profile_id: profileId }, '-unlocked_date', 3000)),
    safe(localGame.entities['MissionProgress'].filter({ profile_id: profileId }, '-completed_at', 3000)),
    safe(localGame.entities['PlayerStaffHire'].filter({ profile_id: profileId }, null, 250)),
    safe(localGame.entities['PlayerContract'].filter({ profile_id: profileId }, null, 500)),
    safe(localGame.entities['Partnership'].filter({ profile_id: profileId }, '-started_career_date', 250)),
    safe(localGame.entities['Tournament'].list('-start_date', 3000)),
    safe(localGame.entities['MonthlyCareerReport'].filter({ profileId, status: 'finalized' }, '-periodKey', 240)),
    safe(localGame.entities['AthleteProfile'].list('ranking_position', 500)),
    safe(localGame.entities['TeamRanking'].list('-ranking_points', 600)),
  ]);
  return { matches, trainings, transactions, pressArticles, achievements, missions, staff, contracts, partnerships, tournaments, monthlyReports, athletes, teamRankings };
}

async function createAnnualReportNotification(profile, report) {
  const id = `annual-career-report-notification:${profile.id}:${report.year}`;
  const existing = await localGame.entities['CareerMessage'].get(id).catch(() => null);
  if (existing) return existing;
  // Polish editorial (docs/NOTIFICATION_EDITORIAL_POLISH.md): título sem
  // "disponível" burocrático.
  const body = `#${report.ranking.endPosition || '—'} no ranking, ${report.sportingResults.titles} título(s), ${report.sportingResults.wins} vitória(s) e ${Number(report.fans.gained || 0).toLocaleString('pt-BR')} novos fãs em ${report.year}.`;
  return localGame.entities['CareerMessage'].upsert(id, {
    profile_id: profile.id,
    sender_name: 'Equipe Padel Legacy',
    subject: `Resumo da temporada ${report.year}`,
    body,
    title: `Resumo da temporada ${report.year}`,
    content: body,
    status: 'nao_lida',
    is_read: false,
    is_new: true,
    message_type: 'annual_career_report',
    notification_type: 'ANNUAL_REPORT',
    related_entity_type: REPORT_ENTITY,
    related_entity_id: report.id,
    career_date: profile.career_date,
    destination: { type: 'ANNUAL_REPORT', route: `/game/annual-reports?report=${encodeURIComponent(report.id)}` },
    metadata: { report_id: report.id, year: report.year, route: '/game/annual-reports' },
  });
}

export async function finalizeClosedCareerYear(previousProfile, currentProfile) {
  if (!previousProfile?.id || !currentProfile?.id || !didCareerYearChange(previousProfile.career_date, currentProfile.career_date)) {
    return { profile: currentProfile, report: null, created: false, generationMs: 0 };
  }
  const startedAt = performance.now();
  const year = annualReportYearKey(previousProfile.career_date);
  const id = annualReportId(previousProfile.id, year);
  let report = await reportById(id);
  let created = false;

  if (!report) {
    const data = await collectAnnualReportData(previousProfile.id);
    const startSnapshot = previousProfile.annual_report_state?.year === year
      ? previousProfile.annual_report_state.startSnapshot
      : createAnnualCareerSnapshot(previousProfile, { athletes: data.athletes, teamRankings: data.teamRankings });
    const endSnapshot = createAnnualCareerSnapshot(previousProfile, { athletes: data.athletes, teamRankings: data.teamRankings });
    const previousReport = await reportById(annualReportId(previousProfile.id, year - 1));
    const payload = buildAnnualCareerReport({
      profile: previousProfile,
      year,
      yearStartSnapshot: startSnapshot,
      yearEndSnapshot: endSnapshot,
      data,
      generatedDate: currentProfile.career_date,
      previousReport,
    });
    report = await localGame.entities[REPORT_ENTITY].upsert(id, {
      ...payload,
      generation: { mode: 'single-pass-snapshot', durationMs: Math.round((performance.now() - startedAt) * 100) / 100 },
    });
    created = true;
    await createAnnualReportNotification(currentProfile, report).catch((error) => console.warn('[Annual Report] Notificação não criada:', error));
  }

  const nextCircuit = await collectCircuitSnapshotData();
  const nextYear = annualReportYearKey(currentProfile.career_date);
  const profile = await localGame.entities['PlayerProfile'].update(currentProfile.id, {
    annual_report_state: {
      year: nextYear,
      startSnapshot: createAnnualCareerSnapshot(currentProfile, nextCircuit),
      initializedDate: currentProfile.career_date,
      source: 'year-boundary',
    },
    last_annual_report_id: report.id,
    last_annual_report_year: report.year,
    last_annual_report_generated_date: currentProfile.career_date,
  });
  return { profile, report, created, generationMs: performance.now() - startedAt };
}

export async function listAnnualCareerReports(profileId, limit = 50) {
  if (!profileId) return [];
  return localGame.entities[REPORT_ENTITY].filter({ profileId, status: 'finalized' }, '-year', limit);
}

export async function getAnnualCareerReport(reportId, profileId = null) {
  if (!reportId) return null;
  const report = await reportById(reportId);
  if (!report || (profileId && report.profileId !== profileId)) return null;
  return report;
}
