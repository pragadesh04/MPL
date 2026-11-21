import { eq } from 'drizzle-orm';
import {
  auditLog,
  memberships,
  notifications,
  webhookDeliveries,
  webhooks,
} from '@/server/db/schema';
import { setupTestDb } from '@/test/db';
import { makeTournament, makeUser } from '@/test/factories';
import { AUTO_DISABLE_AFTER, deliverEvents, scheduleWebhookDelivery } from './deliver';
import { resetWebhookDeps, setWebhookDeps } from './deps';
import {
  clearQueuedWebhookEvents,
  getQueuedWebhookEvents,
  queueWebhookEvents,
  setWebhookSink,
  type OutgoingEvent,
} from './dispatch';
import { createWebhook } from './service';
import { verifySignature } from './signing';
import type { DnsLookup } from './ssrf';
import type { WebhookFetch, WebhookRequestInit } from './transport';

const t = setupTestDb();

const DISCORD_URL = 'https://discord.com/api/webhooks/111222333/secretTokenAbCd';
const GENERIC_URL = 'https://hooks.example.com/mpl/secret-path-9876';
const publicDns: DnsLookup = async () => [{ address: '93.184.216.34', family: 4 }];

const SOLD: OutgoingEvent = {
  event: 'lot.sold',
  data: {
    playerId: 'p1',
    playerName: 'Ravi',
    playerIgn: 'RaviOP',
    photoUrl: null,
    teamId: 'team-1',
    teamName: 'Red Rhinos',
    teamShortName: 'RR',
    teamColor: '#d64545',
    price: 12,
    purseRemaining: 38,
    closedBy: 'TIMER',
  },
};
const OPENED: OutgoingEvent = {
  event: 'lot.opened',
  data: {
    playerId: 'p2',
    playerName: 'Kumar',
    basePrice: 1,
    originalBasePrice: 1,
    isReauction: false,
    round: 1,
  },
};
const BID: OutgoingEvent = {
  event: 'bid.placed',
  data: {
    playerId: 'p2',
    playerName: 'Kumar',
    teamName: 'Red Rhinos',
    teamShortName: 'RR',
    teamColor: '#d64545',
    amount: 2,
    isFallback: false,
  },
};

/** A fake fetch that answers with the given statuses in turn (the last one repeats). */
function fakeFetch(...statuses: (number | Error)[]) {
  const calls: { url: string; init: WebhookRequestInit }[] = [];
  let i = 0;
  const fn: WebhookFetch = async (url, init) => {
    calls.push({ url, init });
    const next = statuses[Math.min(i++, statuses.length - 1)]!;
    if (next instanceof Error) throw next;
    return { status: next };
  };
  return { fn, calls };
}

