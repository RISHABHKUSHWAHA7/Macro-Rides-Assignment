export const formatMeters = (value) => {
  if (typeof value !== "number") return "N/A";
  return `${Math.round(value).toLocaleString()} m`;
};

export const formatSpeed = (value) => {
  if (typeof value !== "number") return "N/A";
  return `${Math.round(value * 3.6)} km/h`;
};

export const trendLabel = (trend) => {
  if (trend === "climbing") return "Climbing";
  if (trend === "descending") return "Descending";
  return "Level";
};
