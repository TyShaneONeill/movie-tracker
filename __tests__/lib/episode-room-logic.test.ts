import {
  parseEpisodeRoomParam,
  episodeRoomSlug,
  formatEpisodeLabel,
  formatEpisodeShort,
} from '../../lib/episode-room-logic';

describe('parseEpisodeRoomParam', () => {
  it('parses a well-formed slug', () => {
    expect(parseEpisodeRoomParam('1396-2-4')).toEqual({ tmdbId: 1396, season: 2, episode: 4 });
  });

  it('allows season 0 (TMDB specials)', () => {
    expect(parseEpisodeRoomParam('1396-0-3')).toEqual({ tmdbId: 1396, season: 0, episode: 3 });
  });

  it('rejects null / undefined / empty', () => {
    expect(parseEpisodeRoomParam(null)).toBeNull();
    expect(parseEpisodeRoomParam(undefined)).toBeNull();
    expect(parseEpisodeRoomParam('')).toBeNull();
  });

  it('rejects the wrong number of parts', () => {
    expect(parseEpisodeRoomParam('1396-2')).toBeNull();
    expect(parseEpisodeRoomParam('1396-2-4-5')).toBeNull();
    expect(parseEpisodeRoomParam('1396')).toBeNull();
  });

  it('rejects non-numeric parts', () => {
    expect(parseEpisodeRoomParam('abc-2-4')).toBeNull();
    expect(parseEpisodeRoomParam('1396-x-4')).toBeNull();
    expect(parseEpisodeRoomParam('1396-2-y')).toBeNull();
  });

  it('rejects non-positive tmdbId and episode < 1', () => {
    expect(parseEpisodeRoomParam('0-1-1')).toBeNull();
    expect(parseEpisodeRoomParam('1396-1-0')).toBeNull();
    expect(parseEpisodeRoomParam('-5-1-1')).toBeNull();
  });

  it('rejects fractional parts', () => {
    expect(parseEpisodeRoomParam('1396-2-4.5')).toBeNull();
  });

  it('round-trips with episodeRoomSlug', () => {
    const slug = episodeRoomSlug(1396, 2, 4);
    expect(slug).toBe('1396-2-4');
    expect(parseEpisodeRoomParam(slug)).toEqual({ tmdbId: 1396, season: 2, episode: 4 });
  });
});

describe('formatEpisodeLabel / formatEpisodeShort', () => {
  it('formats the header label', () => {
    expect(formatEpisodeLabel(2, 4)).toBe('S2 · E4');
  });

  it('formats the compact nav label', () => {
    expect(formatEpisodeShort(2, 5)).toBe('S2E5');
  });
});
