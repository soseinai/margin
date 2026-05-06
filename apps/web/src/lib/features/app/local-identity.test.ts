import { describe, expect, it } from 'vitest';
import { authorInitials, avatarStyle, normalizeLocalUserName } from './local-identity';

describe('local identity helpers', () => {
  it('normalizes a local user name', () => {
    expect(normalizeLocalUserName('  Ada   Lovelace  ')).toBe('Ada Lovelace');
    expect(normalizeLocalUserName('')).toBe('Me');
    expect(normalizeLocalUserName(null)).toBe('Me');
  });

  it('uses first and last words for initials', () => {
    expect(authorInitials('Ada Lovelace')).toBe('AL');
    expect(authorInitials('Grace Brewster Hopper')).toBe('GH');
    expect(authorInitials('aish')).toBe('A');
  });

  it('returns a deterministic avatar style for the same name', () => {
    expect(avatarStyle('Ada Lovelace')).toBe(avatarStyle('Ada Lovelace'));
    expect(avatarStyle('Ada Lovelace')).not.toBe(avatarStyle('Grace Hopper'));
  });
});
