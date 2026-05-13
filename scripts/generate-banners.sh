#!/usr/bin/env bash
# Generate Imagen-optimized prompts for the 6 PocketStubs platform banners, and
# optionally call the Gemini Imagen API to produce the actual images.
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
# API reference (Imagen 3, GA as of early 2025):
#   https://ai.google.dev/api/images
#   POST https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages
#
# Imagen 4 (imagen-4.0-generate-preview-05-20) is in preview as of May 2026 and
# not yet GA. This script targets Imagen 3 (GA); swap MODEL below when Imagen 4
# reaches GA. Verify current model names at:
#   https://ai.google.dev/gemini-api/docs/imagen

set -euo pipefail

# --- Anchor to cinetrak repo root regardless of caller's pwd ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --- Config ---
# TODO: When Imagen 4 reaches GA, update MODEL to the new model name.
# Check https://ai.google.dev/gemini-api/docs/imagen for the current GA model.
MODEL="imagen-3.0-generate-002"
API_ENDPOINT="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateImages"
OUTPUT_DIR="assets/marketing/banners"
COST_PER_IMAGE="0.04"
IMAGE_COUNT=6

MODE="dry-run"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dry-run | --generate | --help]

  (no flags)   Dry-run: print the 6 platform-specific prompts + cost estimate.
               Does NOT call the Gemini API. Default.
  --dry-run    Same as no flags.
  --generate   Call the Gemini Imagen API to produce 6 PNG banners.
               Prompts for confirmation before spending (~\$${COST_PER_IMAGE}/image × ${IMAGE_COUNT} = ~\$0.24).
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

Estimated cost: ~\$${COST_PER_IMAGE}/image × ${IMAGE_COUNT} images = ~\$0.24

API model: ${MODEL}
API docs:  https://ai.google.dev/api/images
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
for bin in curl jq; do
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
# Format: "platform:filename:width:height:ar_flag:prompt_suffix"
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

# --- Print mode header ---
echo "PocketStubs Banner Generator"
echo "Model: ${MODEL}"
echo "Output: ${OUTPUT_DIR}/"
echo ""

if [[ "$MODE" == "dry-run" ]]; then
  echo "Dry run — no API calls will be made."
  echo "   Run with --generate to spend ~\$0.24 on ${IMAGE_COUNT} images."
  echo ""
fi

# --- Prod-gate confirmation for --generate mode ---
if [[ "$MODE" == "generate" ]]; then
  mkdir -p "${OUTPUT_DIR}"
  read -p "Type 'yes' to spend ~\$0.24 on Gemini API: " confirm
  [[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }
  echo ""
fi

# --- Build and print/execute prompts per platform ---
for entry in "${PLATFORMS[@]}"; do
  IFS=':' read -r platform filename width height <<< "$entry"
  suffix="$(platform_suffix "$platform")"

  FULL_PROMPT="${BASE_MOTIF}. ${BRAND_OVERLAY}. ${suffix}"

  PLATFORM_UPPER="$(printf '%s' "$platform" | tr '[:lower:]' '[:upper:]')"
  echo "--- ${PLATFORM_UPPER} (${width}x${height}) -> ${OUTPUT_DIR}/${filename} ---"
  echo ""
  echo "Prompt:"
  echo "  ${FULL_PROMPT}"
  echo ""
  echo "Estimated cost: ~\$${COST_PER_IMAGE}"
  echo ""

  if [[ "$MODE" == "generate" ]]; then
    # Determine aspect ratio closest to Imagen's supported ratios
    # Imagen 3 supports: 1:1, 9:16, 16:9, 3:4, 4:3
    case "$platform" in
      instagram|tiktok) AR="9:16" ;;
      twitter)          AR="3:1"  ;;   # closest to 3:1; Imagen may approximate
      reddit)           AR="16:1" ;;   # ultra-wide; Imagen will approximate
      youtube)          AR="16:9" ;;
      discord)          AR="16:9" ;;
    esac

    echo "Calling Gemini Imagen API..."

    PAYLOAD=$(jq -n \
      --arg prompt "$FULL_PROMPT" \
      --arg ar "$AR" \
      '{
        prompt: { text: $prompt },
        parameters: {
          sampleCount: 1,
          aspectRatio: $ar,
          outputMimeType: "image/png"
        }
      }')

    RESP_FILE=$(mktemp -t banner-resp.XXXXXX)
    trap "rm -f $RESP_FILE" EXIT

    HTTP_CODE=$(curl -sS -o "$RESP_FILE" -w "%{http_code}" \
      -X POST "${API_ENDPOINT}?key=${GEMINI_API_KEY}" \
      -H "Content-Type: application/json" \
      --data-binary "$PAYLOAD")

    if [[ ! "$HTTP_CODE" =~ ^2 ]]; then
      echo "❌ API error (HTTP ${HTTP_CODE}) for ${platform}. Response:" >&2
      cat "$RESP_FILE" >&2
      echo "" >&2
      echo "See API docs: https://ai.google.dev/api/images" >&2
      exit 1
    fi

    # Extract base64 image data and decode to PNG
    mkdir -p "${OUTPUT_DIR}"
    IMAGE_B64=$(jq -r '.predictions[0].bytesBase64Encoded // .images[0].bytesBase64Encoded // empty' "$RESP_FILE")
    if [[ -z "$IMAGE_B64" ]]; then
      echo "❌ Could not parse image data from API response for ${platform}." >&2
      echo "Raw response:" >&2
      cat "$RESP_FILE" >&2
      echo "" >&2
      echo "The Imagen API response shape may have changed. See:" >&2
      echo "  https://ai.google.dev/api/images" >&2
      exit 1
    fi

    echo "$IMAGE_B64" | base64 --decode > "${OUTPUT_DIR}/${filename}"
    echo "✅ Saved: ${OUTPUT_DIR}/${filename}"
    echo ""
  fi
done

# --- Cost summary ---
TOTAL_COST=$(printf "%.2f" "$(echo "${COST_PER_IMAGE} * ${IMAGE_COUNT}" | bc -l 2>/dev/null || echo "0.24")" 2>/dev/null || echo "0.24")
echo "--- Summary ---"
echo "Images: ${IMAGE_COUNT}"
echo "Estimated cost: ~\$${TOTAL_COST}"
echo "Output dir: ${OUTPUT_DIR}/"
echo ""

if [[ "$MODE" == "dry-run" ]]; then
  echo "To generate images: ./scripts/generate-banners.sh --generate"
  echo "Or via Doppler:     doppler run -- ./scripts/generate-banners.sh --generate"
fi
