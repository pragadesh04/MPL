import type { MyRequest } from '@/server/services/joining/requests';

/** Requests inbox (§2.3 C, §7.1). Filled in by A6. */
export function RequestsInbox({ requests }: { userId: string; requests: MyRequest[] }) {
  if (requests.length === 0) return null;
  return null;
}
