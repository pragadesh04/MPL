import type { CSSProperties } from 'react';

/**
 * Team colours are runtime data (stored lowercase `#rrggbb`), so they can't be Tailwind tokens.
 * Pass them through CSS variables and use the `bg-team` / `text-team` / `border-team` /
 * `text-on-team` utilities from globals.css. Always render the team name or short code next to
 * the colour (PLAN §7.13: colour is never the only signal).
 */
export function teamStyle(color: string): CSSProperties {
  return { '--team': color, '--team-foreground': readableTextOn(color) } as CSSProperties;
}

function channel(hex: string, i: number): number {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

/** WCAG contrast ratio between two `#rrggbb` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Near-black or white, whichever reads better on `hex`. */
export function readableTextOn(hex: string): string {
  return relativeLuminance(hex) > 0.4 ? '#111410' : '#ffffff';
}
