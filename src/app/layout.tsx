import type { Metadata, Viewport } from 'next';
import { Oxanium, Rajdhani, Saira_Stencil } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import './globals.css';

// Stencil display font for headings and big numbers, Rajdhani-style body, Oxanium digits (§7).
const stencil = Saira_Stencil({ subsets: ['latin'], variable: '--font-stencil', display: 'swap' });
const body = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});
const digits = Oxanium({ subsets: ['latin'], variable: '--font-digits', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'MPL · Mini Militia Premier League', template: '%s · MPL' },
  description: 'Run Mini Militia tournaments: live player auction, squads, groups and knockout.',
  applicationName: 'MPL',
};

export const viewport: Viewport = {
  themeColor: '#12160e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={cn(stencil.variable, body.variable, digits.variable, 'h-full')}>
      <body className="flex min-h-full flex-col font-sans text-base antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
