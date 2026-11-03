// Sprint 21 — Pagination bornée
import { MAX_PAGE_SIZE, parsePage } from './pagination';

describe('parsePage', () => {
  it('valeurs par défaut', () => {
    expect(parsePage()).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });

  it('valeurs valides', () => {
    expect(parsePage('3', '10')).toEqual({ page: 3, pageSize: 10, skip: 20 });
  });

  it('bornes : page ≥ 1, taille 1..50', () => {
    expect(parsePage('0', '1000000')).toEqual({ page: 1, pageSize: MAX_PAGE_SIZE, skip: 0 });
    expect(parsePage('-4', '0').pageSize).toBe(1);
  });

  it('valeurs non numériques → valeurs par défaut', () => {
    expect(parsePage('abc', 'xyz')).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });
});
