# PRD: AR Poster Inspection - 3D Card View

## Overview
An immersive, interactive poster inspection experience inspired by Pokémon card collectors. When users tap on a journey poster, it opens a fullscreen 3D view where the card floats in space, responds to touch gestures, and moves with the phone's gyroscope.

## Vision
> "Your movie memories are collectible treasures."

Transform poster viewing from a static image into a tactile, delightful experience. The card feels *real* — like holding a physical collectible in your hands.

---

## Why This Matters

### Emotional Value
- Makes viewing your collection *fun*
- Encourages revisiting past journeys
- Transforms digital posters into "physical" collectibles

### Viral Potential
- Screen recordings of the 3D effect are highly shareable
- "Look how cool my CineTrak collection looks"
- Differentiator no other movie app has

### Premium Feature Potential
- Holographic effects could be premium-only
- "Rare" card effects for special achievements
- Ties into future achievements/gamification system

---

## User Experience

### Entry Points
1. **Journey Screen** — Tap the poster/AI art hero image
2. **Collection Grid** — Long-press a poster (future)
3. **Profile** — Tap any poster in your stats sections (future)

### Core Interaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. TAP POSTER                                              │
│     User taps poster on Journey screen                      │
│     ↓                                                       │
│  2. MODAL OPENS                                             │
│     - Screen dims/blurs                                     │
│     - Card animates in (scale + rotate entrance)            │
│     - Haptic feedback on open                               │
│     ↓                                                       │
│  3. INTERACTIVE STATE                                       │
│     ┌─────────────────────────────────────┐                │
│     │                                      │                │
│     │         ╔═══════════════╗           │                │
│     │         ║               ║  ← Card   │                │
│     │         ║   [POSTER]    ║    floats │                │
│     │         ║               ║    in 3D  │                │
│     │         ╚═══════════════╝           │                │
│     │                                      │                │
│     │         "Dune: Part Two"            │                │
│     │            ✕ Close                   │                │
│     └─────────────────────────────────────┘                │
│                                                             │
│     GESTURES:                                               │
│     • Pan/drag → rotates card on X/Y axis                  │
│     • Tilt phone → card follows gyroscope                  │
│     • Double-tap → flip card (if back exists)              │
│     • Pinch → zoom (optional, Phase 2)                     │
│     ↓                                                       │
│  4. CLOSE                                                   │
│     - Tap X or tap outside card                            │
│     - Card animates out                                     │
│     - Haptic feedback                                       │
└─────────────────────────────────────────────────────────────┘
```

### Visual Effects

#### 3D Card Behavior
- Card has perspective depth (appears to float toward user)
- Subtle shadow beneath card that moves with rotation
- Maximum rotation: ±25° on each axis (prevents extreme angles)
- Smooth spring animations for all movements
- Returns to neutral when finger lifted (with bounce)

#### Holographic Shimmer Effect
- Animated gradient overlay that moves across the card
- Responds to card rotation (shimmer follows tilt direction)
- Rainbow/prismatic colors for "rare" cards
- Subtle for normal posters, dramatic for AI-generated art

#### Lighting Simulation
- Subtle highlight moves based on card angle
- Simulates light source from above
- Adds depth and realism to the 3D effect

---

## Technical Architecture

### Dependencies

**Already Installed:**
- `react-native-reanimated` (~4.1.1) — animations
- `react-native-gesture-handler` (~2.28.0) — pan gestures
- `expo-haptics` — tactile feedback
- `expo-blur` — background blur
- `expo-linear-gradient` — shimmer effects

**To Install:**
- `expo-sensors` — gyroscope access

### File Structure

```
components/
├── poster-inspection/
│   ├── PosterInspectionModal.tsx    # Main modal component
│   ├── InspectionCard.tsx           # 3D card with transforms
│   ├── HolographicOverlay.tsx       # Shimmer effect layer
│   └── index.ts                     # Exports

hooks/
├── use-gyroscope.ts                 # Gyroscope data hook
└── use-card-animation.ts            # Reanimated animation logic
```

### Component Architecture

```tsx
<PosterInspectionModal
  visible={boolean}
  imageUrl={string}
  aiImageUrl={string | null}
  movieTitle={string}
  onClose={() => void}
>
  <GestureDetector gesture={panGesture}>
    <Animated.View style={cardAnimatedStyle}>
      <InspectionCard>
        <Image source={{ uri: imageUrl }} />
        <HolographicOverlay rotation={rotationValues} />
      </InspectionCard>
    </Animated.View>
  </GestureDetector>
</PosterInspectionModal>
```

### Animation Values

```typescript
// Shared values (react-native-reanimated)
const rotateX = useSharedValue(0);  // -25 to 25 degrees
const rotateY = useSharedValue(0);  // -25 to 25 degrees
const scale = useSharedValue(0.8);  // Entry animation
const translateZ = useSharedValue(0); // Depth effect

// Derived animated style
const cardStyle = useAnimatedStyle(() => ({
  transform: [
    { perspective: 1000 },
    { rotateX: `${rotateX.value}deg` },
    { rotateY: `${rotateY.value}deg` },
    { scale: scale.value },
  ],
}));
```

### Gyroscope Integration

```typescript
// hooks/use-gyroscope.ts
import { Gyroscope } from 'expo-sensors';

