import { and, eq } from 'drizzle-orm';
import { DEFAULT_WEBHOOK_EVENTS } from '@/lib/schemas/realtime';
import { decrypt } from '@/server/auth/crypto';
import { auditLog, memberships, webhookDeliveries, webhooks } from '@/server/db/schema';
import { toApiError } from '@/server/http';
import { setupTestDb } from '@/test/db';
import { makeLeader, makePlayer, makeTeam, makeTournament, makeUser } from '@/test/factories';
import { resetWebhookDeps, setWebhookDeps } from './deps';
import {
  createWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  listWebhooks,
  redeliverWebhookDelivery,
  sendTestWebhook,
  updateWebhook,
} from './service';
import type { DnsLookup } from './ssrf';
import type { WebhookFetch } from './transport';

const t = setupTestDb();
const KEY = process.env.APP_ENCRYPTION_KEY!;

const DISCORD_URL = 'https://discord.com/api/webhooks/111222333/secretTokenAbCd';
const GENERIC_URL = 'https://hooks.example.com/mpl/secret-path-9876';

const publicDns: DnsLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const fetchOk = vi.fn<WebhookFetch>(async () => ({ status: 204 }));

beforeEach(() => {
  fetchOk.mockClear();
  setWebhookDeps({ lookup: publicDns, fetch: fetchOk, sleep: async () => {} });
});
afterAll(() => resetWebhookDeps());

async function expectStatus(p: Promise<unknown>, status: number): Promise<void> {
  // Same mapping the routes use (AppError status, ZodError → 422).
  await expect(p).rejects.toSatisfy((e: unknown) => toApiError(e).status === status);
}

async function setup() {
  const owner = await makeUser(t.db, { isOrganiser: true });
  const tour = await makeTournament(t.db, { ownerId: owner.id });
  return { owner, tour };
}

