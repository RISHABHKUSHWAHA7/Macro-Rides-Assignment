const createSeedFlights = () => {
  return [
    {
      icao24: "mock001",
      callsign: "FlightA1",
      latitude: 19.076,
      longitude: 72.8777,
      altitude: 9800,
      speed: 235,
      verticalRate: 2.4,
    },
    {
      icao24: "mock002",
      callsign: "FlightB2",
      latitude: 28.7041,
      longitude: 77.1025,
      altitude: 10400,
      speed: 248,
      verticalRate: -1.8,
    },
  ];
};

let mockFlights = createSeedFlights();

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const computeTrend = (verticalRate) => {
  if (verticalRate > 0) return "climbing";
  if (verticalRate < 0) return "descending";
  return "level";
};

export const getMockFlights = () => {
  mockFlights = mockFlights.map((flight, index) => {
    const direction = index === 0 ? 1 : -1;
    const nextVerticalRate = clamp(
      flight.verticalRate + (Math.random() - 0.5) * 0.8,
      -8,
      8,
    );
    const nextSpeed = clamp(
      flight.speed + (Math.random() - 0.5) * 10,
      180,
      290,
    );

    return {
      ...flight,
      latitude: flight.latitude + 0.03 * direction,
      longitude: flight.longitude + 0.04 * direction,
      altitude: clamp(flight.altitude + nextVerticalRate * 35, 3500, 12500),
      speed: Math.round(nextSpeed),
      verticalRate: Number(nextVerticalRate.toFixed(2)),
      trend: computeTrend(nextVerticalRate),
    };
  });

  return mockFlights;
};
