/**
 * Browse-rack config for Search v2 (Proposal 01.2) — the "archive" you pull a
 * stub from instead of querying.
 *
 * Two shelves feed the rack:
 *  - BROWSE_GENRES: TMDB movie genres, tapped to run a genre discover browse
 *    through the existing `discover-movies` edge fn (`useDiscoverMovies`). Genre
 *    ids are the real TMDB ids so the archival serial (Nº 878) is honest data —
 *    every id here is already used elsewhere in the app (app/search.tsx
 *    GENRES_DATA) or shown in the approved mock.
 *  - COMPANY_SHELVES: curated studio shelves. The existing discover infra only
 *    supports a genre param (the edge fn contract is `{ genreId, page }`), so
 *    these render as rack tiles but tapping surfaces a "coming soon" note — a
 *    company (`with_companies`) discover path would need an edge-fn change,
 *    which is out of scope for this PR. A24's id is verified from TMDB; Neon is
 *    intentionally omitted rather than guessed.
 */

export interface BrowseGenre {
  id: number;
  name: string;
}

export interface CompanyShelf {
  name: string;
  companyIds: number[];
  serial: string;
}

/** Genres offered in the rack. Ids are canonical TMDB movie genre ids. */
export const BROWSE_GENRES: BrowseGenre[] = [
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
  { id: 28, name: 'Action' },
  { id: 18, name: 'Drama' },
  { id: 35, name: 'Comedy' },
  { id: 27, name: 'Horror' },
  { id: 16, name: 'Animation' },
];

/** Curated studio shelves. See file header re: the coming-soon tap state. */
export const COMPANY_SHELVES: CompanyShelf[] = [
  { name: 'A24 & kin', companyIds: [41077], serial: 'Curated' },
];

/** The archival serial printed under a genre name, e.g. `Nº 878` / `Nº 053`. */
export function genreSerial(id: number): string {
  return `Nº ${String(id).padStart(3, '0')}`;
}
