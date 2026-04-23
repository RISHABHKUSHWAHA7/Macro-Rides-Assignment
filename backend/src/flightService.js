const IDX = {
  ICAO24: 0,
  CALLSIGN: 1,
  LONGITUDE: 5,
  LATITUDE: 6,
  BARO_ALTITUDE: 7,
  ON_GROUND: 8,
  VELOCITY: 9,
  VERTICAL_RATE: 11,
};

const isAirborne = (state) => {
  const onGround = state[IDX.ON_GROUND];
  const velocity = state[IDX.VELOCITY];
  const altitude = state[IDX.BARO_ALTITUDE];
  const longitude = state[IDX.LONGITUDE];
  const latitude = state[IDX.LATITUDE];

  return (
    onGround === false &&
    typeof velocity === "number" &&
    velocity > 50 &&
    typeof altitude === "number" &&
    altitude > 3000 &&
    typeof longitude === "number" &&
    typeof latitude === "number"
  );
};

const normalizeFlight = (state) => {
  return {
    icao24: String(state[IDX.ICAO24] || "unknown").trim(),
    callsign: String(state[IDX.CALLSIGN] || "UNKNOWN").trim() || "UNKNOWN",
    longitude: state[IDX.LONGITUDE],
    latitude: state[IDX.LATITUDE],
    altitude: state[IDX.BARO_ALTITUDE],
    speed: state[IDX.VELOCITY],
    verticalRate:
      typeof state[IDX.VERTICAL_RATE] === "number"
        ? state[IDX.VERTICAL_RATE]
        : 0,
    trend:
      typeof state[IDX.VERTICAL_RATE] !== "number"
        ? "level"
        : state[IDX.VERTICAL_RATE] > 0
          ? "climbing"
          : state[IDX.VERTICAL_RATE] < 0
            ? "descending"
            : "level",
  };
};

export const extractActiveFlights = (states = []) => {
  const airborneFlights = states.filter(isAirborne).map(normalizeFlight);

  return airborneFlights.slice(0, 2);
};