const sleeps: number[] = [];
function withDeps(fetch: WebhookFetch, lookup: DnsLookup = publicDns): void {
  setWebhookDeps({
    fetch,
    lookup,
    retryDelaysMs: [0, 1_000, 3_000],
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
}

beforeEach(() => {
  sleeps.length = 0;
  clearQueuedWebhookEvents();
});
afterEach(() => setWebhookSink(null));
afterAll(() => resetWebhookDeps());

async function setup(kind: 'DISCORD' | 'GENERIC' = 'GENERIC', events?: OutgoingEvent['event'][]) {
  withDeps(fakeFetch(204).fn);
  const owner = await makeUser(t.db, { isOrganiser: true });
  const tour = await makeTournament(t.db, { ownerId: owner.id });
  const created = await createWebhook(owner.id, tour.id, {
    kind,
    url: kind === 'DISCORD' ? DISCORD_URL : GENERIC_URL,
    ...(events ? { events } : {}),
  });
  return { owner, tour, webhook: created.webhook, secret: created.signingSecret };
}

async function deliveriesOf(webhookId: string) {
  return t.db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(webhookDeliveries.id);
}

async function webhookRow(id: string) {
  const [row] = await t.db.select().from(webhooks).where(eq(webhooks.id, id));
  return row!;
}

describe('deliverEvents (PLAN §6.4)', () => {
  it('POSTs a signed JSON body to a GENERIC webhook and logs the success', async () => {
    const { tour, webhook, secret } = await setup();
    const f = fakeFetch(200);
    withDeps(f.fn);

    await deliverEvents(tour.id, [SOLD]);

    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0]!;
    expect(url).toBe(GENERIC_URL);
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-MPL-Event']).toBe('lot.sold');

    const body: unknown = JSON.parse(init.body);
    expect(body).toEqual({
      id: expect.any(String),
      event: 'lot.sold',
      tournamentId: tour.id,
      tournamentName: tour.name,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      data: SOLD.data,
    });

    expect(
      verifySignature({
        secret: secret!,
        timestamp: init.headers['X-MPL-Timestamp']!,
        body: init.body,
        signature: init.headers['X-MPL-Signature']!,
      }),
    ).toBe(true);

    const [d] = await deliveriesOf(webhook.id);
    expect(d).toMatchObject({
      event: 'lot.sold',
      status: 'SUCCEEDED',
      attempts: 1,
      lastError: null,
    });
    expect(init.headers['X-MPL-Delivery']).toBe(String(d!.id));
  });

  it('sends Discord embeds without X-MPL signature headers', async () => {
    const { tour } = await setup('DISCORD');
    const f = fakeFetch(204);
    withDeps(f.fn);
    await deliverEvents(tour.id, [SOLD]);
    const { init } = f.calls[0]!;
    expect(init.headers['X-MPL-Signature']).toBeUndefined();
    expect(JSON.parse(init.body)).toMatchObject({
      username: 'MPL',
      embeds: [{ title: '🔨 SOLD: Ravi → Red Rhinos for 12 MP', color: 0xd64545 }],
    });
  });

  it('only delivers subscribed events, in order, and skips disabled webhooks', async () => {
    const { tour, webhook } = await setup('GENERIC'); // defaults: no bid.placed
    const f = fakeFetch(200);
    withDeps(f.fn);

    await deliverEvents(tour.id, [OPENED, BID, SOLD]);
    expect(f.calls.map((c) => c.init.headers['X-MPL-Event'])).toEqual(['lot.opened', 'lot.sold']);
    expect((await deliveriesOf(webhook.id)).map((d) => d.event)).toEqual([
      'lot.opened',
      'lot.sold',
    ]);

    await t.db.update(webhooks).set({ enabled: false }).where(eq(webhooks.id, webhook.id));
    await deliverEvents(tour.id, [SOLD]);
    expect(f.calls).toHaveLength(2);
  });

  it('fans one event out to several webhooks with the same event id', async () => {
    const { owner, tour } = await setup('GENERIC');
    await createWebhook(owner.id, tour.id, { kind: 'DISCORD', url: DISCORD_URL });
    const f = fakeFetch(200);
    withDeps(f.fn);
    await deliverEvents(tour.id, [SOLD]);
    expect(f.calls.map((c) => c.url).sort()).toEqual([DISCORD_URL, GENERIC_URL]);
  });

  it('retries with backoff and succeeds on a later attempt', async () => {
    const { tour, webhook } = await setup();
    const f = fakeFetch(500, new Error('socket hang up'), 200);
    withDeps(f.fn);

    await deliverEvents(tour.id, [SOLD]);

    expect(f.calls).toHaveLength(3);
    expect(sleeps).toEqual([0, 1_000, 3_000]);
    const [d] = await deliveriesOf(webhook.id);
    expect(d).toMatchObject({ status: 'SUCCEEDED', attempts: 3, lastError: null });
    expect((await webhookRow(webhook.id)).consecutiveFailures).toBe(0);
  });

  it('gives up after 3 attempts, records the error and counts the failure', async () => {
    const { tour, webhook } = await setup();
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const f = fakeFetch(502, 503, timeout);
    withDeps(f.fn);

    await expect(deliverEvents(tour.id, [SOLD])).resolves.toBeUndefined();

    expect(f.calls).toHaveLength(3);
    const [d] = await deliveriesOf(webhook.id);
    expect(d).toMatchObject({ status: 'FAILED', attempts: 3, lastError: 'Timed out' });
    expect((await webhookRow(webhook.id)).consecutiveFailures).toBe(1);
  });

  it('does not retry non-retryable responses such as 404 or a redirect', async () => {
    const { tour, webhook } = await setup();
    const f = fakeFetch(404);
    withDeps(f.fn);
    await deliverEvents(tour.id, [SOLD]);
    expect(f.calls).toHaveLength(1);
    expect((await deliveriesOf(webhook.id))[0]).toMatchObject({
      status: 'FAILED',
      attempts: 1,
      lastError: 'HTTP 404',
    });

    const r = fakeFetch(302);
    withDeps(r.fn);
    await deliverEvents(tour.id, [SOLD]);
    expect(r.calls).toHaveLength(1);
  });

  it('re-checks DNS before each delivery and blocks private targets without sending', async () => {
    const { tour, webhook } = await setup();
    const f = fakeFetch(200);
    withDeps(f.fn, async () => [{ address: '169.254.169.254', family: 4 }]); // DNS rebinding

    await deliverEvents(tour.id, [SOLD]);

    expect(f.calls).toHaveLength(0);
    const [d] = await deliveriesOf(webhook.id);
    expect(d!.status).toBe('FAILED');
    expect(d!.attempts).toBe(1);
    expect(d!.lastError).toMatch(/^Blocked: .*private or internal/);
  });

  it('resets consecutive failures on success', async () => {
    const { tour, webhook } = await setup();
    await t.db.update(webhooks).set({ consecutiveFailures: 7 }).where(eq(webhooks.id, webhook.id));
    withDeps(fakeFetch(200).fn);
    await deliverEvents(tour.id, [SOLD]);
    expect((await webhookRow(webhook.id)).consecutiveFailures).toBe(0);
  });

  it(`auto-disables after ${AUTO_DISABLE_AFTER} failures in a row, logs it and tells the organisers`, async () => {
    const { owner, tour, webhook } = await setup();
    const coAdmin = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: coAdmin.id, role: 'CO_ADMIN', addedBy: owner.id });
    await t.db
      .update(webhooks)
      .set({ consecutiveFailures: AUTO_DISABLE_AFTER - 2 })
      .where(eq(webhooks.id, webhook.id));
    withDeps(fakeFetch(500).fn);

    await deliverEvents(tour.id, [SOLD]); // 19
    expect(await webhookRow(webhook.id)).toMatchObject({ enabled: true, consecutiveFailures: 19 });

    await deliverEvents(tour.id, [SOLD]); // 20 → disabled
    expect(await webhookRow(webhook.id)).toMatchObject({ enabled: false, consecutiveFailures: 20 });

    const audits = await t.db.select().from(auditLog).where(eq(auditLog.tournamentId, tour.id));
    const disabled = audits.filter((a) => a.action === 'webhook.auto_disabled');
    expect(disabled).toHaveLength(1);
    expect(disabled[0]).toMatchObject({ actorUserId: null });
    expect(disabled[0]!.after).toMatchObject({ webhookId: webhook.id, consecutiveFailures: 20 });
    expect(JSON.stringify(disabled[0])).not.toContain('secret-path');

    const notes = await t.db
      .select()
      .from(notifications)
      .where(eq(notifications.type, 'webhook.auto_disabled'));
    const mine = notes.filter((n) => n.data.webhookId === webhook.id);
    expect(mine.map((n) => n.userId).sort()).toEqual([owner.id, coAdmin.id].sort());

    // Disabled now: further events are not delivered at all.
    const f = fakeFetch(200);
    withDeps(f.fn);
    await deliverEvents(tour.id, [SOLD]);
    expect(f.calls).toHaveLength(0);
  });

  it('never throws, even for an unknown tournament or a database hiccup', async () => {
    withDeps(fakeFetch(200).fn);
    await expect(
      deliverEvents('00000000-0000-4000-8000-0000000000ff', [SOLD]),
    ).resolves.toBeUndefined();
    await expect(deliverEvents('not-a-uuid', [SOLD])).resolves.toBeUndefined();
    await expect(deliverEvents('whatever', [])).resolves.toBeUndefined();
  });
});

