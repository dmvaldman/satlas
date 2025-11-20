# Geofencing Plugin

Native geofencing plugin for Capacitor that works when the app is killed or backgrounded.

## Installation

```bash
npm install @satlas/geofencing
npx cap sync
```

## Usage

```typescript
import { Geofencing } from '@satlas/geofencing';

// Add geofences
await Geofencing.addGeofences({
  geofences: [
    {
      id: 'sit_123',
      latitude: 37.7749,
      longitude: -122.4194,
      radiusMeters: 1609.34, // 1 mile in meters
      sitId: '123',
      isOuterBoundary: false
    }
  ]
});

// Listen for events
Geofencing.addListener('geofenceEnter', (data) => {
  console.log('Entered geofence:', data.geofence.id);
});

Geofencing.addListener('geofenceExit', (data) => {
  console.log('Exited geofence:', data.geofence.id);
});

// Remove geofences
await Geofencing.removeGeofences({ ids: ['sit_123'] });

// Remove all
await Geofencing.removeAllGeofences();
```

## Permissions

### Android
Add to `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
```

### iOS
Add to `Info.plist`:
```xml
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>We need your location to notify you when you're near a sit</string>
<key>UIBackgroundModes</key>
<array>
    <string>location</string>
</array>
```

## Limitations

- Android: Can monitor up to 100 geofences
- iOS: Can monitor up to 20 regions per app

