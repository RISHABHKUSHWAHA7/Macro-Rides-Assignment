import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8080),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 10000),
  openSkyUrl:
    process.env.OPENSKY_URL ||
    "https://opensky-network.org/api/states/all?lamin=8.0&lomin=68.0&lamax=37.0&lomax=97.0",
  openSkyUsername: process.env.OPENSKY_USERNAME || "",
  openSkyPassword: process.env.OPENSKY_PASSWORD || "",
  enableMockOnApiFailure: process.env.ENABLE_MOCK_ON_API_FAILURE !== "false",
};
