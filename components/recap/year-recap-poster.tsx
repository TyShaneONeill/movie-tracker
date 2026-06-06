import React, { RefObject } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { YearRecap } from '@/hooks/use-year-recap';

const PALETTE = { black: '#1A1A1A', red: '#C41E3A', cream: '#F5EBD9', gold: '#D4AF37' };

interface StatCell { value: string; label: string; }

function buildCells(recap: YearRecap): StatCell[] {
  const cells: StatCell[] = [];
  // Always-on
  cells.push({ value: `${Math.round(recap.hoursWatched / 60)}h`, label: 'in the dark' });
  if (recap.genres[0]) cells.push({ value: recap.genres[0].genreName, label: 'top genre' });
  if (recap.tvShows > 0 || recap.episodesWatched > 0) {
    cells.push({ value: `${recap.episodesWatched}`, label: `episodes · ${recap.tvShows} shows` });
  }
  // Adaptive moat
  const imax = recap.formats.find((f) => f.format === 'imax');
  const premiumTotal = recap.formats.reduce((s, f) => s + f.count, 0);
  if (premiumTotal > 0) {
    cells.push({ value: `${imax?.count ?? premiumTotal}`, label: imax ? 'in IMAX' : 'premium fmt' });
  }
  if (recap.theatersCount > 0) {
    cells.push({ value: `${recap.theatersCount}`, label: 'theaters' });
  }
  return cells;
}

export function YearRecapPoster({
  recap, viewShotRef,
}: {
  recap: YearRecap;
  viewShotRef: RefObject<ViewShot | null>;
}) {
  const cells = buildCells(recap);
  const yy = `'${String(recap.year).slice(-2)}`;

  return (
    <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
      <View style={styles.stub}>
        <View style={styles.header}>
          <Text style={styles.admit}>ADMIT ONE · POCKETSTUBS</Text>
          <Text style={styles.yy}>{yy}</Text>
        </View>
        <View style={styles.perforation} />
        <View style={styles.body}>
          <Text style={styles.hero}>{recap.filmsSeen}</Text>
          <Text style={styles.heroLabel}>FILMS SEEN THIS YEAR</Text>
          <View style={styles.grid}>
            {cells.map((c, i) => (
              <View key={i} style={styles.cell}>
                <Text style={styles.cellValue} numberOfLines={1}>{c.value}</Text>
                <Text style={styles.cellLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.footer}>Your {recap.year} at the movies</Text>
        </View>
      </View>
    </ViewShot>
  );
}

const styles = StyleSheet.create({
  stub: { backgroundColor: PALETTE.cream, borderRadius: 16, overflow: 'hidden', width: 320 },
  header: { backgroundColor: PALETTE.black, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  admit: { color: PALETTE.cream, fontSize: 10, letterSpacing: 2 },
  yy: { color: PALETTE.red, fontSize: 24, fontWeight: '800' },
  perforation: { borderTopWidth: 2, borderTopColor: PALETTE.red, borderStyle: 'dashed', marginHorizontal: 12 },
  body: { padding: 20 },
  hero: { color: PALETTE.black, fontSize: 64, fontWeight: '800', lineHeight: 64 },
  heroLabel: { color: PALETTE.black, opacity: 0.6, fontSize: 11, letterSpacing: 2, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', marginBottom: 12 },
  cellValue: { color: PALETTE.black, fontSize: 20, fontWeight: '800' },
  cellLabel: { color: PALETTE.black, opacity: 0.55, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  footer: { color: PALETTE.black, opacity: 0.5, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.15)', paddingTop: 10, marginTop: 4 },
});
