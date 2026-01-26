/**
 * Ticket Post-Processor Test Script
 * Standalone Node.js script that cleans extracted ticket data
 *
 * This script reimplements the cleaning functions from lib/ticket-processor.ts
 * without any React Native or app dependencies.
 *
 * Usage:
 *   node scripts/test-processor.js < extracted.json
 *   node scripts/test-ticket-scan.js --json | node scripts/test-processor.js
 *   node scripts/test-ticket-scan.js --process  (calls this automatically)
 *
 * Input: JSON from stdin (Gemini extraction output)
 * Output: Cleaned ticket data with comparison to original
 */

// ============================================================================
// Constants (mirrored from lib/ticket-processor.ts)
// ============================================================================

const FORMAT_INDICATORS = [
  // Premium formats
  'DOLBY',
  'DOLBY CINEMA',
  'DOLBY ATMOS',
  'ATMOS',
  'IMAX',
  'IMAX 3D',
  'IMAX 2D',
  'IMAX LASER',
  'IMAX WITH LASER',
  // 3D variants
  '3D',
  '2D',
  'REAL 3D',
  'REALD 3D',
  'REALD',
  'DIGITAL 3D',
  // Other formats
  'SCREENX',
  'SCREEN X',
  '4DX',
  '4D',
  'D-BOX',
  'DBOX',
  'RPX',
  'XD',
  'ULTRA AVX',
  'AVX',
  'ETX',
  'PLF',
  'PRIME',
  'LUXE',
  "DIRECTOR'S HALL",
  'VIP',
  'PREMIUM',
  // Theater-specific
  'AMC',
  'REGAL',
  'CINEMARK',
  'CINEPLEX',
  // Time-based
  'EARLY BIRD',
  'MATINEE',
  'LATE NIGHT',
  // Language variants
  'DUBBED',
  'SUBBED',
  'SUBTITLED',
  'ENGLISH',
  'SPANISH',
  'OV',
  'ORIGINAL VERSION',
];

const TITLE_PREFIXES = [
  'MOVIE:',
  'FILM:',
  'FEATURE:',
  'SHOWING:',
];

const TITLE_SUFFIXES = [
  '(MOVIE)',
  '(FILM)',
  '(FEATURE)',
];

// ============================================================================
// Utility Functions
// ============================================================================

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// Cleaning Functions (reimplemented from ticket-processor.ts)
// ============================================================================

/**
 * Clean a raw movie title by removing format indicators and normalizing
 */
function cleanMovieTitle(rawTitle) {
  if (!rawTitle) return '';

  let title = rawTitle.trim();

  // Remove format indicators (case-insensitive)
  for (const format of FORMAT_INDICATORS) {
    // Match format at start, end, or surrounded by non-alphanumeric
    const patterns = [
      new RegExp(`^${escapeRegex(format)}\\s*[-:]?\\s*`, 'i'),
      new RegExp(`\\s*[-:]?\\s*${escapeRegex(format)}$`, 'i'),
      new RegExp(`\\s*\\(${escapeRegex(format)}\\)\\s*`, 'gi'),
      new RegExp(`\\s*\\[${escapeRegex(format)}\\]\\s*`, 'gi'),
      new RegExp(`\\s+${escapeRegex(format)}\\s+`, 'gi'),
    ];

    for (const pattern of patterns) {
      title = title.replace(pattern, ' ');
    }
  }

  // Remove common prefixes
  for (const prefix of TITLE_PREFIXES) {
    if (title.toUpperCase().startsWith(prefix)) {
      title = title.substring(prefix.length);
    }
  }

  // Remove common suffixes
  for (const suffix of TITLE_SUFFIXES) {
    if (title.toUpperCase().endsWith(suffix)) {
      title = title.substring(0, title.length - suffix.length);
    }
  }

  // Remove any remaining parenthetical format info
  title = title.replace(/\s*\([^)]*(?:3D|IMAX|DOLBY|ATMOS)[^)]*\)\s*/gi, ' ');

  // Normalize whitespace
  title = title.replace(/\s+/g, ' ').trim();

  // Remove leading/trailing punctuation
  title = title.replace(/^[-:,.\s]+|[-:,.\s]+$/g, '');

  return title;
}

/**
 * Parse seat information from raw row and number strings
 */
