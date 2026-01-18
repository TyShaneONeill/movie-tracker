# Cinetrak

A React Native movie tracking app built with Expo, Supabase, and TMDB.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Set up environment variables

   Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. Start the app

   ```bash
   npx expo start
   ```

## TMDB API Integration

Cinetrak uses [TMDB (The Movie Database)](https://www.themoviedb.org/) API for movie search functionality.

### Setup

1. **Get a TMDB API Key**
   - Create an account at [themoviedb.org](https://www.themoviedb.org/)
   - Go to Settings > API and request an API key
   - Copy your API Key (v3 auth)

2. **Configure Supabase Secret**

   The TMDB API key is stored securely as a Supabase Edge Function secret:

   ```bash
   # Using Supabase CLI
   supabase secrets set TMDB_API_KEY=your_api_key_here --project-ref your_project_ref
   ```

   Or via the Supabase Dashboard:
   - Navigate to Settings > Edge Functions > Secrets
   - Add a new secret: `TMDB_API_KEY` with your API key value

### Architecture

```
App (Home Tab) → supabase.functions.invoke() → Edge Function → TMDB API
```

- TMDB API key is stored securely as a Supabase secret (not in client code)
- Client calls Supabase Edge Function `search-movies`
- Edge Function makes authenticated requests to TMDB API
- TanStack Query handles caching and request deduplication on the client

### Testing the Integration

1. Start the app: `npm start`
2. Sign in to the app
3. Type a movie title in the search input (e.g., "Inception")
4. Results should appear after a brief debounce delay
5. Movie posters and details should display correctly

## Tech Stack

- **Framework**: Expo, React Native, React 19
- **Routing**: expo-router (file-based routing)
- **Language**: TypeScript
- **Data Fetching**: TanStack Query
- **Backend**: Supabase (Auth, Database, Edge Functions)
- **Movie Data**: TMDB API

## Project Structure

```
app/                    # File-based routing (expo-router)
├── _layout.tsx         # Root layout with providers
├── (tabs)/             # Tab navigator group
│   └── index.tsx       # Home tab with movie search
├── (auth)/             # Auth screens
components/             # Reusable UI components
hooks/                  # Custom React hooks
lib/                    # Services, types, and utilities
constants/              # App constants (colors, etc.)
```

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Supabase documentation](https://supabase.com/docs)
- [TMDB API documentation](https://developer.themoviedb.org/docs)
