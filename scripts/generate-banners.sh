#!/usr/bin/env bash
# Generate image prompts for the 6 PocketStubs platform banners, and
# optionally call the Gemini Nano Banana API to produce the actual images.
#
# Banner Design Spec: evermind vault → Projects/PocketStubs/Business/Banner Design Spec.md
#
# Usage:
#   scripts/generate-banners.sh              # dry-run (default) — prints prompts + cost
#   scripts/generate-banners.sh --dry-run    # explicit dry-run
#   scripts/generate-banners.sh --generate   # calls Gemini API (spends ~$0.24)
#   scripts/generate-banners.sh --help       # show usage
#
# Prereqs:
#   - GEMINI_API_KEY in env (already in Doppler project=pocketstubs). If missing:
#       doppler secrets set GEMINI_API_KEY --project pocketstubs --config dev
#   - curl + jq on PATH
#
# Output: assets/marketing/banners/<platform>-banner.png
#
# API reference (Nano Banana / gemini-2.5-flash-image, GA):
#   https://ai.google.dev/gemini-api/docs/image-generation
#   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent
#
# Model history:
#   - Original script targeted imagen-3.0-generate-002 (:generateImages endpoint),
#     which returns HTTP 404 on generativelanguage.googleapis.com — Imagen 3/4 are
#     primarily Vertex AI models and are not accessible via flat API-key auth.
#   - Swapped (May 2026) to gemini-2.5-flash-image ("Nano Banana", stable/GA),
#     which IS accessible on the standard Gemini API with an API key.
#   - TODO: When gemini-2.5-flash-image-pro (or equivalent "Nano Banana Pro") reaches
#     GA + API-key access on generativelanguage.googleapis.com, swap MODEL below.
#     Check: https://ai.google.dev/gemini-api/docs/models
#
# For VIDEO content automation (MA2 phase), use Veo via the Gemini API —
# different model name and a different request/response shape from image generation.
#
# Design note: prompts below are derived from Projects/PocketStubs/Business/Banner Design Spec.md
# in the vault but are EMBEDDED here (not read at runtime). Reasons:
# 1. The Banner Design Spec is locked — motif + tagline + per-platform sizes don't change
#    between branding cycles. Embedding makes the script self-contained and reviewable.
# 2. This script runs once per branding cycle (not per content piece), so spec drift
#    isn't an ongoing risk.
# 3. If the spec changes, regenerate this script's prompt block from the updated vault file.
#
# If we later need event-driven banner generation (e.g., movie-release-aware art per MA4),
# we'll wire up a runtime spec read at that point. YAGNI for now.

set -euo pipefail

# --- Anchor to cinetrak repo root regardless of caller's pwd ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Config ---
# Nano Banana (stable/GA) — accessible via API key on generativelanguage.googleapis.com.
# Request shape: :generateContent with responseModalities: ["IMAGE"]
# Response shape: candidates[0].content.parts[].inlineData.{mimeType,data} (base64)
# TODO: Swap to Pro variant when GA + API-key-accessible.
MODEL="gemini-2.5-flash-image"
API_ENDPOINT="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent"
OUTPUT_DIR="assets/marketing/banners"
COST_PER_IMAGE="0.039"
IMAGE_COUNT=6

MODE="dry-run"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dry-run | --generate | --help]

  (no flags)   Dry-run: print the 6 platform-specific prompts + cost estimate.
               Does NOT call the Gemini API. Default.
  --dry-run    Same as no flags.
  --generate   Call the Gemini Nano Banana API to produce 6 PNG banners.
               Prompts for confirmation before spending (~\$${COST_PER_IMAGE}/image × ${IMAGE_COUNT} = ~\$0.23).
  --help       Show this message.

Reads GEMINI_API_KEY from env (Doppler-injected for the pocketstubs project).
If missing, prints the doppler secrets set recovery command.

Output directory: ${OUTPUT_DIR}/
Output files:
  instagram-story-banner.png   (1080×1920 — story highlight cover)
  tiktok-banner.png            (1080×1920 — profile cover)
  twitter-banner.png           (1500×500  — header)
  reddit-banner.png            (4028×256  — subreddit banner)
  youtube-banner.png           (2560×1440 — channel art)
  discord-banner.png           (1920×1080 — server banner)

Estimated cost: ~\$${COST_PER_IMAGE}/image × ${IMAGE_COUNT} images = ~\$0.23

API model:    ${MODEL}
API endpoint: ${API_ENDPOINT}
API docs:     https://ai.google.dev/gemini-api/docs/image-generation
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  MODE="dry-run";  shift ;;
    --generate) MODE="generate"; shift ;;
    --help|-h)  usage ;;
    *) echo "Unknown flag: $1" >&2; usage ;;
  esac
done

# --- Verify prereq binaries ---
for bin in curl jq base64; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "❌ Missing required binary: $bin" >&2
    exit 1
  fi
done

# --- Token check ---
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  cat <<EOF >&2
❌ MISSING TOKEN: GEMINI_API_KEY is not set.