export function useGyroscope(enabled: boolean) {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    if (!enabled) return;
    
    Gyroscope.setUpdateInterval(16); // ~60fps
    const subscription = Gyroscope.addListener(({ x, y }) => {
      // Integrate gyroscope data for rotation
      // Apply dampening for smooth movement
      setRotation(prev => ({
        x: clamp(prev.x + y * sensitivity, -25, 25),
        y: clamp(prev.y + x * sensitivity, -25, 25),
      }));
    });
    
    return () => subscription.remove();
  }, [enabled]);
  
  return rotation;
}
```

### Gesture Handling

```typescript
const panGesture = Gesture.Pan()
  .onBegin(() => {
    // Pause gyroscope influence during touch
    isGestureActive.value = true;
  })
  .onUpdate((event) => {
    // Map translation to rotation
    rotateY.value = clamp(event.translationX / 5, -25, 25);
    rotateX.value = clamp(-event.translationY / 5, -25, 25);
  })
  .onEnd(() => {
    // Spring back to neutral (or gyroscope control)
    rotateX.value = withSpring(0, { damping: 15 });
    rotateY.value = withSpring(0, { damping: 15 });
    isGestureActive.value = false;
  });
```

---

## Implementation Phases

### Phase 1: Basic 3D Card (MVP)
**Scope:** Tappable poster → 3D modal with pan-to-rotate

- [ ] Create `PosterInspectionModal` component
- [ ] Add modal open/close animations
- [ ] Implement pan gesture rotation
- [ ] Add perspective transform
- [ ] Spring animation return to neutral
- [ ] Haptic feedback on open/close
- [ ] Wire up from Journey screen poster tap

**Testing:** Should feel responsive and natural on device

### Phase 2: Gyroscope Integration
**Scope:** Card responds to phone movement

- [ ] Install `expo-sensors`
- [ ] Create `useGyroscope` hook
- [ ] Blend gyroscope input with gesture (gesture takes priority)
- [ ] Add sensitivity settings
- [ ] Handle devices without gyroscope gracefully

**Testing:** Moving phone should gently move the card

### Phase 3: Holographic Effects
**Scope:** Shimmer overlay that responds to rotation

- [ ] Create `HolographicOverlay` component
- [ ] Animated gradient that follows tilt
- [ ] Different intensity for regular vs AI art
- [ ] Optional: "rare card" rainbow effect for achievements

**Testing:** Should look magical, not distracting

### Phase 4: Polish & Extras
**Scope:** Final touches for premium feel

- [ ] Entry/exit animations (card flies in with rotation)
- [ ] Shadow beneath card that moves with rotation
- [ ] Double-tap to flip (show movie info on back?)
- [ ] Poster toggle (original ↔ AI art) via swipe
- [ ] Accessibility considerations
- [ ] Performance optimization

---

## Design Specifications

### Card Dimensions
- Width: 85% of screen width
- Aspect ratio: 2:3 (standard movie poster)
- Corner radius: 12px
- Border: subtle 1px stroke (theme-aware)

### Colors & Effects

**Background:**
- Dark mode: `rgba(0, 0, 0, 0.9)` with blur
- Light mode: `rgba(255, 255, 255, 0.9)` with blur

**Shimmer Gradient:**
- Colors: `['transparent', 'rgba(255,255,255,0.3)', 'transparent']`
- Angle: Dynamic based on rotation
- Animation: Continuous subtle movement

**Shadow:**
- Color: `rgba(0, 0, 0, 0.5)`
- Offset: Follows inverse of rotation
- Blur: 20px
- Spread: 10px

### Motion Guidelines
- All animations use spring physics (not linear)
- Default spring config: `{ damping: 15, stiffness: 150 }`
- Rotation should feel weighty, not floaty
- Maximum rotation: 25° (prevents seeing card edge-on)

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| No gyroscope on device | Gracefully disable, pan-only mode |
| Image fails to load | Show placeholder with movie title |
| Very slow device | Reduce effect complexity |
| Accessibility mode | Provide non-animated alternative |
| Landscape orientation | Center card, maybe allow larger view |

---

## Success Metrics

### Engagement
- % of users who tap to inspect (target: 30%+)
- Average time spent in inspection mode
- Repeat usage (do users come back to inspect?)

### Sharing
- Screenshots taken while in inspection mode
- Shares from collection (if we add share button)

### Sentiment
- App Store reviews mentioning the feature
- Social media mentions

---

## Future Enhancements

1. **Card Backs** — Show movie info, stats, or custom designs on flip
2. **Rarity System** — Different shimmer effects for achievements
3. **Card Frames** — Purchasable/unlockable frame designs
4. **AR Mode** — True AR using camera (very future)
5. **Collection Showcase** — 3D carousel of all your cards
6. **Trading Cards** — Share/trade digital cards with friends

---

## Open Questions

1. Should AI-generated art have a more dramatic holographic effect?
2. Do we want a "card back" with movie info, or keep it simple?
3. Should this work in Collection grid (long-press) for v1?
4. Performance budget — what's acceptable FPS on older devices?

---

## References

- [Pokémon TCG Pocket card inspection](https://www.youtube.com/results?search_query=pokemon+tcg+pocket+card+inspection)
- [React Native Reanimated 3 docs](https://docs.swmansion.com/react-native-reanimated/)
- [Expo Sensors documentation](https://docs.expo.dev/versions/latest/sdk/sensors/)
