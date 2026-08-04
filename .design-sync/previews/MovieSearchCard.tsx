import React from 'react';
import { MovieSearchCard, Colors, Spacing } from '@pocketstubs/design-system';

const movie = (m: Record<string, unknown>) =>
  ({
    id: 0,
    title: '',
    poster_path: null,
    release_date: '',
    vote_average: 0,
    overview: '',
    ...m,
  }) as any;

/** Every story sits on the app background — the surface the search list ships on. */
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 360,
      padding: Spacing.md,
      paddingBottom: 4,
      backgroundColor: Colors.dark.background,
      borderRadius: 12,
    }}
  >
    {children}
  </div>
);

export const Canonical = () => (
  <Frame>
    <MovieSearchCard
      movie={movie({
        id: 693134,
        title: 'Dune: Part Two',
        release_date: '2024-02-27',
        vote_average: 8.2,
        overview:
          'Paul Atreides unites with the Fremen while on a war path of revenge against the conspirators who destroyed his family.',
      })}
      onPress={() => {}}
    />
  </Frame>
);

export const NoOverview = () => (
  <Frame>
    <MovieSearchCard
      movie={movie({
        id: 1041613,
        title: 'Sinners',
        release_date: '2025-04-18',
        vote_average: 7.6,
      })}
      onPress={() => {}}
    />
  </Frame>
);

export const UnreleasedNoRating = () => (
  <Frame>
    <MovieSearchCard
      movie={movie({
        id: 1234821,
        title: 'Hamnet',
        release_date: '',
        vote_average: 0,
        overview: 'Not yet rated — release details still to come.',
      })}
      onPress={() => {}}
    />
  </Frame>
);

export const ResultsList = () => (
  <Frame>
    <MovieSearchCard
      movie={movie({
        id: 756999,
        title: 'The Black Phone',
        release_date: '2021-06-22',
        vote_average: 7.8,
        overview:
          'After being abducted, a boy starts receiving calls on a disconnected phone from the killer’s previous victims.',
      })}
      onPress={() => {}}
    />
    <MovieSearchCard
      movie={movie({
        id: 545611,
        title: 'Everything Everywhere All at Once',
        release_date: '2022-03-24',
        vote_average: 7.8,
        overview:
          'An aging Chinese immigrant is swept up in an insane adventure in which she alone can save existence by exploring other universes.',
      })}
      onPress={() => {}}
    />
  </Frame>
);