describe('webhook management (PLAN §6.4)', () => {
  it('creates a Discord webhook with default events, encrypted, no secret', async () => {
    const { owner, tour } = await setup();
    const res = await createWebhook(owner.id, tour.id, { kind: 'DISCORD', url: DISCORD_URL });

    expect(res.signingSecret).toBeNull();
    expect(res.webhook).toMatchObject({
      kind: 'DISCORD',
      maskedUrl: 'discord.com/…AbCd',
      events: DEFAULT_WEBHOOK_EVENTS,
      enabled: true,
      consecutiveFailures: 0,
    });
    expect(res.webhook.events).not.toContain('bid.placed');

    const [row] = await t.db.select().from(webhooks).where(eq(webhooks.id, res.webhook.id));
    expect(row!.urlEncrypted).not.toContain('discord.com');
    expect(decrypt(row!.urlEncrypted, KEY)).toBe(DISCORD_URL);
    expect(row!.signingSecretEncrypted).toBeNull();
    expect(row!.createdBy).toBe(owner.id);
  });

  it('creates a GENERIC webhook and returns its signing secret once', async () => {
    const { owner, tour } = await setup();
    const res = await createWebhook(owner.id, tour.id, {
      kind: 'GENERIC',
      url: GENERIC_URL,
      events: ['lot.sold', 'bid.placed', 'lot.sold'],
    });
    expect(res.signingSecret).toMatch(/^whsec_/);
    expect(res.webhook.events).toEqual(['lot.sold', 'bid.placed']);

    const [row] = await t.db.select().from(webhooks).where(eq(webhooks.id, res.webhook.id));
    expect(row!.signingSecretEncrypted).not.toContain(res.signingSecret!);
    expect(decrypt(row!.signingSecretEncrypted!, KEY)).toBe(res.signingSecret);

    // The list never contains the URL or the secret.
    const list = await listWebhooks(owner.id, tour.id);
    const json = JSON.stringify(list);
    expect(list).toHaveLength(1);
    expect(list[0]!.maskedUrl).toBe('hooks.example.com/…9876');
    expect(json).not.toContain('secret-path');
    expect(json).not.toContain(res.signingSecret!);
    expect(json).not.toContain(row!.urlEncrypted);
  });

  it('rejects unsafe or wrong-kind URLs with 422', async () => {
    const { owner, tour } = await setup();
    await expectStatus(
      createWebhook(owner.id, tour.id, { kind: 'GENERIC', url: 'http://x.example.com/' }),
      422,
    );
    await expectStatus(
      createWebhook(owner.id, tour.id, { kind: 'GENERIC', url: 'https://x.example.com:8080/' }),
      422,
    );
    await expectStatus(
      createWebhook(owner.id, tour.id, { kind: 'GENERIC', url: 'https://a:b@x.example.com/' }),
      422,
    );
    await expectStatus(
      createWebhook(owner.id, tour.id, { kind: 'DISCORD', url: GENERIC_URL }),
      422,
    );
    await expectStatus(
      createWebhook(owner.id, tour.id, { kind: 'GENERIC', url: GENERIC_URL, events: [] }),
      422,
    );

    setWebhookDeps({ lookup: async () => [{ address: '10.0.0.8', family: 4 }], fetch: fetchOk });
    await expectStatus(
      createWebhook(owner.id, tour.id, { kind: 'GENERIC', url: GENERIC_URL }),
      422,
    );
    expect(await listWebhooks(owner.id, tour.id)).toHaveLength(0);
  });

  it('updates events, enabled and URL, resetting failures on re-enable', async () => {
    const { owner, tour } = await setup();
    const { webhook } = await createWebhook(owner.id, tour.id, {
      kind: 'GENERIC',
      url: GENERIC_URL,
    });

    const v1 = await updateWebhook(owner.id, tour.id, webhook.id, { events: ['lot.sold'] });
    expect(v1.events).toEqual(['lot.sold']);

    await t.db
      .update(webhooks)
      .set({ enabled: false, consecutiveFailures: 20 })
      .where(eq(webhooks.id, webhook.id));
    const v2 = await updateWebhook(owner.id, tour.id, webhook.id, { enabled: true });
    expect(v2).toMatchObject({ enabled: true, consecutiveFailures: 0 });

    const v3 = await updateWebhook(owner.id, tour.id, webhook.id, {
      url: 'https://other.example.com/new-hook-5555',
    });
    expect(v3.maskedUrl).toBe('other.example.com/…5555');
    const [row] = await t.db.select().from(webhooks).where(eq(webhooks.id, webhook.id));
    expect(decrypt(row!.urlEncrypted, KEY)).toBe('https://other.example.com/new-hook-5555');

    await expectStatus(updateWebhook(owner.id, tour.id, webhook.id, {}), 422);
    await expectStatus(
      updateWebhook(owner.id, tour.id, webhook.id, { url: 'https://localhost/' }),
      422,
    );
  });

  it('deletes a webhook', async () => {
    const { owner, tour } = await setup();
    const { webhook } = await createWebhook(owner.id, tour.id, {
      kind: 'DISCORD',
      url: DISCORD_URL,
    });
    await deleteWebhook(owner.id, tour.id, webhook.id);
    expect(await listWebhooks(owner.id, tour.id)).toEqual([]);
    await expectStatus(deleteWebhook(owner.id, tour.id, webhook.id), 404);
  });

  it('audit-logs create, update and delete without the URL or secret', async () => {
    const { owner, tour } = await setup();
    const { webhook, signingSecret } = await createWebhook(owner.id, tour.id, {
      kind: 'GENERIC',
      url: GENERIC_URL,
    });
    await updateWebhook(owner.id, tour.id, webhook.id, { enabled: false });
    await deleteWebhook(owner.id, tour.id, webhook.id);

    const rows = await t.db.select().from(auditLog).where(eq(auditLog.tournamentId, tour.id));
    expect(rows.map((r) => r.action)).toEqual([
      'webhook.created',
      'webhook.updated',
      'webhook.deleted',
    ]);
    expect(rows.every((r) => r.actorUserId === owner.id)).toBe(true);
    const json = JSON.stringify(rows);
    expect(json).not.toContain('secret-path');
    expect(json).not.toContain(signingSecret!);
    expect(rows[1]!.before).toMatchObject({ enabled: true });
    expect(rows[1]!.after).toMatchObject({ enabled: false });
  });

  it('lets a co-admin manage webhooks', async () => {
    const { owner, tour } = await setup();
    const coAdmin = await makeUser(t.db);
    await t.db
      .insert(memberships)
      .values({ tournamentId: tour.id, userId: coAdmin.id, role: 'CO_ADMIN', addedBy: owner.id });
    const { webhook } = await createWebhook(coAdmin.id, tour.id, {
      kind: 'DISCORD',
      url: DISCORD_URL,
    });
    expect((await listWebhooks(owner.id, tour.id)).map((w) => w.id)).toEqual([webhook.id]);
  });
});

