import SwiftUI

struct TrophyOverlay: ViewModifier {
    func body(content: Content) -> some View {
        content
            .opacity(0.45)
            .saturation(0.4)
            .overlay(
                ZStack {
                    Circle()
                        .fill(Color.green.opacity(0.9))
                        .frame(width: 26, height: 26)
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundColor(Color(red: 0.04, green: 0.17, blue: 0.08))
                }
            )
    }
}

extension View {
    func trophyOverlay(enabled: Bool) -> some View {
        self.modifier(TrophyModifierConditional(enabled: enabled))
    }
}

private struct TrophyModifierConditional: ViewModifier {
    let enabled: Bool
    func body(content: Content) -> some View {
        if enabled {
            content.modifier(TrophyOverlay())
        } else {
            content
        }
    }
}
