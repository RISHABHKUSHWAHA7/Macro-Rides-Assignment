#!/bin/bash
# Flight Tracker APK Build Script
# Run this to build your APK automatically

echo "🚀 Starting Flight Tracker APK Build..."
echo ""

# Step 1: Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "📦 Installing EAS CLI globally..."
    npm install -g eas-cli
fi

echo "✅ EAS CLI is ready"
echo ""

# Step 2: Navigate to mobile directory
cd /Users/remonal/Desktop/assigenment/mobile

echo "📂 Changed to mobile directory"
echo ""

# Step 3: Check if logged in (optional - will prompt if needed)
echo "🔐 Checking Expo login..."
eas whoami || eas login

echo ""
echo "📱 Building APK for Android..."
echo "⏱️  This may take 5-15 minutes (first build takes longer)"
echo ""

# Step 4: Build APK
eas build --platform android --local

echo ""
echo "✅ Build complete!"
echo "📥 APK has been downloaded to your Downloads folder"
echo ""
echo "Next steps:"
echo "1. Transfer APK to your Android phone"
echo "2. Tap to install"
echo "3. Launch 'Flight Tracker' app"
echo ""
echo "Or use adb to install directly:"
echo "   adb install <path-to-apk>"
