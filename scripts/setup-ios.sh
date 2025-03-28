#!/bin/bash

# Exit on error
set -e

# Copy Firebase config
cp ./configs/GoogleService-Info.plist ios/App/App/

# Navigate to iOS app directory
cd ios/App

# Add location permissions if not present
if ! grep -q 'NSLocationWhenInUseUsageDescription' App/Info.plist; then
  sed -i '' '/LSRequiresIPhoneOS/a\
  <key>NSLocationWhenInUseUsageDescription</key>\
  <string>We need your location to show you nearby sits and allow you to add new ones.</string>\
  <key>NSLocationAlwaysUsageDescription</key>\
  <string>We need your location to show you nearby sits and allow you to add new ones.</string>' App/Info.plist
fi

# Add URL scheme if not present
if ! grep -q 'CFBundleURLTypes' App/Info.plist; then
  sed -i '' '/LSRequiresIPhoneOS/a\
  <key>CFBundleURLTypes</key>\
  <array>\
    <dict>\
      <key>CFBundleURLSchemes</key>\
      <array>\
        <string>com.dmvaldman.Satlas</string>\
      </array>\
    </dict>\
  </array>' App/Info.plist
fi

# Create entitlements directory and file if not exists
mkdir -p App.entitlements
if [ ! -f App.entitlements/App.entitlements ]; then
  cat <<EOT > App.entitlements/App.entitlements
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
EOT
fi

# Create AuthKey directory and copy key
mkdir -p App/AuthKey
cp ../../configs/AuthKey_F4HCN4Y2PX.p8 App/AuthKey/

# Return to project root and sync
cd ../..
npx cap sync ios

echo "✅ iOS setup completed successfully!"