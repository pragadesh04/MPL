import { JetpackSoldier } from '@/components/mascots/jetpack-soldier';
import { RetryButton } from '@/features/public/components/retry-button';

export const metadata = { title: 'Offline' };
// Static, so the service worker can cache it at install time.
export const dynamic = 'force-static';

/** Offline shell (PLAN §7.13): shown by the service worker when a page can't load. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <JetpackSoldier className="size-24 text-lime" />
      <h1 className="font-display text-4xl tracking-wide">Signal lost</h1>
      <p className="text-muted">
        You’re offline. Hold your position: as soon as the connection is back, the page reloads with
        the latest scores and bids.
      </p>
      <RetryButton />
    </main>
  );
}
