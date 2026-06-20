/**
 * The 6 decade rows shown on the OnboardingV2 Eras step.
 *
 * `slug` is the stable value persisted to `profiles.favorite_eras`.
 * Exemplar films are decade-anchored and chosen to sit firmly inside their
 * decade (no split-release ambiguity). Eras are OPTIONAL — an explicit
 * "across all eras" opt-out is mutually exclusive with specific picks and
 * persists as an empty `favorite_eras` array.
 */
export interface OnboardingEra {
  slug: string;
  label: string;
  movement: string;
  films: [string, string];
}

export const ONBOARDING_ERAS: readonly OnboardingEra[] = [
  { slug: '1970s', label: "'70s", movement: 'New Hollywood', films: ['The Godfather', 'Taxi Driver'] },
  { slug: '1980s', label: "'80s", movement: 'Blockbuster', films: ['Back to the Future', 'Die Hard'] },
  { slug: '1990s', label: "'90s", movement: 'Indie Boom', films: ['Pulp Fiction', 'Goodfellas'] },
  { slug: '2000s', label: "'00s", movement: 'Digital Age', films: ['The Dark Knight', 'Gladiator'] },
  { slug: '2010s', label: "'10s", movement: 'Streaming Era', films: ['Inception', 'Parasite'] },
  { slug: '2020s', label: "'20s", movement: 'New Wave', films: ['Dune', 'Everything Everywhere All at Once'] },
] as const;
