import { Location } from '../types';

/**
 * Calculate the distance between two coordinates in feet
 */
export function getDistanceInFeet(coord1: Location, coord2: Location): number {
  const R = 20902231; // Earth radius in feet
  const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
  const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Helper function to convert GPS coordinates from degrees/minutes/seconds to decimal degrees
export function convertDMSToDD(dms: number[], direction: string): number {
  const degrees = dms[0];
  const minutes = dms[1];
  const seconds = dms[2];

  let dd = degrees + (minutes / 60) + (seconds / 3600);

  if (direction === 'S' || direction === 'W') {
    dd *= -1;
  }

  return dd;
}

/**
 * Calculate a bounding box around a center point given a radius in miles
 */
export function getBoundsFromLocation(center: Location, radiusMiles: number): { north: number; south: number; east: number; west: number } {
  // 1 mile approx 0.01449275362 degrees latitude
  const latDelta = radiusMiles * 0.0145;
  // Longitude delta changes with latitude
  // 1 mile approx 0.0145 / cos(lat)
  const lonDelta = radiusMiles * 0.0145 / Math.cos(center.latitude * Math.PI / 180);

  return {
      north: center.latitude + latDelta,
      south: center.latitude - latDelta,
      east: center.longitude + lonDelta,
      west: center.longitude - lonDelta
  };
}