describe('webhook tenant isolation and roles', () => {
  it('404s when an organiser of tournament A acts on tournament B', async () => {
    const a = await setup();
    const b = await setup();
    const { webhook } = await createWebhook(b.owner.id, b.tour.id, {
      kind: 'DISCORD',
      url: DISCORD_URL,
    });
    const [delivery] = await t.db
      .insert(webhookDeliveries)
      .values({ webhookId: webhook.id, event: 'lot.sold', payload: { id: 'x' } })
      .returning();

    // Org A on B's tournament: no role → 404 for everything.
    await expectStatus(listWebhooks(a.owner.id, b.tour.id), 404);
    await expectStatus(
      createWebhook(a.owner.id, b.tour.id, { kind: 'DISCORD', url: DISCORD_URL }),
      404,
    );
    await expectStatus(updateWebhook(a.owner.id, b.tour.id, webhook.id, { enabled: false }), 404);
    await expectStatus(deleteWebhook(a.owner.id, b.tour.id, webhook.id), 404);
    await expectStatus(listWebhookDeliveries(a.owner.id, b.tour.id, webhook.id), 404);
    await expectStatus(sendTestWebhook(a.owner.id, b.tour.id, webhook.id), 404);
    await expectStatus(
      redeliverWebhookDelivery(a.owner.id, b.tour.id, webhook.id, delivery!.id),
      404,
    );

    // Org A on their own tournament but B's webhook id: still 404.
    await expectStatus(updateWebhook(a.owner.id, a.tour.id, webhook.id, { enabled: false }), 404);
    await expectStatus(deleteWebhook(a.owner.id, a.tour.id, webhook.id), 404);
    await expectStatus(listWebhookDeliveries(a.owner.id, a.tour.id, webhook.id), 404);
    await expectStatus(sendTestWebhook(a.owner.id, a.tour.id, webhook.id), 404);
    await expectStatus(
      redeliverWebhookDelivery(a.owner.id, a.tour.id, webhook.id, delivery!.id),
      404,
    );

    // Nothing changed on B's side, and nothing was sent.
    const [row] = await t.db.select().from(webhooks).where(eq(webhooks.id, webhook.id));
    expect(row!.enabled).toBe(true);
    expect(fetchOk).not.toHaveBeenCalled();
  });

  it('404s for malformed ids, anonymous users and unknown tournaments', async () => {
    const { owner, tour } = await setup();
    await expectStatus(listWebhooks(null, tour.id), 404);
    await expectStatus(listWebhooks(owner.id, 'not-a-uuid'), 404);
    await expectStatus(updateWebhook(owner.id, tour.id, 'nope', { enabled: true }), 404);
    await expectStatus(deleteWebhook(owner.id, tour.id, 'nope'), 404);
    const { webhook } = await createWebhook(owner.id, tour.id, {
      kind: 'DISCORD',
      url: DISCORD_URL,
    });
    await expectStatus(redeliverWebhookDelivery(owner.id, tour.id, webhook.id, 'abc'), 404);
    await expectStatus(redeliverWebhookDelivery(owner.id, tour.id, webhook.id, 999999), 404);
  });

  it('403s for captains, soldiers and auctioneers of the same tournament', async () => {
    const { owner, tour } = await setup();
    const { webhook } = await createWebhook(owner.id, tour.id, {
      kind: 'DISCORD',
      url: DISCORD_URL,
    });

    const captainUser = await makeUser(t.db);
    const leader = await makeLeader(t.db, { tournamentId: tour.id, userId: captainUser.id });
    await makeTeam(t.db, { tournamentId: tour.id, leaderId: leader.id });
    const soldierUser = await makeUser(t.db);
    await makePlayer(t.db, { tournamentId: tour.id, userId: soldierUser.id });
    const auctioneer = await makeUser(t.db);
    await t.db.insert(memberships).values({
      tournamentId: tour.id,
      userId: auctioneer.id,
      role: 'AUCTIONEER',
      addedBy: owner.id,
    });

    for (const u of [captainUser, soldierUser, auctioneer]) {
      await expectStatus(listWebhooks(u.id, tour.id), 403);
      await expectStatus(createWebhook(u.id, tour.id, { kind: 'DISCORD', url: DISCORD_URL }), 403);
      await expectStatus(updateWebhook(u.id, tour.id, webhook.id, { enabled: false }), 403);
      await expectStatus(deleteWebhook(u.id, tour.id, webhook.id), 403);
      await expectStatus(sendTestWebhook(u.id, tour.id, webhook.id), 403);
    }
  });
});

