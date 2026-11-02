// Sprint 20 — Interprétation de CORS_ORIGIN
import { corsOrigin } from './app.setup';

describe('corsOrigin', () => {
  it.each([undefined, '', '  ', '*', 'https://a.io,*'])('« %s » → toute origine', (value) => {
    expect(corsOrigin(value)).toBe(true);
  });

  it('liste explicite, espaces retirés', () => {
    expect(corsOrigin('https://chess.io, https://admin.chess.io')).toEqual([
      'https://chess.io',
      'https://admin.chess.io',
    ]);
  });
});
