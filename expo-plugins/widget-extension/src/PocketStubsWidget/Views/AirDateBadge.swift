import SwiftUI

/// Returns true when the given ISO-8601 calendar date (yyyy-MM-dd) is
/// strictly after today in the current (local) calendar. nil or malformed
/// inputs return false — callers should fall back to the tappable/default UI.
func isAirDateFuture(_ iso: String?, now: Date = Date(), calendar: Calendar = .current) -> Bool {
    guard let iso = iso else { return false }
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    // Parse as local calendar date — TMDB air_date is a calendar day
    // (yyyy-MM-dd), not an instant. Using local tz means "Airs Thursday"
    // means "aim to watch on your Thursday."
    guard let airDate = formatter.date(from: iso) else { return false }
    let today = calendar.startOfDay(for: now)
    let air = calendar.startOfDay(for: airDate)
    return air > today
}

/// Formats an ISO-8601 calendar date string into widget-friendly "airs X" text:
///   - 1–6 days away  → weekday name (e.g., "Friday", including days=1 which is tomorrow's weekday)
///   - 7d–1y away     → short month-day (e.g., "Apr 29")
///   - >1y away       → year only ("2027")
///   - parse failure  → "soon"
///   - <=0 days       → "soon" (guard; callers should gate with isAirDateFuture)
func formatAirDate(_ iso: String, now: Date = Date(), calendar: Calendar = .current) -> String {
    let parser = DateFormatter()
    parser.dateFormat = "yyyy-MM-dd"
    guard let airDate = parser.date(from: iso) else { return "soon" }

    let today = calendar.startOfDay(for: now)
    let air = calendar.startOfDay(for: airDate)
    let days = calendar.dateComponents([.day], from: today, to: air).day ?? 0

    if days <= 0 {
        return "soon"
    } else if days <= 6 {
        let weekday = DateFormatter()
        weekday.dateFormat = "EEEE"
        return weekday.string(from: airDate)
    } else if days <= 365 {
        let shortDate = DateFormatter()
        shortDate.dateFormat = "MMM d"
        return shortDate.string(from: airDate)
    } else {
        let yearOnly = DateFormatter()
        yearOnly.dateFormat = "yyyy"
        return yearOnly.string(from: airDate)
    }
}

/// Orange capsule pill for "Airs X" text. Non-interactive.
/// Used in two places:
///   1. Replacing the EyeballButton when the next episode is unaired
///   2. Replacing the "Start S0N" button when the next season's E01 is unaired
struct AirDateBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .medium))
            .foregroundColor(.orange)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.orange.opacity(0.18))
            .clipShape(Capsule())
            .overlay(
                Capsule().strokeBorder(Color.orange.opacity(0.35), lineWidth: 0.5)
            )
    }
}
