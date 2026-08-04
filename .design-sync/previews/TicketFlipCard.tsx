import React from 'react';
import { TicketFlipCard, Colors, BorderRadius, Spacing } from '@pocketstubs/design-system';

/**
 * The flip card is the bottom half of a journey ticket — it is transparent by
 * design and inherits the stub surface behind it, so the frame supplies that
 * surface, sitting on the app background like the journey screen. Only the FRONT
 * face renders statically: the back face (ADMIT ONE / barcode) is behind a
 * rotateY flip driven by press state.
 */
const Stub = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: 360,
      padding: Spacing.md,
      paddingTop: 0,
      backgroundColor: Colors.dark.background,
      borderRadius: 12,
      boxSizing: 'content-box',
    }}
  >
    <div
      style={{
        width: '100%',
        paddingBottom: 16,
        marginTop: Spacing.md,
        backgroundColor: Colors.dark.card,
        borderBottomLeftRadius: BorderRadius.lg,
        borderBottomRightRadius: BorderRadius.lg,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  </div>
);

const journey = (j: Record<string, unknown>) =>
  ({
    id: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    title: '',
    ticket_id: null,
    watched_at: null,
    watch_time: null,
    watch_format: null,
    location_name: null,
    seat_location: null,
    auditorium: null,
    ticket_price: null,
    watched_with: null,
    journey_tagline: null,
    poster_path: null,
    ...j,
  }) as any;

export const Canonical = () => (
  <Stub>
    <TicketFlipCard
      journey={journey({
        title: 'Dune: Part Two',
        ticket_id: 'AMC-88214',
        watched_at: '2026-03-14T19:45:00',
        watch_time: '19:45',
        watch_format: 'imax',
        location_name: 'AMC Providence Place 16',
        seat_location: 'F12',
        auditorium: '9',
        ticket_price: 16.49,
        journey_tagline: 'the sandworm ride',
        watched_with: ['Marcus'],
      })}
      firstTake={{ rating: 9 } as any}
      colors={Colors.dark as any}
      isDark
      infoPageWidth={296}
    />
  </Stub>
);

export const SoloScreening = () => (
  <Stub>
    <TicketFlipCard
      journey={journey({
        title: 'Past Lives',
        watched_at: '2026-06-02T18:30:00',
        location_name: 'Avon Cinema',
        seat_location: 'C4',
        ticket_price: 12,
      })}
      firstTake={{ rating: 8.5 } as any}
      colors={Colors.dark as any}
      isDark
      infoPageWidth={296}
    />
  </Stub>
);

export const CouchWatchSparse = () => (
  <Stub>
    <TicketFlipCard
      journey={journey({ title: 'Heat' })}
      firstTake={null}
      colors={Colors.dark as any}
      isDark
      infoPageWidth={296}
    />
  </Stub>
);

export const WithCompanions = () => (
  <Stub>
    <TicketFlipCard
      journey={journey({
        title: 'Everything Everywhere All at Once',
        watched_at: '2026-05-18T21:15:00',
        watch_time: '21:15',
        location_name: 'Showcase Warwick',
        seat_location: 'H7–H9',
        watched_with: ['cineholic', 'Nadia', 'Sam'],
        ticket_price: 14.75,
      })}
      firstTake={{ rating: 10 } as any}
      colors={Colors.dark as any}
      isDark
      infoPageWidth={296}
    />
  </Stub>
);
