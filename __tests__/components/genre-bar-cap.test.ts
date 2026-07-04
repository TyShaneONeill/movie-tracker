import {
  buildDisplayGenres,
  OTHER_GENRE_ID,
  MAX_GENRE_SEGMENTS,
} from '@/components/stats-v2/genre-display';
import type { GenreStats } from '@/hooks/use-user-stats';

const g = (genreId: number, percentage: number, count = percentage): GenreStats => ({
  genreId,
  genreName: `Genre ${genreId}`,
  count,
  percentage,
});

describe('genre-display buildDisplayGenres — cap at 6 with an Other bucket', () => {
  it('returns genres unchanged when there are 6 or fewer', () => {
    const six = [g(1, 30), g(2, 25), g(3, 20), g(4, 15), g(5, 6), g(6, 4)];
    expect(buildDisplayGenres(six)).toEqual(six);
    expect(buildDisplayGenres(six.slice(0, 3))).toHaveLength(3);
  });

  it('keeps top 5 and rolls the rest into a single Other bucket when >6', () => {
    const many = [
      g(1, 30), g(2, 20), g(3, 15), g(4, 12), g(5, 10), // top 5 = 87
      g(6, 6), g(7, 4), g(8, 3), // rest = 13
    ];
    const out = buildDisplayGenres(many);
    expect(out).toHaveLength(MAX_GENRE_SEGMENTS);

    const other = out[out.length - 1];
    expect(other.genreId).toBe(OTHER_GENRE_ID);
    expect(other.genreName).toBe('Other');
    expect(other.percentage).toBe(13); // 6 + 4 + 3
    expect(other.count).toBe(13);

    expect(out.slice(0, 5).map((x) => x.genreId)).toEqual([1, 2, 3, 4, 5]);
  });

  it('sorts by share before slicing so the true top 5 survive regardless of input order', () => {
    const unsorted = [
      g(10, 5), g(11, 40), g(12, 8), g(13, 35), g(14, 3), g(15, 6), g(16, 3),
    ];
    const out = buildDisplayGenres(unsorted);
    expect(out.slice(0, 5).map((x) => x.genreId)).toEqual([11, 13, 12, 15, 10]);
    expect(out[5].genreId).toBe(OTHER_GENRE_ID);
    expect(out[5].percentage).toBe(6); // 3 + 3 (genres 14 + 16)
  });
});
