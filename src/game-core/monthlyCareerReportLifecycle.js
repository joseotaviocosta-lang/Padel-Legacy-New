import { localGame } from '@/api/localGameClient.js';
import {
  buildMonthlyCareerReport,
  createMonthlyCareerSnapshot,
  didCareerMonthChange,
  monthlyReportId,
  monthlyReportMonthKey,
} from '@/lib/monthlyCareerReportModel.js';

const REPORT_ENTITY = 'MonthlyCareerReport';

async function reportById(id) {
  return localGame.entities[REPORT_ENTITY].get(id).catch(() => null);
}

export async function ensureMonthlyReportCycle(profile) {
  if (!profile?.id || !profile?.career_date) return profile;
  const currentMonth = monthlyReportMonthKey(profile.career_date);
  if (profile.monthly_report_state?.periodKey === currentMonth && profile.monthly_report_state?.startSnapshot) return profile;
  return localGame.entities.PlayerProfile.update(profile.id, {
    monthly_report_state: {
      periodKey: currentMonth,
      startSnapshot: createMonthlyCareerSnapshot(profile),
      initializedDate: profile.career_date,
      source: profile.monthly_report_state ? 'reconciled' : 'career-cycle',
    },
  });
}

async function collectReportData(profileId) {
  const safe = (promise) => promise.catch(() => []);
  const [matches, trainings, transactions, pressArticles, achievements, missions, staff, contracts] = await Promise.all([
    safe(localGame.entities.Match.list('-date', 1500)),
    safe(localGame.entities.TrainingSession.filter({ profile_id: profileId }, '-date', 1500)),
    safe(localGame.entities.FinancialTransaction.filter({ profile_id: profileId }, '-date', 1500)),
    safe(localGame.entities.PressArticle.filter({ profile_id: profileId }, '-published_date', 1000)),
    safe(localGame.entities.PlayerAchievement.filter({ profile_id: profileId }, '-unlocked_date', 1000)),
    safe(localGame.entities.MissionProgress.filter({ profile_id: profileId }, '-completed_at', 1000)),
    safe(localGame.entities.PlayerStaffHire.filter({ profile_id: profileId }, null, 100)),
    safe(localGame.entities.PlayerContract.filter({ profile_id: profileId }, null, 200)),
  ]);
  return { matches, trainings, transactions, pressArticles, achievements, missions, staff, contracts };
}

async function createReportNotification(profile, report) {
  const id = `monthly-career-report-notification:${profile.id}:${report.periodKey}`;
  const existing = await localGame.entities.CareerMessage.get(id).catch(() => null);
  if (existing) return existing;
  const body = `${report.competition.wins} vitória(s), ${report.training.sessions} treino(s) e saldo mensal de ${report.finances.net.toLocaleString('pt-BR')} moedas. Abra o relatório completo para revisar sua evolução.`;
  return localGame.entities.CareerMessage.upsert(id, {
    profile_id: profile.id,
    sender_name: 'Equipe Padel Legacy',
    subject: `Relatório mensal · ${report.periodKey}`,
    body,
    title: `Relatório mensal · ${report.periodKey}`,
    content: body,
    status: 'nao_lida',
    is_read: false,
    is_new: true,
    message_type: 'monthly_career_report',
    notification_type: 'MONTHLY_REPORT',
    related_entity_type: REPORT_ENTITY,
    related_entity_id: report.id,
    career_date: profile.career_date,
    destination: { type: 'MONTHLY_REPORT', route: `/game/monthly-reports?report=${encodeURIComponent(report.id)}` },
    metadata: { report_id: report.id, period_key: report.periodKey, route: '/game/monthly-reports' },
  });
}

export async function finalizeClosedCareerMonth(previousProfile, currentProfile) {
  if (!previousProfile?.id || !currentProfile?.id || !didCareerMonthChange(previousProfile.career_date, currentProfile.career_date)) {
    return { profile: currentProfile, report: null, created: false };
  }
  const periodKey = monthlyReportMonthKey(previousProfile.career_date);
  const id = monthlyReportId(previousProfile.id, periodKey);
  let report = await reportById(id);
  let created = false;

  if (!report) {
    const startSnapshot = previousProfile.monthly_report_state?.periodKey === periodKey
      ? previousProfile.monthly_report_state.startSnapshot
      : createMonthlyCareerSnapshot(previousProfile);
    const endSnapshot = createMonthlyCareerSnapshot(previousProfile);
    const data = await collectReportData(previousProfile.id);
    const payload = buildMonthlyCareerReport({
      profile: previousProfile,
      periodKey,
      startSnapshot,
      endSnapshot,
      data,
      generatedDate: currentProfile.career_date,
    });
    report = await localGame.entities[REPORT_ENTITY].upsert(id, payload);
    created = true;
    await createReportNotification(currentProfile, report).catch((error) => console.warn('[Monthly Report] Notificação não criada:', error));
  }

  const nextMonth = monthlyReportMonthKey(currentProfile.career_date);
  const profile = await localGame.entities.PlayerProfile.update(currentProfile.id, {
    monthly_report_state: {
      periodKey: nextMonth,
      startSnapshot: createMonthlyCareerSnapshot(currentProfile),
      initializedDate: currentProfile.career_date,
      source: 'month-boundary',
    },
    last_monthly_report_id: report.id,
    last_monthly_report_period: report.periodKey,
    last_monthly_report_generated_date: currentProfile.career_date,
  });
  return { profile, report, created };
}

export async function listMonthlyCareerReports(profileId, limit = 120) {
  if (!profileId) return [];
  return localGame.entities[REPORT_ENTITY].filter({ profileId, status: 'finalized' }, '-periodKey', limit);
}

export async function getMonthlyCareerReport(reportId, profileId = null) {
  if (!reportId) return null;
  const report = await reportById(reportId);
  if (!report || (profileId && report.profileId !== profileId)) return null;
  return report;
}
