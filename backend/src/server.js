import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";

import { config } from "./config.js";
import { extractActiveFlights } from "./flightService.js";
import { getMockFlights } from "./mockFlightService.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get("/latest", (_req, res) => {
  res.json(latestSnapshot);
});

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }),
  );
  socket.send(JSON.stringify(latestSnapshot));
});

const pollFlights = async () => {
  try {
    const headers = {
      Accept: "application/json",
    };

    if (config.openSkyUsername && config.openSkyPassword) {
      const token = Buffer.from(
        `${config.openSkyUsername}:${config.openSkyPassword}`,
      ).toString("base64");
      headers.Authorization = `Basic ${token}`;
    }

    const response = await fetch(config.openSkyUrl, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`OpenSky API failed with ${response.status}`);
    }

    const payload = await response.json();
    const flights = extractActiveFlights(payload?.states || []);

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

    broadcast(latestSnapshot);
  } catch (error) {
    const isRateLimited =
      error instanceof Error &&
      (error.message.includes(" 429") || error.message.includes("429"));

    if (config.enableMockOnApiFailure) {
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
      console.warn("Polling fallback (mock mode):", error);
      return;
    }

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
    console.error("Polling error:", error);
  }
};

pollFlights();
const interval = setInterval(pollFlights, config.pollIntervalMs);

const shutdown = () => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  clearInterval(interval);

  for (const client of wss.clients) {
    try {
      client.terminate();
    } catch (_err) {}
  }

  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
