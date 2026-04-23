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

const pollFlights = async () => {
  try {
    console.log("[POLL] Starting flight poll cycle...");
    console.log("[POLL] Config - URL:", config.openSkyUrl);
    console.log("[POLL] Config - Username set:", !!config.openSkyUsername);
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
      console.log("[POLL] WARNING: No OpenSky credentials provided!");
    }

    console.log("[POLL] Fetching from OpenSky API...");
    const response = await fetch(config.openSkyUrl, {
      headers,
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
    });

    console.log("[POLL] OpenSky response status:", response.status);

    if (!response.ok) {
      throw new Error(`OpenSky API failed with ${response.status}`);
    }

    const payload = await response.json();
    console.log("[POLL] Received payload with", payload?.states?.length || 0, "states");

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
    console.error("[POLL] Error during poll:", error);
    
    let errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Detect specific error types
    if (errorMessage.includes("Connect Timeout") || errorMessage.includes("ETIMEDOUT")) {
      console.error("[POLL] ⚠️  NETWORK TIMEOUT - Cannot reach OpenSky API");
      console.error("[POLL] This usually means:");
      console.error("[POLL]   1. Railway network blocked outbound connections");
      console.error("[POLL]   2. DNS resolution failed for opensky-network.org");
      console.error("[POLL]   3. OpenSky API is unreachable from your region");
    }
    
    const isRateLimited =
      error instanceof Error &&
      (error.message.includes(" 429") || error.message.includes("429"));

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
      };

      broadcast(latestSnapshot);
      console.warn("[POLL] Fallback (mock mode):", error);
      return;
    }

    console.log("[POLL] Setting error state - no mock fallback enabled");
    latestSnapshot = {
      type: "flight_update",
      timestamp: new Date().toISOString(),
      flights: [],
      status: "api_error",
      message: isRateLimited
        ? "OpenSky rate limit hit. Add OPENSKY_USERNAME and OPENSKY_PASSWORD in backend .env."
        : "Unable to fetch OpenSky data.",
      error: error instanceof Error ? error.message : "Unknown error",
    };

    broadcast(latestSnapshot);
    console.error("[POLL] Error state set and broadcasted");
  }
};

// Start polling with error handling to prevent startup crash
console.log("\n========================================");
console.log("Starting flight polling service...");
console.log("Config loaded:");
console.log("  - Port:", config.port);
console.log("  - Poll Interval:", config.pollIntervalMs, "ms");
console.log("  - OpenSky URL:", config.openSkyUrl);
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
