import { addWebhookFormSchema, deliveryViewSchema, webhookViewSchema } from './schemas';

describe('addWebhookFormSchema', () => {
  const discord = 'https://discord.com/api/webhooks/1/token';

  it('accepts a Discord URL for DISCORD and any https URL for GENERIC', () => {
    expect(
      addWebhookFormSchema.safeParse({ kind: 'DISCORD', url: discord, events: ['lot.sold'] })
        .success,
    ).toBe(true);
    expect(
      addWebhookFormSchema.safeParse({
        kind: 'GENERIC',
        url: 'https://hooks.example.com/x',
        events: ['lot.sold'],
      }).success,
    ).toBe(true);
  });

  it('rejects http, non-Discord URLs for DISCORD and empty event lists', () => {
    const bad = [
      { kind: 'GENERIC', url: 'http://hooks.example.com/x', events: ['lot.sold'] },
      { kind: 'DISCORD', url: 'https://hooks.example.com/x', events: ['lot.sold'] },
      { kind: 'DISCORD', url: discord, events: [] },
      { kind: 'GENERIC', url: '', events: ['lot.sold'] },
    ];
    for (const input of bad) expect(addWebhookFormSchema.safeParse(input).success).toBe(false);
  });
});

describe('response schemas', () => {
  it('parse what the routes return', () => {
    expect(
      webhookViewSchema.parse({
        id: 'w1',
        kind: 'GENERIC',
        maskedUrl: 'hooks.example.com/…1234',
        events: ['lot.sold'],
        enabled: true,
        consecutiveFailures: 0,
        createdAt: '2026-11-21T10:00:00.000Z',
      }).kind,
    ).toBe('GENERIC');
    expect(
      deliveryViewSchema.safeParse({
        id: 1,
        event: 'lot.sold',
        status: 'NOPE',
        attempts: 1,
        lastError: null,
        createdAt: 'x',
        payload: {},
      }).success,
    ).toBe(false);
  });
});
