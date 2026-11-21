import 'server-only';
import type { WebhookEvent } from '@/lib/schemas/realtime';
import type { WebhookPayload } from './types';

/**
 * Discord embed formatter (PLAN §6.4). Turns a stored webhook payload into a Discord
 * "execute webhook" body. Pure: everything it needs is in `payload.data`, which the producers
 * fill with display-ready fields inside their transaction.
 *
 * Team colour is never the only identifier: whenever an embed is tinted with a team colour, the
 * team name (and short code when known) is in the text too.
 */

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: DiscordEmbedField[];
  thumbnail?: { url: string };
  author?: { name: string };
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordMessage {
  username: string;
  embeds: DiscordEmbed[];
  allowed_mentions: { parse: never[] };
}

export interface DiscordFormatOptions {
  /** Base URL used to absolutise relative photo paths (PUBLIC_APP_URL). */
  appUrl?: string;
}

/** Brand colours as Discord integers (embeds need a number, not a token). */
const COLOR = {
  lime: 0xb5f23d,
  amber: 0xf5a524,
  gold: 0xf2c94c,
  blood: 0xd64545,
  muted: 0x8a9178,
} as const;

const LIMITS = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, fields: 25 };

/** `#rrggbb` (or `rrggbb`) → Discord colour integer; `fallback` for anything else. */
export function hexToDiscordColor(hex: unknown, fallback: number = COLOR.lime): number {
  if (typeof hex !== 'string') return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m?.[1] ? parseInt(m[1], 16) : fallback;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Stop user-supplied names from pinging @everyone or breaking markdown. */
function clean(text: string): string {
  return text.replace(/@(everyone|here)/gi, '@​$1').replace(/([*_~`|>])/g, '\\$1');
}

function str(data: Record<string, unknown>, key: string): string | null {
  const v = data[key];
  if (typeof v === 'string' && v.trim() !== '') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function num(data: Record<string, unknown>, key: string): number | null {
  const v = data[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function bool(data: Record<string, unknown>, key: string): boolean {
  return data[key] === true;
}

function mp(n: number | null): string {
  return n === null ? '—' : `${n} MP`;
}

function teamLabel(data: Record<string, unknown>): string | null {
  const name = str(data, 'teamName');
  if (!name) return null;
  const short = str(data, 'teamShortName');
  return short ? `${clean(name)} (${clean(short)})` : clean(name);
}

function photo(
  data: Record<string, unknown>,
  opts: DiscordFormatOptions,
): { url: string } | undefined {
  const url = str(data, 'photoUrl');
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return { url };
  if (url.startsWith('/') && opts.appUrl) {
    try {
      return { url: new URL(url, opts.appUrl).toString() };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function playerName(data: Record<string, unknown>): string {
  const name = clean(str(data, 'playerName') ?? 'A soldier');
  const ign = str(data, 'playerIgn');
  return ign && ign !== str(data, 'playerName') ? `${name} (${clean(ign)})` : name;
}

const GENERIC_TITLES: Record<WebhookEvent, string> = {
  'lot.opened': '🎯 On the block',
  'lot.sold': '🔨 Sold',
  'lot.unsold': '❌ Unsold',
  'bid.placed': '💰 Bid placed',
  'auction.started': '🚨 Auction started',
  'auction.paused': '⏸️ Auction paused',
  'auction.resumed': '▶️ Auction resumed',
  'auction.completed': '🏁 Auction complete',
  'allocation.completed': '🎲 Leftovers allocated',
  'groups.drawn': '🗂️ Groups drawn',
  'match.result': '⚔️ Match result',
  'tournament.completed': '🏆 Tournament complete',
};

/** Human label for a camelCase / snake_case key: `unsoldCount` → `Unsold count`. */
function labelFor(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function displayValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : clean(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return `\`${JSON.stringify(v).replace(/`/g, "'")}\``;
  } catch {
    return null;
  }
}

/** Fallback for events without a bespoke layout: one field per non-id value. */
function genericFields(data: Record<string, unknown>): DiscordEmbedField[] {
  const fields: DiscordEmbedField[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (/id$/i.test(key) || /color$/i.test(key) || key === 'photoUrl') continue;
    const shown = displayValue(value);
    if (shown === null) continue;
    fields.push({
      name: truncate(labelFor(key), LIMITS.fieldName),
      value: truncate(shown, LIMITS.fieldValue),
      inline: shown.length <= 40,
    });
    if (fields.length >= 10) break;
  }
  return fields;
}

function buildEmbed(payload: WebhookPayload, opts: DiscordFormatOptions): DiscordEmbed {
  const d = payload.data;
  const team = teamLabel(d);
  const teamColor = hexToDiscordColor(d.teamColor, COLOR.lime);

  switch (payload.event) {
    case 'lot.opened': {
      const base = num(d, 'basePrice');
      const original = num(d, 'originalBasePrice');
      const reauction = bool(d, 'isReauction');
      const price =
        reauction && original !== null && original !== base
          ? `~~${mp(original)}~~ → ${mp(base)}`
          : mp(base);
      return {
        title: `🎯 ON THE BLOCK: ${playerName(d)}`,
        description: reauction ? 'Re-auction round' : undefined,
        color: reauction ? COLOR.amber : COLOR.lime,
        fields: [
          { name: 'Base price', value: price, inline: true },
          { name: 'Round', value: str(d, 'round') ?? '1', inline: true },
        ],
        thumbnail: photo(d, opts),
      };
    }
    case 'lot.sold': {
      const price = num(d, 'price');
      const closedBy = str(d, 'closedBy');
      return {
        title: `🔨 SOLD: ${clean(str(d, 'playerName') ?? 'A soldier')} → ${clean(str(d, 'teamName') ?? 'a team')} for ${mp(price)}`,
        color: teamColor,
        fields: [
          { name: 'Team', value: team ?? '—', inline: true },
          { name: 'Price', value: mp(price), inline: true },
          { name: 'MP left', value: mp(num(d, 'purseRemaining')), inline: true },
        ],
        thumbnail: photo(d, opts),
        footer:
          closedBy === 'ORGANISER'
            ? { text: 'Closed by the organiser' }
            : closedBy === 'TIMER'
              ? { text: 'Closed by the timer' }
              : undefined,
      };
    }
    case 'lot.unsold': {
      const reason = str(d, 'reason');
      const fields: DiscordEmbedField[] = [];
      if (reason) fields.push({ name: 'Reason', value: clean(labelFor(reason)), inline: true });
      if (team) fields.push({ name: 'Sent to', value: team, inline: true });
      return {
        title: `❌ UNSOLD: ${playerName(d)}`,
        color: team ? teamColor : COLOR.muted,
        fields,
        thumbnail: photo(d, opts),
      };
    }
    case 'bid.placed': {
      const amount = num(d, 'amount');
      return {
        title: `💰 ${clean(str(d, 'teamName') ?? 'A team')} bids ${mp(amount)} on ${clean(str(d, 'playerName') ?? 'a soldier')}`,
        color: teamColor,
        fields: [
          { name: 'Team', value: team ?? '—', inline: true },
          { name: 'Bid', value: mp(amount), inline: true },
        ],
        footer: bool(d, 'isFallback') ? { text: 'Entered by the auctioneer' } : undefined,
      };
    }
    case 'auction.started':
      return {
        title: '🚨 AUCTION STARTED',
        description: num(d, 'round') !== null ? `Round ${num(d, 'round')}` : undefined,
        color: COLOR.lime,
      };
    case 'auction.paused': {
      const ms = num(d, 'pausedRemainingMs');
      return {
        title: '⏸️ AUCTION PAUSED',
        description: ms !== null ? `${Math.ceil(ms / 1000)} s left on the clock` : undefined,
        color: COLOR.amber,
      };
    }
    case 'auction.resumed':
      return { title: '▶️ AUCTION RESUMED', color: COLOR.lime };
    case 'auction.completed': {
      const unsold = num(d, 'unsoldCount');
      return {
        title: '🏁 AUCTION COMPLETE',
        description:
          unsold === null
            ? undefined
            : unsold === 0
              ? 'Every soldier found a squad.'
              : `${unsold} soldier${unsold === 1 ? '' : 's'} unsold`,
        color: COLOR.gold,
      };
    }
    case 'allocation.completed': {
      const steps = Array.isArray(d.steps) ? d.steps : [];
      const lines: string[] = [];
      for (const step of steps) {
        if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
        const s = Object.fromEntries(Object.entries(step));
        const who = clean(str(s, 'playerName') ?? 'A soldier');
        const to = teamLabel(s) ?? 'a team';
        const why = str(s, 'reason');
        lines.push(`• ${who} → ${to}${why ? ` — ${clean(why)}` : ''}`);
      }
      const count = num(d, 'count') ?? lines.length;
      return {
        title: `🎲 LEFTOVERS ALLOCATED: ${count}`,
        description: lines.length ? truncate(lines.join('\n'), LIMITS.description) : undefined,
        color: COLOR.gold,
      };
    }
    default: {
      // groups.drawn, match.result, tournament.completed and anything added later.
      const fields = genericFields(d);
      return {
        title: GENERIC_TITLES[payload.event] ?? labelFor(String(payload.event)),
        color: d.teamColor !== undefined ? teamColor : COLOR.gold,
        fields: fields.length ? fields : undefined,
        thumbnail: photo(d, opts),
      };
    }
  }
}

/** The Discord webhook body for one stored payload. */
export function formatDiscordMessage(
  payload: WebhookPayload,
  opts: DiscordFormatOptions = {},
): DiscordMessage {
  const embed = buildEmbed(payload, opts);
  const out: DiscordEmbed = {
    ...embed,
    title: truncate(embed.title, LIMITS.title),
    author: { name: truncate(clean(payload.tournamentName), LIMITS.fieldName) },
    footer: {
      text: truncate(embed.footer ? `MPL · ${embed.footer.text}` : 'MPL', LIMITS.fieldName),
    },
    timestamp: payload.createdAt,
  };
  if (out.description === undefined) delete out.description;
  if (out.thumbnail === undefined) delete out.thumbnail;
  if (out.fields === undefined || out.fields.length === 0) delete out.fields;
  else out.fields = out.fields.slice(0, LIMITS.fields);
  return { username: 'MPL', embeds: [out], allowed_mentions: { parse: [] } };
}
