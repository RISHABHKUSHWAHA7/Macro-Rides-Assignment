import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  FlatList,
  Platform,
} from "react-native";
import MapView, { AnimatedRegion, MarkerAnimated } from "react-native-maps";
import { StatusBar } from "expo-status-bar";

import { INITIAL_REGION, WS_URL } from "./src/config";
import { formatMeters, formatSpeed, trendLabel } from "./src/utils";

const RECONNECT_DELAY_MS = 3000;
const POLL_INTERVAL_MS = 10000; // Backend polls every 10 seconds

export default function App() {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const markerRegionsRef = useRef(new Map());

  const [flights, setFlights] = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [serverStatus, setServerStatus] = useState("booting");
  const [serverMessage, setServerMessage] = useState(
    "Connecting to backend...",
  );
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [nextUpdateIn, setNextUpdateIn] = useState(POLL_INTERVAL_MS / 1000);

  const connect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionState("connecting");
    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;

    socket.onopen = () => {
      setConnectionState("connected");
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type !== "flight_update") {
          return;
        }

        // Update timestamp for timer
        setLastUpdateTime(new Date());
        setNextUpdateIn(Math.ceil(POLL_INTERVAL_MS / 1000));

        setServerStatus(payload.status || "unknown");
        setServerMessage(payload.message || "");

        const nextFlights = Array.isArray(payload.flights)
          ? payload.flights
          : [];

        nextFlights.forEach((flight) => {
          const existing = markerRegionsRef.current.get(flight.icao24);

          if (!existing) {
            markerRegionsRef.current.set(
              flight.icao24,
              new AnimatedRegion({
                latitude: flight.latitude,
                longitude: flight.longitude,
                latitudeDelta: 0,
                longitudeDelta: 0,
              }),
            );
          } else {
            existing
              .timing({
                latitude: flight.latitude,
                longitude: flight.longitude,
                duration: 900,
                useNativeDriver: false,
              })
              .start();
          }
        });

        for (const key of markerRegionsRef.current.keys()) {
          if (!nextFlights.find((f) => f.icao24 === key)) {
            markerRegionsRef.current.delete(key);
          }
        }

        setFlights(nextFlights);
      } catch (_err) {}
    };

    socket.onerror = () => {
      setConnectionState("error");
    };

    socket.onclose = () => {
      setConnectionState("disconnected");
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, RECONNECT_DELAY_MS);
    };
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Timer to show countdown to next update
  useEffect(() => {
    countdownTimerRef.current = setInterval(() => {
      if (lastUpdateTime) {
        const now = new Date();
        const elapsedMs = now - lastUpdateTime;
        const remainingMs = POLL_INTERVAL_MS - (elapsedMs % POLL_INTERVAL_MS);
        const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        setNextUpdateIn(remainingSeconds);
      }
    }, 100); // Update every 100ms for smooth countdown

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [lastUpdateTime]);

  const statusText = useMemo(() => {
    if (connectionState === "connecting") return "Connecting to server...";
    if (connectionState === "disconnected")
      return "Disconnected. Reconnecting...";
    if (connectionState === "error") return "Socket error. Retrying...";
    if (serverStatus === "api_error")
      return "Backend is up, API currently unavailable.";
    if (serverStatus === "no_active_flights")
      return "No active flights found right now.";
    return serverMessage || "Live tracking";
  }, [connectionState, serverStatus, serverMessage]);

  const timerText = useMemo(() => {
    if (connectionState !== "connected" || !lastUpdateTime) {
      return "";
    }
    return `Next update in ${nextUpdateIn}s`;
  }, [connectionState, lastUpdateTime, nextUpdateIn]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>India Flight Tracker</Text>
        <Text style={styles.subtitle}>{statusText}</Text>
        {timerText && <Text style={styles.timerText}>{timerText}</Text>}
      </View>

      <MapView style={styles.map} initialRegion={INITIAL_REGION}>
        {flights.map((flight) => {
          const region = markerRegionsRef.current.get(flight.icao24);
          if (!region) return null;

          return (
            <MarkerAnimated
              key={flight.icao24}
              coordinate={region}
              title={flight.callsign}
              description={`${formatMeters(flight.altitude)} • ${formatSpeed(flight.speed)} • ${trendLabel(flight.trend)}`}
            />
          );
        })}
      </MapView>

      <Animated.View style={styles.bottomSheet}>
        {flights.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No Flights To Show</Text>
            <Text style={styles.emptyStateBody}>
              {serverStatus === "api_error"
                ? "Live flight data is temporarily unavailable. The app will auto-recover."
                : "Waiting for two active flights that match your filters."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={flights}
            keyExtractor={(item) => item.icao24}
            contentContainerStyle={styles.flightList}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.callsign}>{item.callsign}</Text>
                <Text style={styles.meta}>
                  Altitude: {formatMeters(item.altitude)}
                </Text>
                <Text style={styles.meta}>
                  Speed: {formatSpeed(item.speed)}
                </Text>
                <Text style={styles.meta}>
                  Vertical: {trendLabel(item.trend)}
                </Text>
              </View>
            )}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0e141b",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 40 : 4,
    paddingBottom: 10,
    backgroundColor: "#0e141b",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f8fafc",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#98a3b3",
    textAlign: "center",
  },
  timerText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#64d9ff",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  map: {
    flex: 1,
  },
  bottomSheet: {
    maxHeight: "38%",
    backgroundColor: "#111b24",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 14,
    paddingBottom: 20,
  },
  emptyState: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#e5edf5",
  },
  emptyStateBody: {
    marginTop: 8,
    fontSize: 14,
    color: "#a7b2c2",
    lineHeight: 21,
  },
  flightList: {
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: "#172a34",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  callsign: {
    fontSize: 16,
    fontWeight: "700",
    color: "#eef4fa",
    marginBottom: 8,
    textAlign: "center",
  },
  meta: {
    fontSize: 14,
    color: "#b8c7d9",
    marginBottom: 3,
    textAlign: "center",
  },
});
