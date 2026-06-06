import React from 'react';
import { render } from '@testing-library/react-native';
jest.mock('react-native-view-shot', () => {
  const React = require('react');
  return { __esModule: true, default: React.forwardRef((props: any, _ref: any) => React.createElement('View', props, props.children)) };
});

import { YearRecapPoster } from '@/components/recap/year-recap-poster';
import type { YearRecap } from '@/hooks/use-year-recap';

const base: YearRecap = {
  year: 2025, filmsSeen: 47, hoursWatched: 5640, // 94h
  genres: [{ genreId: 878, genreName: 'Sci-Fi', count: 12 }],
  tvShows: 8, episodesWatched: 112, tvHours: 3360,
  formats: [{ format: 'imax', count: 12 }], theatersCount: 7, chainsCount: 3,
  firstFilm: { title: 'Oppenheimer', date: '2025-01-03' },
  lastFilm: { title: 'Nosferatu', date: '2025-12-29' },
  availableYears: [2025],
};

describe('YearRecapPoster', () => {
  it('renders the hero film count and core stats', () => {
    const ref = React.createRef<any>();
    const { getByText } = render(<YearRecapPoster recap={base} viewShotRef={ref} />);
    expect(getByText('47')).toBeTruthy();
    expect(getByText(/94/)).toBeTruthy();           // hours (5640 min → 94h)
    expect(getByText('Sci-Fi')).toBeTruthy();
  });

  it('hides moat stats when absent (no "0 IMAX" / "0 theaters")', () => {
    const sparse: YearRecap = { ...base, formats: [], theatersCount: 0, chainsCount: 0 };
    const ref = React.createRef<any>();
    const { queryByText } = render(<YearRecapPoster recap={sparse} viewShotRef={ref} />);
    expect(queryByText(/IMAX/i)).toBeNull();
    expect(queryByText(/theater/i)).toBeNull();
  });
});