function parseSeatInfo(rawRow, rawNumber) {
  let row = rawRow?.trim() || null;
  let seat = rawNumber?.trim() || null;

  // Case 1: Row contains combined info like "H10" or "A-12"
  if (row && !seat) {
    const combinedMatch = row.match(/^([A-Za-z]+)[-\s]?(\d+)$/);
    if (combinedMatch) {
      row = combinedMatch[1].toUpperCase();
      seat = combinedMatch[2];
    }
  }

  // Case 2: Seat contains combined info
  if (seat && !row) {
    const combinedMatch = seat.match(/^([A-Za-z]+)[-\s]?(\d+)$/);
    if (combinedMatch) {
      row = combinedMatch[1].toUpperCase();
      seat = combinedMatch[2];
    }
  }

  // Case 3: Row is a number and seat is a letter (swapped)
  if (row && seat) {
    const rowIsNumber = /^\d+$/.test(row);
    const seatIsLetter = /^[A-Za-z]+$/.test(seat);

    if (rowIsNumber && seatIsLetter) {
      // They're swapped - fix it
      const temp = row;
      row = seat.toUpperCase();
      seat = temp;
    }
  }

  // Case 4: Check for format like "Row H Seat 10"
  if (row) {
    const rowMatch = row.match(/^(?:row\s+)?([A-Za-z]+)(?:\s+seat\s+(\d+))?$/i);
    if (rowMatch) {
      row = rowMatch[1].toUpperCase();
      if (rowMatch[2] && !seat) {
        seat = rowMatch[2];
      }
    }
  }

  // Normalize row to uppercase letter(s)
  if (row) {
    row = row.toUpperCase().replace(/[^A-Z]/g, '') || null;
  }

  // Normalize seat to just digits
  if (seat) {
    seat = seat.replace(/\D/g, '') || null;
  }

  return { row, seat };
}

/**
 * Validate and fix malformed dates
 */
function validateDate(dateStr, fallbackYear = null) {
  if (!dateStr) return null;

  const currentYear = new Date().getFullYear();
  const yearToUse = fallbackYear ?? currentYear;

  // Clean the date string
  let cleaned = dateStr.trim();

  // Handle "null-MM-DD" format
  cleaned = cleaned.replace(/^null-/i, `${yearToUse}-`);

  // Define patterns
  const patterns = [
    // YYYY-MM-DD (standard)
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // MM-DD-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // DD.MM.YYYY (European)
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    // MM/DD (no year)
    /^(\d{1,2})\/(\d{1,2})$/,
    // Month DD, YYYY
    /^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?$/,
  ];

  let year = null;
  let month = null;
  let day = null;

  // Try YYYY-MM-DD first
  const isoMatch = cleaned.match(patterns[0]);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  }

  // Try MM/DD/YYYY
  if (!year) {
    const usMatch = cleaned.match(patterns[1]);
    if (usMatch) {
      month = parseInt(usMatch[1], 10);
      day = parseInt(usMatch[2], 10);
      year = parseInt(usMatch[3], 10);
    }
  }

  // Try MM-DD-YYYY
  if (!year) {
    const dashMatch = cleaned.match(patterns[2]);
    if (dashMatch) {
      month = parseInt(dashMatch[1], 10);
      day = parseInt(dashMatch[2], 10);
      year = parseInt(dashMatch[3], 10);
    }
  }

  // Try DD.MM.YYYY (European)
  if (!year) {
    const euMatch = cleaned.match(patterns[3]);
    if (euMatch) {
      day = parseInt(euMatch[1], 10);
      month = parseInt(euMatch[2], 10);
      year = parseInt(euMatch[3], 10);
    }
  }

  // Try MM/DD (no year)
  if (!year) {
    const noYearMatch = cleaned.match(patterns[4]);
    if (noYearMatch) {
      month = parseInt(noYearMatch[1], 10);
      day = parseInt(noYearMatch[2], 10);
      year = yearToUse;
    }
  }

  // Try Month DD, YYYY
  if (!year) {
    const monthNameMatch = cleaned.match(patterns[5]);
    if (monthNameMatch) {
      const monthName = monthNameMatch[1].toLowerCase();
      const monthNames = {
        january: 1, jan: 1,
        february: 2, feb: 2,
        march: 3, mar: 3,
        april: 4, apr: 4,
        may: 5,
        june: 6, jun: 6,
        july: 7, jul: 7,
        august: 8, aug: 8,
        september: 9, sep: 9, sept: 9,
        october: 10, oct: 10,
        november: 11, nov: 11,
        december: 12, dec: 12,
      };

      month = monthNames[monthName] ?? null;
      day = parseInt(monthNameMatch[2], 10);
      year = monthNameMatch[3] ? parseInt(monthNameMatch[3], 10) : yearToUse;
    }
  }

  // Validate the parsed date
  if (year && month && day) {
    // Basic validation
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (year < 1900 || year > 2100) return null;

    // More precise day validation
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) return null;

    // Format as YYYY-MM-DD
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  }

  return null;
}

