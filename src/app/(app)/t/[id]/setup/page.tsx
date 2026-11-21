import { BasicsForm } from '@/features/identity/components/basics-form';
import { ReviewStep } from '@/features/identity/components/review-step';
import { RulesForm } from '@/features/identity/components/rules-form';
import { SetupShell, type SetupStep } from '@/features/identity/components/setup-shell';
import { orNotFound, requirePageUser } from '@/features/identity/server/page-access';
import { can } from '@/lib/permissions';
import { getSetupOverview } from '@/server/services/tournaments/setup';

export const metadata = { title: 'Setup' };

const STEPS = ['basics', 'rules', 'review'] as const;

/** Setup wizard steps 1, 2 and 5 (§7.2). Steps 3–4 live at /people and /teams. */
export default async function SetupPage({ params, searchParams }: PageProps<'/t/[id]/setup'>) {
  const { id } = await params;
  const raw = (await searchParams).step;
  const step: (typeof STEPS)[number] = STEPS.find((s) => s === raw) ?? 'basics';
  const userId = await requirePageUser(`/t/${id}/setup?step=${step}`);
  const overview = await orNotFound(() => getSetupOverview(userId, id));
  const { tournament, counts, readiness, totalPurse } = overview;
  const editable =
    can(tournament.roles, 'settings:edit') &&
    (tournament.status === 'DRAFT' || tournament.status === 'READY');

  const done: SetupStep[] = ['basics'];
  if (!readiness.checks.some((c) => !c.ok && c.fixStep === 'rules')) done.push('rules');
  if (!readiness.checks.some((c) => !c.ok && c.fixStep === 'people')) done.push('people');
  if (!readiness.checks.some((c) => !c.ok && c.fixStep === 'teams')) done.push('teams');
  if (readiness.ok) done.push('review');

  return (
    <SetupShell tournament={tournament} step={step} done={done}>
      {step === 'basics' ? (
        <BasicsForm
          tournamentId={id}
          initial={{ name: tournament.name, logoUrl: tournament.logoUrl }}
          disabled={!editable}
        />
      ) : step === 'rules' ? (
        <RulesForm
          tournamentId={id}
          initial={tournament.settings}
          disabled={!editable}
          counts={{
            captains: counts.captains,
            soldiers: counts.soldiers,
            pending: counts.pendingCaptains + counts.pendingSoldiers,
            totalPurse,
          }}
        />
      ) : (
        <ReviewStep
          tournament={tournament}
          readiness={readiness}
          counts={counts}
          totalPurse={totalPurse}
          canStart={can(tournament.roles, 'stage:advance')}
        />
      )}
    </SetupShell>
  );
}
