import {
  BROWSE_GENRES,
  COMPANY_SHELVES,
  genreSerial,
} from '../../lib/search-v2-shelves';

describe('search-v2-shelves config', () => {
  it('exposes at least one browse genre, each with a positive id and a name', () => {
    expect(BROWSE_GENRES.length).toBeGreaterThan(0);
    for (const genre of BROWSE_GENRES) {
      expect(Number.isInteger(genre.id)).toBe(true);
      expect(genre.id).toBeGreaterThan(0);
      expect(genre.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate genre ids', () => {
    const ids = BROWSE_GENRES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders company shelves in a 2-column grid (genres + shelves even count)', () => {
    // A tidy 2-column rack wants an even tile count.
    expect((BROWSE_GENRES.length + COMPANY_SHELVES.length) % 2).toBe(0);
  });

  it('exposes company shelves with verified company ids and a serial', () => {
    expect(COMPANY_SHELVES.length).toBeGreaterThan(0);
    for (const shelf of COMPANY_SHELVES) {
      expect(shelf.name.trim().length).toBeGreaterThan(0);
      expect(shelf.serial.trim().length).toBeGreaterThan(0);
      expect(shelf.companyIds.length).toBeGreaterThan(0);
      for (const id of shelf.companyIds) {
        expect(Number.isInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(0);
      }
    }
  });

  it('seeds the A24 shelf with the verified TMDB company id 41077', () => {
    const a24 = COMPANY_SHELVES.find((s) => s.name === 'A24 & kin');
    expect(a24).toBeDefined();
    expect(a24?.companyIds).toContain(41077);
  });
});

describe('genreSerial', () => {
  it('zero-pads sub-100 ids to three digits', () => {
    expect(genreSerial(53)).toBe('Nº 053');
    expect(genreSerial(28)).toBe('Nº 028');
  });

  it('leaves three-digit ids intact', () => {
    expect(genreSerial(878)).toBe('Nº 878');
  });

  it('does not truncate ids longer than three digits', () => {
    expect(genreSerial(10749)).toBe('Nº 10749');
  });
});
