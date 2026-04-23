# Flight Tracker Mobile

## Deployment Note

- The backend is deployed on Railway.
- Set `src/config.js` to your Railway WebSocket URL when using deployed backend data.

## Run

1. Install dependencies:

   npm install

2. Set backend socket URL in `src/config.js`:
   - iOS simulator: ws://localhost:8080
   - Android emulator: ws://10.0.2.2:8080
   - Physical phone: ws://YOUR_LAN_IP:8080

3. Start Expo:

   npm run start

   Or from the project root:

   npm --prefix mobile start

4. Open on emulator/device.

## Notes

- This app gets flight data only from your backend over WebSocket.
- It never calls OpenSky directly.
