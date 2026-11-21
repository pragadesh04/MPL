import Link from 'next/link';
import { JetpackSoldier } from '@/components/mascots/jetpack-soldier';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';

/** Public landing page. Lanes link here; integration (I3) may polish it. */
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <JetpackSoldier pose="flying" className="size-36 text-lime" title="Jetpack soldier" />
      <div className="space-y-3">
        <StatusPill tone="lime">Mini Militia Premier League</StatusPill>
        <h1 className="font-display text-5xl tracking-wide sm:text-6xl">MPL</h1>
        <p className="mx-auto max-w-xl text-lg text-muted">
          Set up your tournament, auction your soldiers live on everyone&apos;s phones, then fight
          it out in groups and a knockout tree.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/register">Enlist</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Report for duty</Link>
        </Button>
      </div>
    </main>
  );
}
