import {
  buildPlaceField,
  formatStubDate,
  getPlaceFieldLabel,
  getWatchContextLabel,
} from '@/lib/scan-v2/journey-stub-fields';

describe('getWatchContextLabel', () => {
  it('maps each watch context to its tag label', () => {
    expect(getWatchContextLabel('theater')).toBe('THEATRICAL RUN');
    expect(getWatchContextLabel('home')).toBe('HOME VIEWING');
    expect(getWatchContextLabel('airplane')).toBe('IN-FLIGHT');
    expect(getWatchContextLabel('outdoor')).toBe('OUTDOOR CINEMA');
  });

  it('is case-insensitive', () => {
    expect(getWatchContextLabel('Theater')).toBe('THEATRICAL RUN');
    expect(getWatchContextLabel('HOME')).toBe('HOME VIEWING');
  });

  it('falls back to VIEWING for unknown or missing contexts', () => {
    expect(getWatchContextLabel(null)).toBe('VIEWING');
    expect(getWatchContextLabel('submarine')).toBe('VIEWING');
  });
});

describe('getPlaceFieldLabel', () => {
  it('labels the place field by watch context', () => {
    expect(getPlaceFieldLabel('theater')).toBe('Cinema');
    expect(getPlaceFieldLabel('home')).toBe('Service');
    expect(getPlaceFieldLabel('airplane')).toBe('Airline');
    expect(getPlaceFieldLabel(null)).toBe('Location');
    expect(getPlaceFieldLabel('outdoor')).toBe('Location');
  });
});

describe('formatStubDate', () => {
  it('formats a valid date', () => {
    expect(formatStubDate('2026-06-15T19:30:00Z')).toMatch(/Jun 1[45], 2026/);
  });

  it('returns null for missing or invalid input (field is omitted, never "N/A")', () => {
    expect(formatStubDate(null)).toBeNull();
    expect(formatStubDate('not-a-date')).toBeNull();
  });
});

describe('buildPlaceField', () => {
  const base = { location_type: 'theater', location_name: null, theater_chain: null, watch_format: null };

  it('uses location_name with the context label', () => {
    expect(buildPlaceField({ ...base, location_name: 'AMC Empire 25' })).toEqual({
      label: 'Cinema',
      value: 'AMC Empire 25',
    });
    expect(buildPlaceField({ ...base, location_type: 'home', location_name: 'Netflix' })).toEqual({
      label: 'Service',
      value: 'Netflix',
    });
    expect(buildPlaceField({ ...base, location_type: 'airplane', location_name: 'Delta' })).toEqual({
      label: 'Airline',
      value: 'Delta',
    });
  });

  it('falls back to theater_chain, then Format', () => {
    expect(buildPlaceField({ ...base, theater_chain: 'AMC' })).toEqual({ label: 'Cinema', value: 'AMC' });
    expect(buildPlaceField({ ...base, watch_format: 'imax' })).toEqual({ label: 'Format', value: 'IMAX' });
  });

  it('ignores whitespace-only names', () => {
    expect(buildPlaceField({ ...base, location_name: '   ', watch_format: 'imax' })).toEqual({
      label: 'Format',
      value: 'IMAX',
    });
  });

  it('returns null when nothing is set (field omitted entirely)', () => {
    expect(buildPlaceField(base)).toBeNull();
  });
});
