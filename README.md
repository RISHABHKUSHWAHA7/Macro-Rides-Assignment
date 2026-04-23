# Real-Time Flight Tracker

This is a simple flight tracker I built with a Node.js backend and an Expo React Native app. The backend talks to OpenSky, filters the active flights over India, and sends updates to the mobile app over WebSocket. The app itself never calls OpenSky directly.

## What I Built

- A backend that polls OpenSky on a timer, filters the results, and broadcasts the current flight data.
- A React Native app that shows those flights on a map, animates the markers, and shows a small details panel.
- A mock fallback mode so the demo still keeps working if OpenSky is rate-limited or down.

## How It Works

1. The backend fetches the OpenSky `states` array for an India bounding box.
2. `backend/src/flightService.js` keeps only airborne aircraft that match the altitude, speed, and coordinate checks.
3. The backend keeps two flights per update cycle and sends them to every connected WebSocket client.
4. The mobile app listens to that socket, updates the map, and animates marker movement with `AnimatedRegion`.
5. If the socket drops, the app reconnects on its own.

## How To Run The Backend Locally

Prerequisites:

- Node.js 18 or newer
- npm

Commands:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

If OpenSky starts returning repeated `429` errors, add credentials to `backend/.env`:

```bash
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password
```

Fallback mock mode is on by default so the backend can keep streaming demo data when the live API is unavailable:

```bash
ENABLE_MOCK_ON_API_FAILURE=true
```

Set it to `false` if you want live-only behavior.

Backend endpoints:

- Health check: `http://localhost:8080/health`
- Latest snapshot: `http://localhost:8080/latest`
- WebSocket stream: `ws://localhost:8080`

## How To Run The React Native App Locally

Prerequisites:

- Expo Go or an iOS/Android simulator
- npm

Commands:

```bash
cd mobile
npm install
npm run start
```

Before launching on a device or emulator, set the WebSocket URL in `mobile/src/config.js`:

- iOS simulator: `ws://localhost:8080`
- Android emulator: `ws://10.0.2.2:8080`
- Physical device: `ws://<your-laptop-lan-ip>:8080`

## Assumptions And Decisions

- The mobile app only talks to the backend through WebSocket.
- I limited the map to two flights at a time so it stays readable.
- I used a fallback mock stream instead of failing hard when the live API is unavailable.
- The map starts centered on India because the backend query uses the same area.
- The app reconnects automatically so a temporary network issue does not force a restart.

## What I Would Improve With More Time

- Make the UI cleaner, especially the flight list and empty state.
- Keep the last good snapshot so the app has something to show immediately on startup.
- Add more backend validation for unexpected OpenSky payloads.
- Add tests for the filtering logic, socket payload, and reconnect flow.
- Move the polling interval and bounding box into environment settings.

## Project Structure

```text
backend/
  src/
    config.js
    flightService.js
    mockFlightService.js
    server.js
mobile/
  App.js
  src/
    config.js
    utils.js
```

## Notes

- If the live API is unavailable, the backend can stream mock flights for the demo.
- The mobile app only uses backend output.
