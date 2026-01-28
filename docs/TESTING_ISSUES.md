# CineTrak Pre-Launch Issues - January 27, 2025

## 🔴 Critical Bugs (Must Fix Before Launch)

### 1. Scan Upload Still Failing
**Status:** NOT FIXED - Needs Investigation
**Error:**
```
[ScannerScreen] Error processing image: [Error: Something went wrong. Please try again.]
Code: use-scan-ticket.ts line 213
```
**Location:** `hooks/use-scan-ticket.ts`
**Notes:**
- Happens when uploading photo from gallery on iOS simulator
- Auth storage was fixed (switched to AsyncStorage) but error persists
- Need to check edge function logs and debug the actual API call

---

## ✅ Fixed Issues

| Issue | PR | Status |
|-------|-----|--------|
| LinearGradient error on signin | #9 | ✅ Merged |
| HEIC image picker error | #10 | ✅ Merged |
| Modal dark mode theming | #11 | ✅ Merged |
| Coming Soon labels | #12 | ✅ Merged |
| Empty scan state UX | #13 | ✅ Ready to merge |
| Auth SecureStore 2048 byte limit | Direct push | ✅ Merged |
| App icons updated | #8 | ✅ Merged |
| Privacy policy + link | #5, #6 | ✅ Merged |
| Console.log cleanup | #7 | ✅ Merged |
| EAS build config | Direct push | ✅ Merged |

---

## 🟡 New Feature Requests

### Manual Ticket Entry Fallback
**Status:** Not Started
**Trigger:** When user exhausts all 3 daily scans with failed attempts
**Behavior:**
- Show "Manually Enter Ticket" button/option
- Reuse movie search/detail flow to let user manually select the movie
- Still create a theater visit record but without OCR data
- Consider: Should this also decrement scan count or be free?

**Files likely involved:**
- `app/scan/review.tsx` - Add the manual entry option
- `app/(tabs)/scanner.tsx` - May need state for exhausted scans
- Reuse movie search from `app/search.tsx` or movie detail flow

---

## 🟢 Cosmetic Issues (Post-Launch OK)

### Button Theme Colors
- "Want to Watch" and "Watching" buttons on movie detail appear dark in light mode
- Location: `app/movie/[id].tsx`

### Header Button Visibility
- Back/Play buttons hard to see on some movie posters
- Need darker gradient overlay or button backgrounds

---

## 📱 iOS Launch Status

### Completed
- [x] Privacy Policy hosted (Gist)
- [x] Privacy Policy link in settings
- [x] App icons (all platforms)
- [x] Console.log cleanup
- [x] EAS configured
- [x] First build submitted to queue

### Pending
- [ ] **Fix scan upload error** (Critical!)
- [ ] Rebuild with AsyncStorage fix
- [ ] Submit new build to App Store Connect
- [ ] Screenshots for App Store listing
- [ ] App description and keywords
- [ ] Support URL

---

## Build Commands

```bash
# Rebuild for iOS (needed after auth fix)
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios

# Check build status
eas build:list
```