describe('test event, delivery log and redeliver', () => {
  it('sends a sample lot.sold and logs it', async () => {
    const { owner, tour } = await setup();
    const { webhook } = await createWebhook(owner.id, tour.id, {
      kind: 'DISCORD',
      url: DISCORD_URL,
    });

    const delivery = await sendTestWebhook(owner.id, tour.id, webhook.id);
    expect(delivery).toMatchObject({
      event: 'lot.sold',
      status: 'SUCCEEDED',
      attempts: 1,
      lastError: null,
    });
    expect(fetchOk).toHaveBeenCalledTimes(1);
    const [url, init] = fetchOk.mock.calls[0]!;
    expect(url).toBe(DISCORD_URL);
    const body: unknown = JSON.parse(init.body);
    expect(body).toMatchObject({ embeds: [{ title: '🔨 SOLD: Ravi → Red Rhinos for 12 MP' }] });

    const log = await listWebhookDeliveries(owner.id, tour.id, webhook.id);
    expect(log.map((d) => d.id)).toEqual([delivery.id]);
    expect(log[0]!.payload).toMatchObject({ event: 'lot.sold', tournamentName: tour.name });
  });

  it('records a failed test send without counting it towards auto-disable', async () => {
    const { owner, tour } = await setup();
    const { webhook } = await createWebhook(owner.id, tour.id, {
      kind: 'GENERIC',
      url: GENERIC_URL,
    });
    setWebhookDeps({
      lookup: publicDns,
      fetch: async () => ({ status: 500 }),
      sleep: async () => {},
    });

    const delivery = await sendTestWebhook(owner.id, tour.id, webhook.id);
    expect(delivery).toMatchObject({ status: 'FAILED', attempts: 1, lastError: 'HTTP 500' });
    const [row] = await t.db.select().from(webhooks).where(eq(webhooks.id, webhook.id));
    expect(row!.consecutiveFailures).toBe(0);
  });

  it('redelivers the stored payload as a new delivery with the same event id', async () => {
    const { owner, tour } = await setup();
    const { webhook, signingSecret } = await createWebhook(owner.id, tour.id, {
      kind: 'GENERIC',
      url: GENERIC_URL,
    });
    setWebhookDeps({
      lookup: publicDns,
      fetch: async () => ({ status: 503 }),
      sleep: async () => {},
    });
    const failed = await sendTestWebhook(owner.id, tour.id, webhook.id);
    expect(failed.status).toBe('FAILED');

    setWebhookDeps({ lookup: publicDns, fetch: fetchOk, sleep: async () => {} });
    const again = await redeliverWebhookDelivery(owner.id, tour.id, webhook.id, String(failed.id));
    expect(again.id).not.toBe(failed.id);
    expect(again).toMatchObject({ status: 'SUCCEEDED', attempts: 1 });
    expect(again.payload).toEqual(failed.payload);

    const [, init] = fetchOk.mock.calls[0]!;
    expect(init.headers['X-MPL-Delivery']).toBe(String(again.id));
    expect(init.body).toBe(JSON.stringify(failed.payload));
    expect(signingSecret).toBeTruthy();

    const rows = await t.db
      .select()
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.webhookId, webhook.id)));
    expect(rows).toHaveLength(2);
  });
});
