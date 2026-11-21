import { formatKey, generateKey, KEY_ALPHABET, KEY_LENGTH, normalizeKey } from './keys';

describe('generateKey', () => {
  it('builds a 6-character key from the unambiguous alphabet', () => {
    const values = [0, 0.2, 0.4, 0.6, 0.8, 0.999];
    let i = 0;
    const key = generateKey(() => values[i++ % values.length]!);
    expect(key).toHaveLength(KEY_LENGTH);
    expect([...key].every((c) => KEY_ALPHABET.includes(c))).toBe(true);
    expect(key[0]).toBe(KEY_ALPHABET[0]);
    expect(key[5]).toBe(KEY_ALPHABET[KEY_ALPHABET.length - 1]);
  });

  it('never indexes past the alphabet, even for random() === 1', () => {
    expect(generateKey(() => 1)).toBe(KEY_ALPHABET.at(-1)!.repeat(KEY_LENGTH));
  });

  it('never contains ambiguous characters', () => {
    for (let n = 0; n < 50; n++) expect(generateKey(Math.random)).not.toMatch(/[01OIL]/);
  });
});

describe('normalizeKey', () => {
  it.each([
    ['rv7-k2p', 'RV7K2P'],
    ['RV7K2P', 'RV7K2P'],
    ['  rv7 k2p ', 'RV7K2P'],
    ['#4k9qx7', '4K9QX7'],
    ['#4K9-QX7', '4K9QX7'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeKey(input)).toBe(expected);
  });

  it.each(['', 'RV7K2', 'RV7K2PX', 'RV7K0P', 'OOOOOO', 'rv7_k2p', '##RV7K2P'])(
    'rejects %j',
    (input) => {
      expect(normalizeKey(input)).toBeNull();
    },
  );
});

describe('formatKey', () => {
  it('formats organiser keys as XXX-XXX and Player IDs as #XXXXXX', () => {
    expect(formatKey('RV7K2P', 'ORGANISER_KEY')).toBe('RV7-K2P');
    expect(formatKey('4K9QX7', 'PLAYER_CODE')).toBe('#4K9QX7');
  });

  it('round-trips with normalizeKey', () => {
    const key = generateKey(Math.random);
    expect(normalizeKey(formatKey(key, 'ORGANISER_KEY'))).toBe(key);
    expect(normalizeKey(formatKey(key, 'PLAYER_CODE'))).toBe(key);
  });
});
