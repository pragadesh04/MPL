import { notFound } from 'next/navigation';
import { AllocationScreen } from '@/features/auction/allocation/allocation-screen';
import { isNotFound } from '@/features/auction/shared/auction-unavailable';
import { can } from '@/lib/permissions';
import { getSessionUserId } from '@/server/auth/session';
import { previewAllocation, type AllocationPreview } from '@/server/services/allocation/allocation';
import { requireRole } from '@/server/services/roles';

export const metadata = { title: 'Allocation' };
export const dynamic = 'force-dynamic';

/** `/t/[id]/allocation` — leftover allocation (PLAN §3.4, §7.10). Organisers; confirm needs owner / co-admin. */
export default async function AllocationPage({ params }: PageProps<'/t/[id]/allocation'>) {
  const { id } = await params;
  const userId = await getSessionUserId();
  let preview: AllocationPreview;
  let canConfirm: boolean;
  try {
    const access = await requireRole(userId, id, 'tournament:view-admin');
    canConfirm = can(access.roles, 'stage:advance');
    preview = await previewAllocation(userId, id);
  } catch (err) {
    if (isNotFound(err)) notFound();
    throw err;
  }
  return <AllocationScreen tournamentId={id} preview={preview} canConfirm={canConfirm} />;
}