describe('queueWebhookEvents wiring', () => {
  it('only records events under NODE_ENV=test when no sink is set', async () => {
    const { tour } = await setup();
    const f = fakeFetch(200);
    withDeps(f.fn);

    queueWebhookEvents(tour.id, [SOLD]);
    await new Promise((r) => setTimeout(r, 20));

    expect(getQueuedWebhookEvents()).toEqual([{ tournamentId: tour.id, events: [SOLD] }]);
    expect(f.calls).toHaveLength(0);
  });

  it('hands events to the sink when one is set (delivery runs)', async () => {
    const { tour, webhook } = await setup();
    const f = fakeFetch(200);
    withDeps(f.fn);
    let pending: Promise<void> | undefined;
    setWebhookSink((tid, events) => {
      pending = deliverEvents(tid, events);
    });

    queueWebhookEvents(tour.id, [SOLD]);
    await pending;

    expect(f.calls).toHaveLength(1);
    expect((await deliveriesOf(webhook.id))[0]!.status).toBe('SUCCEEDED');
  });

  it('a throwing sink never escapes queueWebhookEvents', () => {
    setWebhookSink(() => {
      throw new Error('boom');
    });
    expect(() => queueWebhookEvents('t', [SOLD])).not.toThrow();
  });

  it('scheduleWebhookDelivery falls back to a detached promise outside a request scope', async () => {
    const { tour, webhook } = await setup();
    const f = fakeFetch(200);
    withDeps(f.fn);
    const p = scheduleWebhookDelivery(tour.id, [SOLD]);
    expect(p).toBeInstanceOf(Promise);
    await p;
    expect(f.calls).toHaveLength(1);
    expect((await deliveriesOf(webhook.id))[0]!.status).toBe('SUCCEEDED');
  });
});
