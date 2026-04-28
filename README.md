# AeroGIS — Aerial Survey Flight Line Generator

A lightweight Android app for GPS-based aerial survey planning.  
**Google Maps · GPS Tracking · Waypoint Placement · Parallel Flight Line Generation**

---

## Quick Start (3 Steps)

### Step 1 — Get a Google Maps API Key
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → **APIs & Services → Enable APIs → Maps SDK for Android**
3. **Credentials → Create API Key**
4. Restrict the key: **Application restrictions → Android apps**
5. Add your debug SHA-1:
   ```
   keytool -list -v -keystore ~/.android/debug.keystore \
           -alias androiddebugkey -storepass android -keypass android
   ```
6. Open `app/build.gradle` and replace:
   ```groovy
   manifestPlaceholders = [mapsApiKey: "YOUR_GOOGLE_MAPS_API_KEY"]
   ```

### Step 2 — Fix the Gradle Wrapper (one-time)

**On macOS/Linux:**
```bash
chmod +x fix-wrapper.sh && ./fix-wrapper.sh
```

**On Windows:**
```
fix-wrapper.bat
```

**Or skip this step entirely** — open the project in Android Studio and it will
automatically detect and offer to fix the wrapper. Click **OK** when prompted.

### Step 3 — Open in Android Studio
1. **File → Open → select the `AeroGIS` folder**
2. Wait for Gradle sync to complete
3. Run on a device or emulator (must have **Google Play Services**)

---

## Verified Build Configuration

| Component | Version |
|---|---|
| Android Gradle Plugin | 8.3.2 |
| Kotlin | 1.9.22 |
| Gradle wrapper | 8.7 |
| Compose BOM | 2024.04.00 |
| Compose Compiler | 1.5.8 |
| compileSdk / targetSdk | 34 |
| minSdk | 24 |
| play-services-maps | 18.2.0 |
| play-services-location | 21.2.0 |
| maps-compose | 4.3.3 |

---

## App Usage

| Action | Result |
|---|---|
| Tap map | Places a waypoint (AOI corner) |
| UNDO button | Removes last waypoint |
| Set spacing (m) | Line-to-line gap in metres |
| GEN button | Generates boustrophedon flight lines |
| CLR button | Clears all waypoints and lines |

**HUD displays:** line count · total flight distance (km) · survey area (km²)

---

## Project Structure

```
AeroGIS/
├── app/src/main/java/com/aerogis/app/
│   ├── MainActivity.kt              ← Activity, permission handling, theme
│   ├── core/FlightLineGenerator.kt  ← GIS geometry engine (no external libs)
│   ├── viewmodel/LocationViewModel.kt ← GPS stream + state management
│   └── ui/MapScreen.kt              ← Full Compose UI
├── app/build.gradle                 ← Minimal, conflict-free dependencies
├── fix-wrapper.sh / fix-wrapper.bat ← One-time Gradle wrapper regenerator
└── README.md
```

---

## Flight Line Algorithm

Equirectangular projection, boustrophedon lawnmower pattern:
- **Even passes:** West → East (heading 090°)
- **Odd passes:** East → West (heading 270°)
- Error: < 0.3% for survey areas ≤ 100 km wide
- Cap: 500 lines maximum (OOM guard)
