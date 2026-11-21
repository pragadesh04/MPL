import Link from 'next/link';
import { JetpackSoldier } from '@/components/mascots/jetpack-soldier';

/** Auth pages (login, register, invites, resets): a centred, mobile-first column (§7.0). */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/" className="flex items-center justify-center gap-2">
        <JetpackSoldier pose="flying" className="size-12 text-lime" />
        <span className="font-display text-3xl tracking-wider text-lime">MPL</span>
      </Link>
      {children}
    </main>
  );
}
