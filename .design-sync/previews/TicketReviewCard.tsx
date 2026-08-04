import React from 'react';
import { TicketReviewCard } from '@pocketstubs/design-system';

const baseTicket = {
  movieTitle: 'Dune: Part Two',
  theaterName: 'AMC Providence Place 16',
  theaterChain: 'AMC',
  showtime: '7:45 PM',
  date: '2026-03-14',
  seatRow: 'F',
  seatNumber: '12',
  ticketType: 'Adult',
  priceAmount: 16.49,
  priceCurrency: 'USD',
  format: 'IMAX',
  confirmationNumber: 'AMC-88214',
  barcodeData: null,
  auditorium: '9',
  mpaaRating: 'PG-13',
  tmdbMatch: {
    movie: {
      id: 693134,
      title: 'Dune: Part Two',
      poster_path: null,
      release_date: '2024-02-27',
      vote_average: 8.2,
      overview: '',
    },
    confidence: 0.97,
    matchedTitle: 'Dune: Part Two',
    originalTitle: 'DUNE PT 2 IMAX',
  },
  processingErrors: [],
  wasModified: false,
  ticketPhotoUri: null,
} as any;

export const MatchedTicket = () => (
  <div style={{ width: 380 }}>
    <TicketReviewCard ticket={baseTicket} onEdit={() => {}} onSearchTMDB={() => {}} />
  </div>
);

export const NoMatch = () => (
  <div style={{ width: 380 }}>
    <TicketReviewCard
      ticket={{ ...baseTicket, movieTitle: 'MIDNIGHT SHOW 2', tmdbMatch: null, processingErrors: ['Could not identify movie from ticket text'] }}
      onEdit={() => {}}
      onSearchTMDB={() => {}}
    />
  </div>
);

export const SparseTicket = () => (
  <div style={{ width: 380 }}>
    <TicketReviewCard
      ticket={{ ...baseTicket, theaterName: null, seatRow: null, seatNumber: null, format: null, priceAmount: null, auditorium: null }}
      onEdit={() => {}}
    />
  </div>
);
