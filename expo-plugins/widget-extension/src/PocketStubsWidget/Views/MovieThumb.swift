import SwiftUI
import WidgetKit

struct MovieThumb: View {
    let movie: Movie

    var body: some View {
        Link(destination: URL(string: "pocketstubs://movie/\(movie.tmdbId)")!) {
            PosterContent(movie: movie)
                .aspectRatio(2/3, contentMode: .fit)
                .frame(width: 44)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .contentShape(RoundedRectangle(cornerRadius: 6))
        }
    }
}

private struct PosterContent: View {
    let movie: Movie

    var body: some View {
        if let filename = movie.posterFilename,
           let image = WidgetDataReader.loadPoster(filename: filename) {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            ZStack {
                LinearGradient(
                    colors: [Color.black, Color(white: 0.18)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Text(movie.name)
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .padding(2)
                    .lineLimit(3)
            }
        }
    }
}
