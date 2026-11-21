/**
 * Curated team colours (§7.4). These are DATA (stored on `teams.color` as lowercase hex and
 * rendered through the `--team` CSS variable), not theme tokens. All read well on the dark HUD
 * background and are spread out enough to tell apart on a projector.
 */
export const TEAM_PALETTE: readonly { name: string; hex: string }[] = [
  { name: 'Blood red', hex: '#e63946' },
  { name: 'Orange', hex: '#f77f00' },
  { name: 'Gold', hex: '#fcbf49' },
  { name: 'Lime', hex: '#a7e22e' },
  { name: 'Jungle', hex: '#2a9d4f' },
  { name: 'Teal', hex: '#1abc9c' },
  { name: 'Sky', hex: '#4cc9f0' },
  { name: 'Royal blue', hex: '#4361ee' },
  { name: 'Violet', hex: '#7b2ff7' },
  { name: 'Magenta', hex: '#d63384' },
  { name: 'Pink', hex: '#ff8fab' },
  { name: 'Sand', hex: '#e9c46a' },
  { name: 'Steel', hex: '#adb5bd' },
  { name: 'White', hex: '#f8f9fa' },
  { name: 'Brown', hex: '#b5651d' },
  { name: 'Mint', hex: '#80ffdb' },
];

/** "Red Rhinos" → "RR"/"RRH"; "Hawks" → "HAW". 2–4 letters, upper case. */
export function suggestShortName(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.slice(0, 3);
  const initials = words.map((w) => w[0]).join('');
  return initials.length >= 3 ? initials.slice(0, 3) : `${initials}${words.at(-1)!.slice(1, 2)}`;
}
