import dotenv from "dotenv";

dotenv.config();

// Validate and parse PORT with strict range checking
const parsePort = (portStr) => {
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 0 || port > 65535) {
    throw new Error(
      `Invalid PORT: ${portStr}. Must be an integer between 0 and 65535. Got: ${port}`
    );
  }
  return port;
};

const portEnv = process.env.PORT || process.env.RAILWAY_PORT || "8080";
let port = 8080;

try {
  port = parsePort(portEnv);
  console.log(`[CONFIG] PORT validated: ${port}`);
} catch (error) {
  console.error(`[CONFIG] ${error.message}`);
  console.error(`[CONFIG] Falling back to port 8080`);
  port = 8080;
}

export const config = {
  port,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 10000),
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS || 30000), // 30 seconds for Railway
  openSkyUrl:
    process.env.OPENSKY_URL ||
    "https://opensky-network.org/api/states/all?lamin=8.0&lomin=68.0&lamax=37.0&lomax=97.0",
  // Optional proxy URL. When set, requests are routed as:
  //   <OPENSKY_PROXY_URL><openSkyUrl>
  // e.g. OPENSKY_PROXY_URL=https://my-proxy.example.com/fetch?url=
  openSkyProxyUrl: process.env.OPENSKY_PROXY_URL || "",
  openSkyUsername: process.env.OPENSKY_USERNAME || "",
  openSkyPassword: process.env.OPENSKY_PASSWORD || "",
  enableMockOnApiFailure: process.env.ENABLE_MOCK_ON_API_FAILURE !== "false",
  // Retry settings for the OpenSky fetch
  fetchMaxRetries: Number(process.env.FETCH_MAX_RETRIES || 3),
  fetchRetryBaseDelayMs: Number(process.env.FETCH_RETRY_BASE_DELAY_MS || 1000),
};