/**
 * Normalize price data with default currency
 */
function normalizePrice(amount, currency) {
  // Default currency to USD if not specified
  let normalizedCurrency = currency?.trim().toUpperCase() || 'USD';

  // Handle common currency symbols
  const currencyMap = {
    '$': 'USD',
    'EUR': 'EUR',
    'GBP': 'GBP',
    'JPY': 'JPY',
    'US$': 'USD',
    'US': 'USD',
    'DOLLAR': 'USD',
    'DOLLARS': 'USD',
    'EURO': 'EUR',
    'EUROS': 'EUR',
    'POUND': 'GBP',
    'POUNDS': 'GBP',
  };

  if (currencyMap[normalizedCurrency]) {
    normalizedCurrency = currencyMap[normalizedCurrency];
  }

  // Handle $0 prices as likely missing data
  let normalizedAmount = amount;
  if (amount === 0) {
    normalizedAmount = null;
  }

  return {
    amount: normalizedAmount,
    currency: normalizedCurrency,
  };
}

// ============================================================================
// Main Processing Logic
// ============================================================================

/**
 * Process a single ticket and return cleaned data with diff info
 */
function processTicket(ticket) {
  const changes = [];
  const warnings = [];

  // Clean movie title
  const originalTitle = ticket.movie_title;
  const cleanedTitle = cleanMovieTitle(originalTitle);
  if (cleanedTitle !== originalTitle) {
    changes.push({
      field: 'movie_title',
      original: originalTitle,
      cleaned: cleanedTitle,
    });
  }

  // Parse seat info
  const originalRow = ticket.seat?.row;
  const originalNumber = ticket.seat?.number;
  const { row: seatRow, seat: seatNumber } = parseSeatInfo(originalRow, originalNumber);
  if (seatRow !== originalRow || seatNumber !== originalNumber) {
    changes.push({
      field: 'seat',
      original: `Row: ${originalRow}, Number: ${originalNumber}`,
      cleaned: `Row: ${seatRow}, Number: ${seatNumber}`,
    });
  }

  // Validate date
  const originalDate = ticket.date;
  const validatedDate = validateDate(originalDate);
  if (validatedDate !== originalDate) {
    if (originalDate && !validatedDate) {
      warnings.push(`Invalid date format: "${originalDate}" could not be parsed`);
    }
    changes.push({
      field: 'date',
      original: originalDate,
      cleaned: validatedDate,
    });
  }

  // Normalize price
  const originalAmount = ticket.price?.amount;
  const originalCurrency = ticket.price?.currency;
  const { amount: priceAmount, currency: priceCurrency } = normalizePrice(
    originalAmount,
    originalCurrency
  );
  if (priceAmount !== originalAmount || priceCurrency !== originalCurrency) {
    changes.push({
      field: 'price',
      original: `${originalAmount} ${originalCurrency}`,
      cleaned: `${priceAmount} ${priceCurrency}`,
    });
  }

  // Check for missing critical data
  if (!cleanedTitle) {
    warnings.push('No movie title extracted');
  }
  if (!validatedDate) {
    warnings.push('No valid date');
  }
  if (!ticket.showtime) {
    warnings.push('No showtime');
  }

  return {
    cleaned: {
      movie_title: cleanedTitle,
      theater_name: ticket.theater_name?.trim() || null,
      theater_chain: ticket.theater_chain?.trim() || null,
      date: validatedDate,
      showtime: ticket.showtime?.trim() || null,
      seat: {
        row: seatRow,
        number: seatNumber,
      },
      auditorium: ticket.auditorium?.trim() || null,
      format: ticket.format?.trim() || null,
      price: {
        amount: priceAmount,
        currency: priceCurrency,
      },
      ticket_type: ticket.ticket_type?.trim() || null,
      confirmation_number: ticket.confirmation_number?.trim() || null,
      barcode_visible: ticket.barcode_visible,
    },
    changes,
    warnings,
    needsReview: warnings.length > 0 || !cleanedTitle,
  };
}

/**
 * Process all tickets from extraction output
 */
function processExtraction(data) {
  if (!data.tickets || !Array.isArray(data.tickets)) {
    return {
      error: 'No tickets array found in input',
      input: data,
    };
  }

  const results = data.tickets.map((ticket, index) => ({
    index: index + 1,
    original: ticket,
    ...processTicket(ticket),
  }));

  // Summary stats
  const totalTickets = results.length;
  const ticketsWithChanges = results.filter(r => r.changes.length > 0).length;
  const ticketsNeedingReview = results.filter(r => r.needsReview).length;

  return {
    summary: {
      totalTickets,
      ticketsWithChanges,
      ticketsNeedingReview,
      imageQuality: data.image_quality,
      extractionConfidence: data.confidence_score,
    },
    results,
    notes: data.notes,
  };
}

