import { BrandMark } from '@/components/brand/brand-mark';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Public landing page: brand mark, one line of what MPL does, sign-up and log-in (§7). */
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <BrandMark className="size-12 text-lime" />
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-[0.3em] text-muted uppercase">
          Mini Militia Premier League
        </p>
        <h1 className="font-display text-5xl tracking-wide sm:text-6xl">MPL</h1>
        <p className="mx-auto max-w-xl text-lg text-muted">
          Set up your tournament, auction your soldiers live on everyone&apos;s phones, then fight
          it out in groups and a knockout tree.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/register">Create account</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </main>
  );
}
