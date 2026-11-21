import {
  assertSafeWebhookUrl,
  isBlockedAddress,
  maskWebhookUrl,
  parseWebhookUrl,
  UnsafeWebhookUrlError,
  type DnsLookup,
} from './ssrf';

const resolvesTo =
  (...addresses: string[]): DnsLookup =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

const DISCORD = 'https://discord.com/api/webhooks/123456789/abcDEF_ghi-JKL';

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1', // CGNAT
    '100.127.255.254',
    '127.0.0.1',
    '127.8.8.8',
    '169.254.169.254', // cloud metadata
    '169.254.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.192',
    '192.0.2.10',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd00:ec2::254', // AWS metadata IPv6
    'ff02::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe', // NAT64 of 169.254.169.254
    '64:ff9b::10.0.0.1',
    '2001:db8::1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '162.159.135.232', // discord.com
    '172.32.0.1', // just outside 172.16/12
    '100.128.0.1', // just outside CGNAT
    '2606:4700::6810:84e5',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
  ])('allows public %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('parseWebhookUrl', () => {
  const bad = (url: string, kind: 'DISCORD' | 'GENERIC' = 'GENERIC'): void => {
    expect(() => parseWebhookUrl(url, kind)).toThrow(UnsafeWebhookUrlError);
  };

  it('accepts https URLs on the default port, with or without :443', () => {
    expect(parseWebhookUrl('https://hooks.example.com/mpl', 'GENERIC').hostname).toBe(
      'hooks.example.com',
    );
    expect(parseWebhookUrl('https://hooks.example.com:443/mpl', 'GENERIC').port).toBe('');
  });

  it('rejects non-https schemes', () => {
    bad('http://hooks.example.com/mpl');
    bad('ftp://hooks.example.com/mpl');
    bad('file:///etc/passwd');
    bad('not a url');
  });

  it('rejects credentials in the URL', () => {
    bad('https://user:pass@hooks.example.com/mpl');
    bad('https://user@hooks.example.com/mpl');
  });

  it('rejects any port other than 443', () => {
    bad('https://hooks.example.com:8443/mpl');
    bad('https://hooks.example.com:80/mpl');
    bad('https://hooks.example.com:22/mpl');
  });

  it('rejects internal hostnames and private IP literals', () => {
    bad('https://localhost/mpl');
    bad('https://LOCALHOST./mpl');
    bad('https://metadata.google.internal/computeMetadata');
    bad('https://printer.local/');
    bad('https://127.0.0.1/');
    bad('https://2130706433/'); // decimal 127.0.0.1
    bad('https://0x7f.1/');
    bad('https://[::1]/');
    bad('https://[::ffff:169.254.169.254]/');
    bad('https://169.254.169.254/latest/meta-data');
  });

  it('only accepts Discord webhook URLs for DISCORD webhooks', () => {
    expect(parseWebhookUrl(DISCORD, 'DISCORD').hostname).toBe('discord.com');
    expect(parseWebhookUrl('https://discordapp.com/api/webhooks/1/token', 'DISCORD').hostname).toBe(
      'discordapp.com',
    );
    expect(parseWebhookUrl('https://discord.com/api/v10/webhooks/1/tok', 'DISCORD').pathname).toBe(
      '/api/v10/webhooks/1/tok',
    );
    bad('https://example.com/api/webhooks/1/token', 'DISCORD');
    bad('https://discord.com/channels/1/2', 'DISCORD');
    bad('https://discord.com.evil.example/api/webhooks/1/token', 'DISCORD');
    bad('http://discord.com/api/webhooks/1/token', 'DISCORD');
  });
});

describe('assertSafeWebhookUrl (DNS)', () => {
  it('accepts a host that resolves only to public addresses', async () => {
    const { addresses } = await assertSafeWebhookUrl(
      'https://hooks.example.com/x',
      'GENERIC',
      resolvesTo('93.184.216.34', '2606:2800:220:1::1'),
    );
    expect(addresses).toHaveLength(2);
  });

  it('rejects a host that resolves to a private, loopback or metadata address', async () => {
    for (const ip of ['10.0.0.5', '127.0.0.1', '169.254.169.254', 'fd12::1', '100.64.1.1']) {
      await expect(
        assertSafeWebhookUrl('https://sneaky.example.com/x', 'GENERIC', resolvesTo(ip)),
      ).rejects.toThrow(/private or internal/);
    }
  });

  it('rejects when any one of several addresses is private', async () => {
    await expect(
      assertSafeWebhookUrl(
        'https://mixed.example.com/x',
        'GENERIC',
        resolvesTo('93.184.216.34', '192.168.0.10'),
      ),
    ).rejects.toThrow(UnsafeWebhookUrlError);
  });

  it('rejects unresolvable hosts', async () => {
    const failing: DnsLookup = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(
      assertSafeWebhookUrl('https://nope.example.com/x', 'GENERIC', failing),
    ).rejects.toThrow(/resolve/);
    await expect(
      assertSafeWebhookUrl('https://empty.example.com/x', 'GENERIC', resolvesTo()),
    ).rejects.toThrow(/resolve/);
  });

  it('checks public IP literals without a DNS lookup', async () => {
    const lookup = vi.fn<DnsLookup>();
    await expect(
      assertSafeWebhookUrl('https://8.8.8.8/x', 'GENERIC', lookup),
    ).resolves.toMatchObject({ addresses: [{ address: '8.8.8.8', family: 4 }] });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('maskWebhookUrl', () => {
  it('shows only the host and the last 4 characters', () => {
    expect(maskWebhookUrl(DISCORD)).toBe('discord.com/…-JKL');
    expect(maskWebhookUrl('https://hooks.example.com/secret-path-1234')).toBe(
      'hooks.example.com/…1234',
    );
  });
});
