## Update LocationService

Update src/utils/LocationService.ts to use the Capacitor Geolocation plugin:

```
import { Geolocation, Position } from '@capacitor/geolocation';
import { isPlatform } from '@capacitor/core';

// Rest of your existing code...

async getCurrentLocation(): Promise<Location> {
  try {
    // Check if we're on a native platform
    if (isPlatform('android') || isPlatform('ios')) {
      // Request permissions first on native platforms
      const permissionStatus = await Geolocation.requestPermissions();

      if (permissionStatus.location === 'granted') {
        const position: Position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: LOCATION_TIMEOUT
        });

        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        // Save for future use
        this.saveLastKnownLocation(location);
        return location;
      } else {
        // Permission denied, use fallbacks
        return this.getLocationFallback();
      }
    } else {
      // Web platform - use existing browser implementation
      return this.getLocationFromBrowser();
    }
  } catch (error) {
    console.error('Error getting location:', error);
    return this.getLocationFallback();
  }
}
```


## Update PhotoUpload Component

Modify src/components/PhotoUpload.tsx to use Capacitor Camera plugin:

```
import { Geolocation, Position } from '@capacitor/geolocation';
import { isPlatform } from '@capacitor/core';

// Rest of your existing code...

async getCurrentLocation(): Promise<Location> {
  try {
    // Check if we're on a native platform
    if (isPlatform('android') || isPlatform('ios')) {
      // Request permissions first on native platforms
      const permissionStatus = await Geolocation.requestPermissions();

      if (permissionStatus.location === 'granted') {
        const position: Position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: LOCATION_TIMEOUT
        });

        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        // Save for future use
        this.saveLastKnownLocation(location);
        return location;
      } else {
        // Permission denied, use fallbacks
        return this.getLocationFallback();
      }
    } else {
      // Web platform - use existing browser implementation
      return this.getLocationFromBrowser();
    }
  } catch (error) {
    console.error('Error getting location:', error);
    return this.getLocationFallback();
  }
}
```

Update Storage Service

For file storage on device:

```
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isPlatform } from '@capacitor/core';

// Add this to your FirebaseService class for caching images locally
static async cacheImage(imageUrl: string, imageName: string): Promise<string> {
  if (isPlatform('web')) {
    return imageUrl; // Just return URL on web
  }

  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
    });

    const savedFile = await Filesystem.writeFile({
      path: `satlas_images/${imageName}`,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true
    });

    return savedFile.uri;
  } catch (error) {
    console.error('Error caching image:', error);
    return imageUrl; // Fall back to original URL
  }
}
```

## Add Platform-Specific Configurations

Edit ios/App/App/Info.plist to add necessary permissions:

```
<!-- Camera Permission -->
<key>NSCameraUsageDescription</key>
<string>We need camera access to take photos for sits</string>

<!-- Location Permission -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need location access to show sits near you</string>

<!-- Photo Library Permission -->
<key>NSPhotoLibraryUsageDescription</key>
<string>We need photo library access to upload photos for sits</string>

<!-- Photo Library Add-Only Permission -->
<key>NSPhotoLibraryAddUsageDescription</key>
<string>We need permission to save photos to your library</string>
```

Android Configuration

Edit android/app/src/main/AndroidManifest.xml to add permissions:


```
<!-- Add these inside the manifest tag -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

## Update MapBox Integration

For native MapBox integration, install the Capacitor MapBox plugin:

`npm install @capacitor-community/mapbox`

Configure the plugin in capacitor.config.ts:

```
plugins: {
  MapboxNavigation: {
    accessToken: 'YOUR_MAPBOX_ACCESS_TOKEN'
  },
  // other plugins...
}
```