/**
 * Format output for display
 */
function formatOutput(processed) {
  const lines = [];

  lines.push('');
  lines.push('PROCESSING SUMMARY');
  lines.push('-'.repeat(60));
  lines.push(`Total tickets: ${processed.summary.totalTickets}`);
  lines.push(`Tickets modified: ${processed.summary.ticketsWithChanges}`);
  lines.push(`Tickets needing review: ${processed.summary.ticketsNeedingReview}`);
  lines.push(`Extraction confidence: ${Math.round((processed.summary.extractionConfidence || 0) * 100)}%`);
  lines.push(`Image quality: ${processed.summary.imageQuality || 'unknown'}`);
  lines.push('');

  for (const result of processed.results) {
    lines.push('='.repeat(60));
    lines.push(`TICKET #${result.index}: "${result.cleaned.movie_title || '(no title)'}"`);
    lines.push('='.repeat(60));

    // Show cleaned data
    lines.push('');
    lines.push('CLEANED DATA:');
    lines.push(`  Title:    ${result.cleaned.movie_title || '(none)'}`);
    lines.push(`  Theater:  ${result.cleaned.theater_name || '(none)'} (${result.cleaned.theater_chain || 'unknown chain'})`);
    lines.push(`  Date:     ${result.cleaned.date || '(none)'}`);
    lines.push(`  Time:     ${result.cleaned.showtime || '(none)'}`);
    lines.push(`  Seat:     Row ${result.cleaned.seat.row || '?'}, Seat ${result.cleaned.seat.number || '?'}`);
    lines.push(`  Format:   ${result.cleaned.format || 'Standard'}`);
    lines.push(`  Price:    ${result.cleaned.price.amount !== null ? `${result.cleaned.price.amount} ${result.cleaned.price.currency}` : '(none)'}`);
    lines.push(`  Type:     ${result.cleaned.ticket_type || '(none)'}`);

    // Show changes
    if (result.changes.length > 0) {
      lines.push('');
      lines.push('CHANGES MADE:');
      for (const change of result.changes) {
        lines.push(`  [${change.field}]`);
        lines.push(`    Before: ${change.original}`);
        lines.push(`    After:  ${change.cleaned}`);
      }
    }

    // Show warnings
    if (result.warnings.length > 0) {
      lines.push('');
      lines.push('WARNINGS:');
      for (const warning of result.warnings) {
        lines.push(`  - ${warning}`);
      }
    }

    // Review status
    if (result.needsReview) {
      lines.push('');
      lines.push('>>> NEEDS MANUAL REVIEW <<<');
    }

    lines.push('');
  }

  // Notes from extraction
  if (processed.notes) {
    lines.push('-'.repeat(60));
    lines.push(`Extraction notes: ${processed.notes}`);
    lines.push('');
  }

  // Final summary of items needing review
  const reviewItems = processed.results.filter(r => r.needsReview);
  if (reviewItems.length > 0) {
    lines.push('='.repeat(60));
    lines.push('TICKETS NEEDING REVIEW:');
    lines.push('='.repeat(60));
    for (const item of reviewItems) {
      lines.push(`  #${item.index}: "${item.cleaned.movie_title || '(no title)'}"`);
      for (const warning of item.warnings) {
        lines.push(`       - ${warning}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  // Read input from stdin
  let input = '';

  // Check if stdin is a TTY (interactive terminal)
  if (process.stdin.isTTY) {
    console.log('Ticket Post-Processor');
    console.log('Usage: node test-processor.js < extracted.json');
    console.log('   or: node test-ticket-scan.js --json | node test-processor.js');
    console.log('   or: node test-ticket-scan.js --process');
    console.log('');
    console.log('Paste JSON input and press Ctrl+D when done:');
  }

  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  if (!input.trim()) {
    console.error('Error: No input received');
    process.exit(1);
  }

  try {
    const data = JSON.parse(input.trim());

    // Check for error from scanner
    if (data.error) {
      console.error(`Scanner error: ${data.error}`);
      process.exit(1);
    }

    const processed = processExtraction(data);

    if (processed.error) {
      console.error(`Processing error: ${processed.error}`);
      process.exit(1);
    }

    console.log(formatOutput(processed));

    // Also output JSON for programmatic use
    console.log('-'.repeat(60));
    console.log('PROCESSED JSON:');
    console.log('-'.repeat(60));
    console.log(JSON.stringify(processed, null, 2));

  } catch (error) {
    console.error(`Error parsing input: ${error.message}`);
    process.exit(1);
  }
}

main();
