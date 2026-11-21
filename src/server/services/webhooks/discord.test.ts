import { WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/schemas/realtime';
import { formatDiscordMessage, hexToDiscordColor } from './discord';
import type { WebhookPayload } from './types';

function payload(event: WebhookEvent, data: Record<string, unknown>): WebhookPayload {
  return {
    id: 'evt-1',
    event,
    tournamentId: 't-1',
    tournamentName: 'MPL Season 3',
    createdAt: '2026-11-21T10:00:00.000Z',
    data,
  };
}

const team = {
  teamId: 'team-1',
  teamName: 'Red Rhinos',
  teamShortName: 'RR',
  teamColor: '#d64545',
};

const SAMPLE_DATA: Record<WebhookEvent, Record<string, unknown>> = {
  'lot.opened': {
    playerId: 'p1',
    playerName: 'Ravi',
    playerIgn: 'RaviOP',
    photoUrl: null,
    basePrice: 2,
    originalBasePrice: 4,
    isReauction: true,
    round: 2,
    endsAt: '2026-11-21T10:01:00.000Z',
  },
  'lot.sold': {
    playerId: 'p1',
    playerName: 'Ravi',
    playerIgn: 'RaviOP',
    photoUrl: 'https://cdn.example.com/ravi.png',
    ...team,
    price: 12,
    purseRemaining: 38,
    closedBy: 'TIMER',
  },
  'lot.unsold': {
    playerId: 'p1',
    playerName: 'Ravi',
    playerIgn: null,
    photoUrl: null,
    reason: 'NO_BIDS',
  },
  'bid.placed': { playerId: 'p1', playerName: 'Ravi', ...team, amount: 7, isFallback: true },
  'auction.started': { round: 1 },
  'auction.paused': { pausedRemainingMs: 41_500 },
  'auction.resumed': {},
  'auction.completed': { unsoldCount: 3 },
  'allocation.completed': {
    count: 2,
    steps: [
      { playerName: 'Kumar', ...team, reason: 'Fewest players: 3' },
      {
        playerName: 'Arun',
        teamName: 'Blue Bulls',
        teamShortName: 'BB',
        teamColor: '#2255ff',
        reason: 'Lowest MP left',
      },
    ],
  },
  'groups.drawn': { groupCount: 2, groups: [{ name: 'A' }, { name: 'B' }] },
  'match.result': { matchNumber: 7, winnerName: 'Red Rhinos', score: '3-1', winnerId: 'x' },
  'tournament.completed': { championName: 'Red Rhinos', championColor: '#d64545' },
};

describe('hexToDiscordColor', () => {
  it('converts #rrggbb to an integer', () => {
    expect(hexToDiscordColor('#d64545')).toBe(0xd64545);
    expect(hexToDiscordColor('FFFFFF')).toBe(0xffffff);
    expect(hexToDiscordColor('#000000')).toBe(0);
  });

  it('falls back for anything else', () => {
    expect(hexToDiscordColor('red', 7)).toBe(7);
    expect(hexToDiscordColor('#fff', 7)).toBe(7);
    expect(hexToDiscordColor(undefined, 7)).toBe(7);
  });
});

describe('formatDiscordMessage', () => {
  it('formats lot.sold in the team colour with photo, price and MP left', () => {
    const msg = formatDiscordMessage(payload('lot.sold', SAMPLE_DATA['lot.sold']));
    const [embed] = msg.embeds;
    expect(msg.username).toBe('MPL');
    expect(msg.allowed_mentions).toEqual({ parse: [] });
    expect(embed!.title).toBe('🔨 SOLD: Ravi → Red Rhinos for 12 MP');
    expect(embed!.color).toBe(0xd64545);
    expect(embed!.thumbnail).toEqual({ url: 'https://cdn.example.com/ravi.png' });
    expect(embed!.fields).toEqual([
      { name: 'Team', value: 'Red Rhinos (RR)', inline: true },
      { name: 'Price', value: '12 MP', inline: true },
      { name: 'MP left', value: '38 MP', inline: true },
    ]);
    expect(embed!.author).toEqual({ name: 'MPL Season 3' });
    expect(embed!.footer?.text).toBe('MPL · Closed by the timer');
    expect(embed!.timestamp).toBe('2026-11-21T10:00:00.000Z');
  });

  it('formats every webhook event, always naming the team when tinted by its colour', () => {
    for (const event of WEBHOOK_EVENTS) {
      const msg = formatDiscordMessage(payload(event, SAMPLE_DATA[event]));
      expect(msg.embeds).toHaveLength(1);
      const embed = msg.embeds[0]!;
      expect(embed.title.length).toBeGreaterThan(0);
      expect(Number.isInteger(embed.color)).toBe(true);
      const text = JSON.stringify(embed);
      if (embed.color === 0xd64545 && event !== 'tournament.completed') {
        expect(text).toContain('Red Rhinos');
      }
    }
  });

  it('shows the struck-through original price on re-auction lots', () => {
    const [embed] = formatDiscordMessage(payload('lot.opened', SAMPLE_DATA['lot.opened'])).embeds;
    expect(embed!.title).toBe('🎯 ON THE BLOCK: Ravi (RaviOP)');
    expect(embed!.fields?.[0]?.value).toBe('~~4 MP~~ → 2 MP');
    expect(embed!.thumbnail).toBeUndefined();
  });

  it('names the receiving team when an unsold soldier goes to a random squad', () => {
    const [plain] = formatDiscordMessage(payload('lot.unsold', SAMPLE_DATA['lot.unsold'])).embeds;
    expect(plain!.title).toBe('❌ UNSOLD: Ravi');
    expect(plain!.fields).toEqual([{ name: 'Reason', value: 'No bids', inline: true }]);
    const [random] = formatDiscordMessage(
      payload('lot.unsold', { ...SAMPLE_DATA['lot.unsold'], reason: 'RANDOM_SQUAD', ...team }),
    ).embeds;
    expect(random!.color).toBe(0xd64545);
    expect(random!.fields).toContainEqual({
      name: 'Sent to',
      value: 'Red Rhinos (RR)',
      inline: true,
    });
  });

  it('lists allocation steps with team names', () => {
    const [embed] = formatDiscordMessage(
      payload('allocation.completed', SAMPLE_DATA['allocation.completed']),
    ).embeds;
    expect(embed!.title).toBe('🎲 LEFTOVERS ALLOCATED: 2');
    expect(embed!.description).toBe(
      '• Kumar → Red Rhinos (RR) — Fewest players: 3\n• Arun → Blue Bulls (BB) — Lowest MP left',
    );
  });

  it('builds a generic embed from data for events without a bespoke layout', () => {
    const [embed] = formatDiscordMessage(
      payload('match.result', SAMPLE_DATA['match.result']),
    ).embeds;
    expect(embed!.title).toBe('⚔️ Match result');
    const names = embed!.fields?.map((f) => f.name);
    expect(names).toEqual(['Match number', 'Winner name', 'Score']); // ids are skipped
  });

  it('absolutises relative photo paths and ignores unsafe ones', () => {
    const rel = formatDiscordMessage(
      payload('lot.sold', { ...SAMPLE_DATA['lot.sold'], photoUrl: '/uploads/ravi.png' }),
      { appUrl: 'https://mpl.example.com' },
    );
    expect(rel.embeds[0]!.thumbnail).toEqual({ url: 'https://mpl.example.com/uploads/ravi.png' });
    const js = formatDiscordMessage(
      payload('lot.sold', { ...SAMPLE_DATA['lot.sold'], photoUrl: 'javascript:alert(1)' }),
    );
    expect(js.embeds[0]!.thumbnail).toBeUndefined();
  });

  it('neutralises @everyone and markdown in user-supplied names', () => {
    const [embed] = formatDiscordMessage(
      payload('lot.sold', { ...SAMPLE_DATA['lot.sold'], playerName: '@everyone *bold*' }),
    ).embeds;
    expect(embed!.title).not.toContain('@everyone');
    expect(embed!.title).toContain('\\*bold\\*');
  });

  it('respects Discord length limits', () => {
    const long = 'x'.repeat(5000);
    const [embed] = formatDiscordMessage(
      payload('lot.sold', { ...SAMPLE_DATA['lot.sold'], playerName: long }),
    ).embeds;
    expect(embed!.title.length).toBeLessThanOrEqual(256);
  });
});
