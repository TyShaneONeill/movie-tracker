import {
  buildWeeklyRecapBody,
  buildWeeklyRecapPayloads,
  type WeeklyRecapCandidate,
} from '../../supabase/functions/send-weekly-recap/weekly-recap-copy';

describe('buildWeeklyRecapBody', () => {
  it('joins all three activity counts with the example wording', () => {
    const candidate: WeeklyRecapCandidate = {
      user_id: 'u1',
      films_watched: 3,
      episodes_logged: 5,
      takes_created: 1,
      top_genre: null,
    };
    expect(buildWeeklyRecapBody(candidate)).toBe(
      '3 films, 5 episodes, 1 first take — your week in film.'
    );
  });

  it('singularizes counts of exactly 1', () => {
    const candidate: WeeklyRecapCandidate = {
      user_id: 'u1',
      films_watched: 1,
      episodes_logged: 1,
      takes_created: 1,
      top_genre: null,
    };
    expect(buildWeeklyRecapBody(candidate)).toBe(
      '1 film, 1 episode, 1 first take — your week in film.'
    );
  });

  it('omits zero-count activity types from the summary', () => {
    const candidate: WeeklyRecapCandidate = {
      user_id: 'u1',
      films_watched: 2,
      episodes_logged: 0,
      takes_created: 0,
      top_genre: null,
    };
    expect(buildWeeklyRecapBody(candidate)).toBe('2 films — your week in film.');
  });

  it('appends a top_genre suffix when present', () => {
    const candidate: WeeklyRecapCandidate = {
      user_id: 'u1',
      films_watched: 2,
      episodes_logged: 0,
      takes_created: 0,
      top_genre: 'Horror',
    };
    expect(buildWeeklyRecapBody(candidate)).toBe(
      '2 films — your week in film. Mostly Horror.'
    );
  });

  it('falls back to a genre-anchored body when all counts are zero but a genre exists', () => {
    const candidate: WeeklyRecapCandidate = {
      user_id: 'u1',
      films_watched: 0,
      episodes_logged: 0,
      takes_created: 0,
      top_genre: 'Sci-Fi',
    };
    expect(buildWeeklyRecapBody(candidate)).toBe(
      'Another week deep in Sci-Fi — your week in film.'
    );
  });

  it('falls back to a fully generic body when there is no activity and no genre', () => {
    const candidate: WeeklyRecapCandidate = {
      user_id: 'u1',
      films_watched: 0,
      episodes_logged: 0,
      takes_created: 0,
      top_genre: null,
    };
    expect(buildWeeklyRecapBody(candidate)).toBe('Your week in film — see the recap.');
  });
});

describe('buildWeeklyRecapPayloads', () => {
  it('returns empty array for empty input', () => {
    expect(buildWeeklyRecapPayloads([])).toEqual([]);
  });

  it('builds one payload per candidate, not grouped', () => {
    const candidates: WeeklyRecapCandidate[] = [
      { user_id: 'u1', films_watched: 1, episodes_logged: 0, takes_created: 0, top_genre: null },
      { user_id: 'u2', films_watched: 1, episodes_logged: 0, takes_created: 0, top_genre: null },
    ];
    const result = buildWeeklyRecapPayloads(candidates);
    expect(result).toHaveLength(2);
    expect(result[0].user_ids).toEqual(['u1']);
    expect(result[1].user_ids).toEqual(['u2']);
  });

  it('sets feature=weekly_recap, channel_id=digest, and the analytics deep link on every payload', () => {
    const candidates: WeeklyRecapCandidate[] = [
      { user_id: 'u1', films_watched: 1, episodes_logged: 0, takes_created: 0, top_genre: null },
    ];
    const result = buildWeeklyRecapPayloads(candidates);
    expect(result[0].feature).toBe('weekly_recap');
    expect(result[0].channel_id).toBe('digest');
    expect(result[0].data.feature).toBe('weekly_recap');
    expect(result[0].data.url).toBe('/analytics');
  });
});
