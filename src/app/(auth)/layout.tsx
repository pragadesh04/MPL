import { BrandLockup } from '@/components/brand/brand-mark';
import Link from 'next/link';

/** Auth pages (login, register, invites, resets): a centred, mobile-first column (§7.0). */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <Link href="/" aria-label="MPL home" className="flex justify-center">
        <BrandLockup size="lg" />
      </Link>
      {children}
    </main>
  );
}
