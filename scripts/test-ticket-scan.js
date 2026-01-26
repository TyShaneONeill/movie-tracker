/**
 * Ticket Scanner Test Script
 * Tests Gemini Flash vision API with movie ticket images
 *
 * Usage: GEMINI_API_KEY=your_key node scripts/test-ticket-scan.js [image_path] [--model <model_name>] [--process] [--json]
 *
 * Options:
 *   --model <name>   Use a specific Gemini model
 *   --process        Run extracted tickets through post-processor (requires test-processor.js)
 *   --json           Output raw JSON only (useful for piping to test-processor.js)
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Configuration
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_FALLBACKS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"];
const MAX_RETRIES = 2;

// Parse command line flags
function parseFlags() {
  const args = process.argv.slice(2);
  const flags = {
    model: null,
    process: false,
    json: false,
    imagePath: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      flags.model = args[i + 1];
      i++;
    } else if (args[i] === "--process") {
      flags.process = true;
    } else if (args[i] === "--json") {
      flags.json = true;
    } else if (!args[i].startsWith("--")) {
      flags.imagePath = args[i];
    }
  }

  return flags;
}

// Sleep helper for retry delays
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extract retry delay from 429 error (in milliseconds)
function getRetryDelay(error) {
  // Try to extract retry-after from error message or default to 60 seconds
  const match = error.message?.match(/retry after (\d+)/i);
  if (match) {
    return parseInt(match[1], 10) * 1000;
  }
  // Check for retryDelay in error details
  if (error.retryDelay) {
    return error.retryDelay;
  }
  // Default to 60 seconds for rate limit errors
  return 60000;
}

// Default test image
const DEFAULT_IMAGE = path.join(
  __dirname,
  "../example-theater-tickets/ex-multi-ticket-iPhone17ProMax.HEIC"
);

// The extraction prompt - this is the magic sauce
const EXTRACTION_PROMPT = `You are a movie ticket data extraction assistant. Analyze this image of movie ticket(s) and extract ALL ticket information you can find.

For EACH ticket visible in the image, extract the following information into a JSON object:

{
  "tickets": [
    {
      "movie_title": "The exact movie title as shown on the ticket",
      "theater_name": "Full theater name",
      "theater_chain": "Chain name if recognizable (AMC, Regal, Cinemark, etc.) or null",
      "date": "YYYY-MM-DD format",
      "showtime": "HH:MM in 24-hour format",
      "seat": {
        "row": "Row letter or number, or null if not shown",
        "number": "Seat number, or null if not shown"
      },
      "auditorium": "Theater/auditorium number or name, or null",
      "format": "IMAX, Dolby, 3D, Standard, or null if not specified",
      "price": {
        "amount": "Numeric price or null",
        "currency": "USD or appropriate currency"
      },
      "ticket_type": "Adult, Child, Senior, Matinee, or null",
      "confirmation_number": "Booking/confirmation number or null",
      "barcode_visible": true/false
    }
  ],
  "image_quality": "good/fair/poor",
  "confidence_score": 0.0-1.0,
  "notes": "Any relevant observations about the tickets or extraction challenges"
}

Important instructions:
1. Extract ALL tickets visible in the image, even if some information is partial
2. If a field is not visible or readable, use null
3. Be precise with movie titles - don't guess or autocorrect
4. For dates, convert any format to YYYY-MM-DD
5. For times, convert to 24-hour format
6. If you see multiple tickets for the same movie (e.g., 2 seats), create separate entries
7. Set confidence_score based on image quality and how much data you could extract

Return ONLY valid JSON, no markdown formatting or explanation.`;

// Try a single API call with retry logic for 429 errors
async function tryModelWithRetries(genAI, modelName, base64Image, mimeType, startTime, jsonMode = false) {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0 && !jsonMode) {
        console.log(`   Retry attempt ${attempt}/${MAX_RETRIES} for ${modelName}...`);
      }

      const result = await model.generateContent([
        EXTRACTION_PROMPT,
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image,
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();
      return { success: true, text, modelName };
    } catch (error) {
      lastError = error;
      const is429 = error.status === 429 || error.message?.includes("429") || error.message?.toLowerCase().includes("rate limit");

      if (is429 && attempt < MAX_RETRIES) {
        const delayMs = getRetryDelay(error);
        if (!jsonMode) {
          console.log(`   Rate limited (429). Waiting ${(delayMs / 1000).toFixed(0)}s before retry...`);
        }
        await sleep(delayMs);
      } else {
        break;
      }
    }
  }

  return { success: false, error: lastError, modelName };
}

// Clean JSON response from markdown code blocks
function cleanJsonResponse(text) {
  let cleanJson = text.trim();
  if (cleanJson.startsWith("```json")) {
    cleanJson = cleanJson.slice(7);
  }
  if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.slice(3);
  }
  if (cleanJson.endsWith("```")) {
    cleanJson = cleanJson.slice(0, -3);
  }
  return cleanJson.trim();
}

// Run the post-processor script
function runPostProcessor(jsonData) {
  return new Promise((resolve, reject) => {
    const processorPath = path.join(__dirname, "test-processor.js");

    if (!fs.existsSync(processorPath)) {
      reject(new Error(`Post-processor script not found: ${processorPath}`));
      return;
    }

    const child = spawn("node", [processorPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Post-processor exited with code ${code}: ${stderr}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    // Send JSON data to stdin
    child.stdin.write(JSON.stringify(jsonData));
    child.stdin.end();
  });
}

async function extractTicketData(imagePath, specifiedModel = null, jsonMode = false, processMode = false) {
  if (!API_KEY) {
    if (jsonMode) {
      console.error(JSON.stringify({ error: "GEMINI_API_KEY environment variable not set" }));
    } else {
      console.error("Error: GEMINI_API_KEY environment variable not set");
      console.log("\nUsage:");
      console.log(
        "  GEMINI_API_KEY=your_key node scripts/test-ticket-scan.js [image_path] [--model <model_name>] [--process] [--json]"
      );
    }
    process.exit(1);
  }

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(API_KEY);

  // Read and encode image
  if (!jsonMode) {
    console.log(`\nReading image: ${imagePath}`);
  }
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  // Determine MIME type
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
  };
  const mimeType = mimeTypes[ext] || "image/jpeg";

  if (!jsonMode) {
    console.log(`Image size: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`MIME type: ${mimeType}`);
  }

  // Determine which models to try
  const modelsToTry = specifiedModel ? [specifiedModel] : MODEL_FALLBACKS;
  if (!jsonMode) {
    console.log(`Model(s): ${modelsToTry.join(" -> ")}`);
    console.log(`\nSending to Gemini...\n`);
  }

  const startTime = Date.now();
  let successfulModel = null;
  let responseText = null;

  // Try each model in the fallback list
  for (const modelName of modelsToTry) {
    if (!jsonMode) {
      console.log(`Trying model: ${modelName}`);
    }

    const result = await tryModelWithRetries(genAI, modelName, base64Image, mimeType, startTime, jsonMode);

    if (result.success) {
      successfulModel = modelName;
      responseText = result.text;
      break;
    } else {
      const errorMsg = result.error?.message || "Unknown error";
      if (!jsonMode) {
        console.log(`   ${modelName} failed: ${errorMsg}`);

        if (modelsToTry.indexOf(modelName) < modelsToTry.length - 1) {
          console.log(`   Falling back to next model...\n`);
        }
      }
    }
  }

  if (!successfulModel) {
    if (jsonMode) {
      console.error(JSON.stringify({ error: "All models failed" }));
    } else {
      console.error("All models failed");
      console.log("\nMake sure your API key is valid and has access to Gemini.");
    }
    throw new Error("All models exhausted");
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // Try to parse as JSON
  let parsed = null;
  try {
    const cleanJson = cleanJsonResponse(responseText);
    parsed = JSON.parse(cleanJson);
  } catch (parseError) {
    if (jsonMode) {
      console.error(JSON.stringify({ error: "Could not parse response as JSON", raw: responseText }));
    } else {
      console.log("\nCould not parse response as JSON");
      console.log("Parse error:", parseError.message);
      console.log("\nRAW RESPONSE:");
      console.log("-".repeat(60));
      console.log(responseText);
      console.log("-".repeat(60));
    }
    return { raw: responseText, parseError: parseError.message };
  }

  // JSON-only mode: just output the parsed JSON
  if (jsonMode) {
    console.log(JSON.stringify(parsed, null, 2));
    return parsed;
  }

  // Normal output mode
  console.log(`\nResponse received in ${elapsed}s\n`);
  console.log("-".repeat(60));
  console.log("RAW RESPONSE:");
  console.log("-".repeat(60));
  console.log(responseText);
  console.log("-".repeat(60));

  console.log("\nPARSED JSON:");
  console.log("-".repeat(60));
  console.log(JSON.stringify(parsed, null, 2));
  console.log("-".repeat(60));

  // Summary
  if (parsed.tickets) {
    console.log(`\nSUMMARY:`);
    console.log(`   Tickets found: ${parsed.tickets.length}`);
    console.log(`   Image quality: ${parsed.image_quality}`);
    console.log(`   Confidence: ${(parsed.confidence_score * 100).toFixed(0)}%`);
    console.log(`\nMOVIES EXTRACTED:`);
    parsed.tickets.forEach((ticket, i) => {
      console.log(
        `   ${i + 1}. "${ticket.movie_title}" at ${ticket.theater_name}`
      );
      console.log(
        `      ${ticket.date} @ ${ticket.showtime} | Seat ${ticket.seat?.row || "?"}${ticket.seat?.number || "?"} | ${ticket.format || "Standard"}`
      );
    });
  }

  console.log(`\nModel used: ${successfulModel}`);

  // If --process flag is set, run the post-processor
  if (processMode) {
    console.log("\n" + "=".repeat(60));
    console.log("POST-PROCESSING RESULTS");
    console.log("=".repeat(60));

    try {
      const processorOutput = await runPostProcessor(parsed);
      console.log(processorOutput);
    } catch (error) {
      console.error(`\nPost-processor error: ${error.message}`);
      console.log("\nTo use --process, make sure test-processor.js exists in the scripts directory.");
    }
  }

  return parsed;
}

// Run the test
const flags = parseFlags();
const imagePath = flags.imagePath || DEFAULT_IMAGE;

if (!fs.existsSync(imagePath)) {
  if (flags.json) {
    console.error(JSON.stringify({ error: `Image not found: ${imagePath}` }));
  } else {
    console.error(`Image not found: ${imagePath}`);
  }
  process.exit(1);
}

extractTicketData(imagePath, flags.model, flags.json, flags.process)
  .then(() => {
    if (!flags.json) {
      console.log("\nTest complete!");
    }
  })
  .catch((error) => {
    if (flags.json) {
      console.error(JSON.stringify({ error: error.message }));
    } else {
      console.error("\nTest failed:", error.message);
    }
    process.exit(1);
  });
