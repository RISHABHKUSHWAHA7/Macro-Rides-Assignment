import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";

import { config } from "./config.js";
import { extractActiveFlights } from "./flightService.js";
import { getMockFlights } from "./mockFlightService.js";

// Global error handlers to prevent silent crashes
process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION at:", promise, "reason:", reason);
  process.exit(1);
});

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Backend listening on port ${config.port}`);
  console.log(`Environment: PORT=${process.env.PORT}, RAILWAY_PORT=${process.env.RAILWAY_PORT}`);
});

server.on("error", (error) => {
  console.error("Server error:", error);
  process.exit(1);
});

const wss = new WebSocketServer({ server });
let isShuttingDown = false;

let latestSnapshot = {
  type: "flight_update",
  timestamp: new Date().toISOString(),
  flights: [],
  status: "booting",
  message: "Server started, waiting for first poll.",
};

const broadcast = (payload) => {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
};

app.get("/", (_req, res) => {
  console.log("[GET /] Root endpoint called");
  res.json({
    message: "Real-Time Flight Tracker Backend",
    endpoints: {
      health: "/health",
      latest: "/latest",
      websocket: "ws://this-url",
    },
  });
});

app.get("/health", (_req, res) => {
  console.log("[GET /health] Health check called");
  const healthResponse = { ok: true, now: new Date().toISOString() };
  console.log("[GET /health] Responding with:", JSON.stringify(healthResponse));
  res.json(healthResponse);
});

app.get("/latest", (_req, res) => {
  console.log("[GET /latest] Latest flights called");
  console.log("[GET /latest] Responding with:", JSON.stringify(latestSnapshot));
  res.json(latestSnapshot);
});

wss.on("connection", (socket) => {
  console.log("[WebSocket] New client connected. Total clients:", wss.clients.size);
  try {
    socket.send(
      JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }),
    );
    socket.send(JSON.stringify(latestSnapshot));
    console.log("[WebSocket] Sent initial data to client");
  } catch (error) {
    console.error("[WebSocket] Error sending data to new client:", error);
  }

  socket.on("close", () => {
    console.log("[WebSocket] Client disconnected. Remaining clients:", wss.clients.size);
  });

  socket.on("error", (error) => {
    console.error("[WebSocket] Client error:", error);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classify a fetch/network error into a human-readable category so logs are
 * immediately actionable without having to decode raw error messages.
 */
const classifyFetchError = (error) => {
  const msg = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";

  if (name === "TimeoutError" || msg.includes("TimeoutError")) {
    return { kind: "timeout", label: "REQUEST TIMEOUT" };
  }
  if (
    msg.includes("ETIMEDOUT") ||
    msg.includes("Connect Timeout") ||
    msg.includes("connect timeout")
  ) {
    return { kind: "timeout", label: "CONNECTION TIMEOUT" };
  }
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return { kind: "dns", label: "DNS RESOLUTION FAILURE" };
  }
  if (msg.includes("ECONNREFUSED")) {
    return { kind: "refused", label: "CONNECTION REFUSED" };
  }
  if (msg.includes("ECONNRESET") || msg.includes("socket hang up")) {
    return { kind: "reset", label: "CONNECTION RESET" };
  }
  if (msg.includes("401") || msg.includes("403")) {
    return { kind: "auth", label: "AUTHENTICATION / AUTHORISATION ERROR" };
  }
  if (msg.includes("429")) {
    return { kind: "ratelimit", label: "RATE LIMITED (429)" };
  }
  if (msg.includes("5")) {
    return { kind: "server", label: "REMOTE SERVER ERROR (5xx)" };
  }
  return { kind: "unknown", label: "UNKNOWN FETCH ERROR" };
};

/**
 * Sleep for `ms` milliseconds.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch the OpenSky API with automatic retry and exponential backoff.
 *
 * Attempts up to `config.fetchMaxRetries` times (default 3).
 * Delay between attempts: baseDelay * 2^attempt  (1 s, 2 s, 4 s by default).
 *
 * Throws the last error if all attempts are exhausted.
 */
const fetchWithRetry = async (url, fetchOptions) => {
  const maxRetries = config.fetchMaxRetries;
  const baseDelay = config.fetchRetryBaseDelayMs;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s …
      console.log(
        `[POLL] Retry ${attempt}/${maxRetries - 1} — waiting ${delay}ms before next attempt...`,
      );
      await sleep(delay);
    }

    try {
      console.log(
        `[POLL] Fetch attempt ${attempt + 1}/${maxRetries} → ${url}`,
      );
      // Each attempt gets its own fresh AbortSignal so the timeout resets.
      const signal = AbortSignal.timeout(config.fetchTimeoutMs);
      const response = await fetch(url, { ...fetchOptions, signal });

      console.log(
        `[POLL] Attempt ${attempt + 1} — HTTP ${response.status} ${response.statusText}`,
      );

      if (!response.ok) {
        throw new Error(`OpenSky API responded with HTTP ${response.status}`);
      }

      return response; // success — return immediately
    } catch (err) {
      lastError = err;
      const { kind, label } = classifyFetchError(err);

      console.error(
        `[POLL] Attempt ${attempt + 1}/${maxRetries} FAILED — ${label}:`,
        err.message,
      );

      // Do not retry on errors that retrying cannot fix.
      if (kind === "auth" || kind === "ratelimit") {
        console.error(
          "[POLL] Non-retryable error — aborting retry loop early.",
        );
        break;
      }
    }
  }

  throw lastError;
};

// ---------------------------------------------------------------------------
// Main poll function
// ---------------------------------------------------------------------------

const pollFlights = async () => {
  try {
    console.log("[POLL] Starting flight poll cycle...");

    // Resolve the target URL — prepend proxy if configured.
    const targetUrl = config.openSkyProxyUrl
      ? `${config.openSkyProxyUrl}${config.openSkyUrl}`
      : config.openSkyUrl;

    console.log("[POLL] Config - Target URL:", targetUrl);
    console.log(
      "[POLL] Config - Proxy active:",
      !!config.openSkyProxyUrl,
      config.openSkyProxyUrl ? `(${config.openSkyProxyUrl})` : "",
    );
    console.log("[POLL] Config - Username set:", !!config.openSkyUsername);
    console.log("[POLL] Config - Fetch timeout:", config.fetchTimeoutMs, "ms");
    console.log("[POLL] Config - Max retries:", config.fetchMaxRetries);
    console.log("[POLL] Config - Mock on failure:", config.enableMockOnApiFailure);

    const headers = {
      Accept: "application/json",
    };

    if (config.openSkyUsername && config.openSkyPassword) {
      const token = Buffer.from(
        `${config.openSkyUsername}:${config.openSkyPassword}`,
      ).toString("base64");
      headers.Authorization = `Basic ${token}`;
      console.log("[POLL] OpenSky credentials configured");
    } else {
      console.log("[POLL] WARNING: No OpenSky credentials — anonymous rate limits apply");
    }

    console.log("[POLL] Fetching from OpenSky API (with retry)...");
    const response = await fetchWithRetry(targetUrl, { headers });

    const payload = await response.json();
    console.log(
      "[POLL] Received payload with",
      payload?.states?.length || 0,
      "states",
    );

    const flights = extractActiveFlights(payload?.states || []);
    console.log("[POLL] Extracted", flights.length, "active flights");

    latestSnapshot = {
      type: "flight_update",
      timestamp: new Date().toISOString(),
      flights,
      status: flights.length > 0 ? "ok" : "no_active_flights",
      message:
        flights.length > 0
          ? "Live flight positions updated."
          : "No active flights matched filter in this cycle.",
    };

    console.log("[POLL] Broadcasting to", wss.clients.size, "connected clients");
    broadcast(latestSnapshot);
    console.log("[POLL] Poll cycle completed successfully");
  } catch (error) {
    const { kind, label } = classifyFetchError(error);

    console.error(`[POLL] All fetch attempts exhausted — ${label}`);
    console.error("[POLL] Final error:", error instanceof Error ? error.message : error);

    // Emit targeted remediation hints based on the failure type.
    if (kind === "timeout") {
      console.error("[POLL] ⚠️  TIMEOUT — possible causes:");
      console.error("[POLL]   • Railway outbound network is blocked or throttled");
      console.error("[POLL]   • opensky-network.org is unreachable from this region");
      console.error("[POLL]   • Consider setting OPENSKY_PROXY_URL to route via a proxy");
      console.error("[POLL]   • Increase FETCH_TIMEOUT_MS (current:", config.fetchTimeoutMs, "ms)");
    } else if (kind === "dns") {
      console.error("[POLL] ⚠️  DNS FAILURE — opensky-network.org could not be resolved");
      console.error("[POLL]   • Check Railway's DNS / outbound connectivity");
      console.error("[POLL]   • Consider setting OPENSKY_PROXY_URL");
    } else if (kind === "auth") {
      console.error("[POLL] ⚠️  AUTH ERROR — check OPENSKY_USERNAME / OPENSKY_PASSWORD");
    } else if (kind === "ratelimit") {
      console.error("[POLL] ⚠️  RATE LIMITED — add credentials or reduce POLL_INTERVAL_MS");
    } else if (kind === "refused" || kind === "reset") {
      console.error("[POLL] ⚠️  CONNECTION PROBLEM — remote host actively refused/reset");
      console.error("[POLL]   • Consider setting OPENSKY_PROXY_URL");
    }

    const isRateLimited = kind === "ratelimit";

    if (config.enableMockOnApiFailure) {
      console.log("[POLL] Falling back to mock mode");
      latestSnapshot = {
        type: "flight_update",
        timestamp: new Date().toISOString(),
        flights: getMockFlights(),
        status: "mock_mode",
        message: isRateLimited
          ? "OpenSky rate limit hit. Streaming backend mock flights for demo mode."
          : "OpenSky unavailable. Streaming backend mock flights for demo mode.",
        error: error instanceof Error ? error.message : "Unknown error",
        errorKind: kind,
      };

      broadcast(latestSnapshot);
      console.warn("[POLL] Fallback (mock mode) active — error kind:", kind);
      return;
    }

    console.log("[POLL] Setting error state — mock fallback disabled");
    latestSnapshot = {
      type: "flight_update",
      timestamp: new Date().toISOString(),
      flights: [],
      status: "api_error",
      message: isRateLimited
        ? "OpenSky rate limit hit. Add OPENSKY_USERNAME and OPENSKY_PASSWORD in backend .env."
        : "Unable to fetch OpenSky data.",
      error: error instanceof Error ? error.message : "Unknown error",
      errorKind: kind,
    };

    broadcast(latestSnapshot);
    console.error("[POLL] Error state set and broadcasted — error kind:", kind);
  }
};

// Start polling with error handling to prevent startup crash
console.log("\n========================================");
console.log("Starting flight polling service...");
console.log("Config loaded:");
console.log("  - Port:", config.port);
console.log("  - Poll Interval:", config.pollIntervalMs, "ms");
console.log("  - Fetch Timeout:", config.fetchTimeoutMs, "ms");
console.log("  - Max Retries:", config.fetchMaxRetries);
console.log("  - Retry Base Delay:", config.fetchRetryBaseDelayMs, "ms");
console.log("  - OpenSky URL:", config.openSkyUrl);
console.log("  - OpenSky Proxy URL:", config.openSkyProxyUrl || "(none)");
console.log("  - OpenSky Username configured:", !!config.openSkyUsername);
console.log("  - Mock on API failure:", config.enableMockOnApiFailure);
console.log("========================================\n");

try {
  pollFlights().catch((error) => {
    console.error("[STARTUP] Initial poll error (non-fatal):", error);
  });
} catch (error) {
  console.error("[STARTUP] Failed to start polling:", error);
}

const interval = setInterval(() => {
  console.log("[INTERVAL] Running scheduled poll...");
  pollFlights().catch((error) => {
    console.error("[INTERVAL] Poll error:", error);
  });
}, config.pollIntervalMs);

console.log(`[STARTUP] Polling interval set to ${config.pollIntervalMs}ms`);

const shutdown = () => {
  if (isShuttingDown) {
    return;
  }

  console.log("[SHUTDOWN] Shutting down gracefully...");
  isShuttingDown = true;
  clearInterval(interval);

  console.log("[SHUTDOWN] Closing", wss.clients.size, "WebSocket connections...");
  for (const client of wss.clients) {
    try {
      client.terminate();
    } catch (_err) {}
  }

  wss.close(() => {
    console.log("[SHUTDOWN] WebSocket server closed");
    server.close(() => {
      console.log("[SHUTDOWN] HTTP server closed. Exiting...");
      process.exit(0);
    });
  });
};

console.log("[STARTUP] Setting up signal handlers for SIGINT and SIGTERM");
process.once("SIGINT", () => {
  console.log("[SIGNAL] Received SIGINT");
  shutdown();
});
process.once("SIGTERM", () => {
  console.log("[SIGNAL] Received SIGTERM");
  shutdown();
});
