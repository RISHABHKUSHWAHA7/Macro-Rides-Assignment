# How to Build APK from React Native Expo App

## 🚀 Quick Start (5 minutes)

### **Option 1: EAS Build (Recommended)**

1. **Install EAS CLI globally**
   ```bash
   npm install -g eas-cli
   ```

2. **Navigate to mobile folder**
   ```bash
   cd /Users/remonal/Desktop/assigenment/mobile
   ```

3. **Login to Expo account**
   ```bash
   eas login
   ```
   - If you don't have an account: `eas register`

4. **Build APK**
   ```bash
   eas build --platform android
   ```

5. **Wait for build to complete** (5-15 minutes)
   - EAS will build in the cloud
   - APK download link will be provided
   - You can also find it in your Expo Dashboard

---

### **Option 2: Local Build (Advanced)**

**Prerequisites:**
- Android Studio installed
- Android SDK 31+ configured
- ANDROID_HOME environment variable set

**Steps:**
```bash
# Install dependencies
npm install

# Build APK locally
eas build --platform android --local
```

---

## 📦 **Installing the APK on Device**

After building, you'll get an `.apk` file.

### **Install on Android Device:**

```bash
# Via adb (Android Debug Bridge)
adb install path/to/your/app.apk

# Or transfer file to phone and tap to install
```

---

## 🔧 **Troubleshooting**

| Issue | Solution |
|-------|----------|
| `eas-cli not found` | Run `npm install -g eas-cli` |
| `Not logged in` | Run `eas login` or `eas register` |
| `ANDROID_HOME not set` | Set environment variable to Android SDK path |
| `Build fails` | Check `app.json` for valid Expo config |

---

## 📋 **What Gets Included in APK**

- ✅ All React Native code (App.js, components)
- ✅ Assets (images, fonts, etc.)
- ✅ WebSocket connections to backend
- ✅ Map rendering
- ✅ All dependencies from package.json

---

## 🎯 **Recommended Approach for You:**

1. Make sure your `package.json` is correct ✅
2. Ensure `app.json` has proper expo config ✅
3. Run `eas build --platform android`
4. Download APK when ready
5. Install on Android phone via `adb install` or file transfer

---

## 💡 **Pro Tips**

- **Preview first**: Run `expo start` before building
- **Check app.json**: Make sure `name`, `slug`, `version` are set
- **Update credentials**: Store signing keys securely
- **Build takes time**: First build may take 10-15 mins

---

For more help: https://docs.expo.dev/build/setup/