It is already stored in Doppler. Re-run via:

  doppler run -- ./scripts/generate-banners.sh${MODE:+ --$MODE}

If the key is missing from Doppler, add it:

  doppler secrets set GEMINI_API_KEY --project pocketstubs --config dev
EOF
  exit 1
fi

# --- Base motif description (from Banner Design Spec — LOCKED) ---
# All prompts adapt this core motif to their platform's aspect ratio and safe zone.
BASE_MOTIF="dozens of vintage movie ticket stubs scattered across dark black velvet, overhead shot, warm amber and rose lighting, some stubs slightly torn, varying sizes and angles, film grain texture, cinematic color grading with deep blacks #09090b and subtle crimson highlights #e11d48, no text visible on stubs, photorealistic, ultra high detail, 8k"

# Brand constants
BRAND_OVERLAY="PocketStubs brand — clean geometric sans typography, rose-crimson accent #e11d48 on near-black #09090b background, premium cinematic mood, not corporate, not cartoon"
TAGLINE="Your movie journey, tracked."

# --- Platform prompt definitions ---
# Format: "platform:filename:width:height"
# Each prompt adapts the base motif to the platform's aspect ratio and safe zone needs.

declare -a PLATFORMS=(
  "instagram:instagram-story-banner.png:1080:1920"
  "tiktok:tiktok-banner.png:1080:1920"
  "twitter:twitter-banner.png:1500:500"
  "reddit:reddit-banner.png:4028:256"
  "youtube:youtube-banner.png:2560:1440"
  "discord:discord-banner.png:1920:1080"
)

# Returns the per-platform prompt suffix given a platform name.
# Using a case statement avoids declare -A associative array incompatibilities
# with set -u on macOS bash 3.x.
platform_suffix() {
  local platform="$1"
  case "$platform" in
    instagram)
      printf '%s' "Vertical portrait composition for story highlight cover. Icon-only style — a single prominent ticket stub centered in the safe zone (center 900x1200 of 1080x1920). White or rose on black. No text. Clean minimal design that reads clearly as a small circular icon."
      ;;
    tiktok)
      printf '%s' "Vertical portrait 1080x1920 profile cover. All critical content concentrated in the center safe zone (720x1080). Avoid bottom 200px (username overlay). Logo and tagline 'Your movie journey, tracked.' stacked vertically in center. Heavy crop beyond safe zone — keep mosaic as atmospheric background only."
      ;;
    twitter)
      printf '%s' "Wide horizontal banner 1500x500. Profile picture covers bottom-left ~400px x 400px — keep left quarter clear. Priority real estate is right ~900px. Tagline center-right. Small logo can repeat in corner. Horizontal composition with ticket stubs sweeping left to right."
      ;;
    reddit)
      printf '%s' "Ultra-wide horizontal banner 4028x256 for subreddit header. Horizontally repeating motif — ticket stubs in a continuous row across the full width. Marquee-light strip aesthetic works well here. Nothing centered-only; the design must tile and scale gracefully across the full width."
      ;;
    youtube)
      printf '%s' "Wide 2560x1440 channel art. Logo and tagline 'Your movie journey, tracked.' placed only within the mobile-safe center band (1546x423 centered). Include text 'Movie journeys tracked' as secondary CTA in the center band. Treat everything outside the center band as atmospheric bleed — full ticket-stub mosaic extends to edges."
      ;;
    discord)
      printf '%s' "Widescreen 1920x1080 server banner. Simple, not text-heavy — compression destroys fine detail. Bold composition. The banner appears above the server name in the sidebar so must read at small scale. Minimal text, maximum visual impact from the ticket-stub motif."
      ;;
    *)
      echo "Error: Unknown platform: ${platform}" >&2
      exit 1
      ;;
  esac
}

# Returns the aspect ratio hint to embed in the prompt for each platform.
# gemini-2.5-flash-image does NOT support responseFormat.image.aspectRatio
# (that field is only supported by the 3.x preview models). We guide composition
# via the prompt instead — the model respects aspect ratio language in text.
# When upgrading to gemini-3.x or gemini-2.5-flash-image-pro, you can add:
#   "generationConfig": { "responseFormat": { "image": { "aspectRatio": "9:16" } } }
platform_aspect_hint() {
  local platform="$1"
  case "$platform" in
    instagram|tiktok) printf '%s' "Aspect ratio 9:16 vertical portrait." ;;
    twitter)          printf '%s' "Aspect ratio 3:1 wide horizontal landscape." ;;
    reddit)           printf '%s' "Aspect ratio 16:1 ultra-wide horizontal strip." ;;
    youtube)          printf '%s' "Aspect ratio 16:9 wide landscape." ;;
    discord)          printf '%s' "Aspect ratio 16:9 wide landscape." ;;
  esac
}

# --- Print mode header ---
echo "PocketStubs Banner Generator"
echo "Model: ${MODEL}"
echo "Output: ${OUTPUT_DIR}/"
echo ""

if [[ "$MODE" == "dry-run" ]]; then
  echo "Dry run — no API calls will be made."
  echo "   Run with --generate to spend ~\$0.23 on ${IMAGE_COUNT} images."
  echo ""
