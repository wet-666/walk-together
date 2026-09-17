import { generateUserSig } from './usersig';

describe('generateUserSig', () => {
  it('returns a url-safe compressed signature', () => {
    const result = generateUserSig(1400000000, 'secret-key', 'u1', 86400);
    expect(result.userSig.length).toBeGreaterThan(20);
    expect(result.userSig).not.toMatch(/[+/=]/);
    expect(Date.parse(result.expireAt)).toBeGreaterThan(Date.now());
  });
});
