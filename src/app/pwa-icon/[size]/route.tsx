import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';

/**
 * PNG app icons for the PWA manifest (192 and 512 px), drawn at request time so no binary assets
 * are committed. Colours are literal (an image can't use CSS tokens); they match the theme's
 * background and lime accent.
 */
const SIZES = new Set([192, 512]);

export async function GET(_req: Request, ctx: RouteContext<'/pwa-icon/[size]'>): Promise<Response> {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) notFound();
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#12160e',
        color: '#b8f13c',
        fontSize: size * 0.34,
        fontWeight: 800,
        letterSpacing: size * 0.01,
        border: `${Math.round(size * 0.04)}px solid #b8f13c`,
        borderRadius: size * 0.18,
      }}
    >
      MPL
    </div>,
    { width: size, height: size, headers: { 'cache-control': 'public, max-age=86400, immutable' } },
  );
}