fi

# --- Prod-gate confirmation for --generate mode ---
if [[ "$MODE" == "generate" ]]; then
  mkdir -p "${OUTPUT_DIR}"
  read -rp "Type 'yes' to spend ~\$0.23 on Gemini API (${IMAGE_COUNT} images @ ~\$${COST_PER_IMAGE} each): " confirm
  [[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }
  echo ""
fi

# --- Build and print/execute prompts per platform ---
# Collect all tempfiles in an array; set ONE trap before the loop so all are
# cleaned up on exit regardless of which iteration created them.
TEMP_FILES=()
trap '[[ ${#TEMP_FILES[@]} -gt 0 ]] && rm -f "${TEMP_FILES[@]}"' EXIT

for entry in "${PLATFORMS[@]}"; do
  IFS=':' read -r platform filename width height <<< "$entry"
  suffix="$(platform_suffix "$platform")"
  ar_hint="$(platform_aspect_hint "$platform")"

  FULL_PROMPT="${BASE_MOTIF}. ${BRAND_OVERLAY}. ${ar_hint} ${suffix}"

  PLATFORM_UPPER="$(printf '%s' "$platform" | tr '[:lower:]' '[:upper:]')"
  echo "--- ${PLATFORM_UPPER} (${width}x${height}) -> ${OUTPUT_DIR}/${filename} ---"
  echo ""
  echo "Prompt:"
  echo "  ${FULL_PROMPT}"
  echo ""
  echo "Estimated cost: ~\$${COST_PER_IMAGE}"
  echo ""

  if [[ "$MODE" == "generate" ]]; then
    echo "Calling Gemini Nano Banana API (${MODEL})..."

    # Nano Banana (gemini-2.5-flash-image) uses :generateContent with
    # responseModalities: ["IMAGE"]. It does NOT support responseFormat.image.aspectRatio
    # (that field is only available on 3.x preview models). Aspect ratio is guided
    # via the prompt text (ar_hint injected into FULL_PROMPT above).
    # Response: candidates[0].content.parts[].inlineData.{mimeType,data} (base64 PNG).
    PAYLOAD=$(jq -n \
      --arg prompt "$FULL_PROMPT" \
      '{
        contents: [{
          parts: [{ text: $prompt }]
        }],
        generationConfig: {
          responseModalities: ["IMAGE"]
        }
      }')

    RESP_FILE=$(mktemp -t banner-resp.XXXXXX)
    TEMP_FILES+=("$RESP_FILE")

    HTTP_CODE=$(curl -sS -o "$RESP_FILE" -w "%{http_code}" \
      -X POST "${API_ENDPOINT}?key=${GEMINI_API_KEY}" \
      -H "Content-Type: application/json" \
      --data-binary "$PAYLOAD")

    if [[ ! "$HTTP_CODE" =~ ^2 ]]; then
      echo "❌ API error (HTTP ${HTTP_CODE}) for ${platform}. Response:" >&2
      cat "$RESP_FILE" >&2
      echo "" >&2
      echo "See API docs: https://ai.google.dev/gemini-api/docs/image-generation" >&2
      exit 1
    fi

    # Extract base64 image data from inlineData and decode to PNG.
    # Response shape: candidates[0].content.parts[] — some parts are text, some are inlineData.
    # We select the part that has an inlineData field and extract its base64 data.
    OUTPUT_PATH="${OUTPUT_DIR}/${filename}"
    IMAGE_B64=$(jq -r '.candidates[0].content.parts[] | select(.inlineData) | .inlineData.data' "$RESP_FILE")

    if [[ -z "$IMAGE_B64" ]]; then
      echo "❌ Could not parse image data from API response for ${platform}." >&2
      echo "Raw response:" >&2
      cat "$RESP_FILE" >&2
      echo "" >&2
      echo "The Nano Banana response shape may have changed. See:" >&2
      echo "  https://ai.google.dev/gemini-api/docs/image-generation" >&2
      exit 1
    fi

    printf '%s' "$IMAGE_B64" | base64 --decode > "$OUTPUT_PATH"
    SIZE=$(wc -c < "$OUTPUT_PATH" | tr -d ' ')
    echo "✅ Saved: ${OUTPUT_PATH} (${SIZE} bytes)"
    echo ""
  fi
done

# --- Cost summary ---
TOTAL_COST=$(printf "%.2f" "$(echo "${COST_PER_IMAGE} * ${IMAGE_COUNT}" | bc -l 2>/dev/null || echo "0.23")" 2>/dev/null || echo "0.23")
echo "--- Summary ---"
echo "Images: ${IMAGE_COUNT}"
echo "Estimated cost: ~\$${TOTAL_COST}"
echo "Output dir: ${OUTPUT_DIR}/"
echo ""

if [[ "$MODE" == "dry-run" ]]; then
  echo "To generate images: ./scripts/generate-banners.sh --generate"
  echo "Or via Doppler:     doppler run -- ./scripts/generate-banners.sh --generate"
fi
