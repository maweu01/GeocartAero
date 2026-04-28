# GeoCart FlightMap Lite — Setup Guide
**Developer:** Kelvin Maweu Mwatu  
**Version:** 1.0.0  
**Architecture:** MVVM · Jetpack Compose · Google Maps SDK · Room

---

## Prerequisites

| Tool | Version Required | Download |
|------|-----------------|---------|
| Android Studio | Hedgehog 2023.1.1+ | https://developer.android.com/studio |
| JDK | 17 (bundled with AS) | — |
| Android SDK | API 24–34 | via SDK Manager |
| Google Maps API Key | — | https://console.cloud.google.com |

---

## Step 1 — Get a Google Maps API Key

1. Go to https://console.cloud.google.com
2. Create or select a project
3. Navigate to **APIs & Services → Library**
4. Enable **"Maps SDK for Android"**
5. Go to **APIs & Services → Credentials → + Create Credentials → API Key**
6. Copy your key (starts with `AIza...`)

---

## Step 2 — Add Your API Key

Open the file:
```
app/src/main/AndroidManifest.xml
```

Find this line:
```xml
android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE"
```

Replace with your actual key:
```xml
android:value="AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

---

## Step 3 — Open in Android Studio

1. Launch **Android Studio**
2. Click **File → Open**
3. Navigate to and select the `GeoCartFlightMapLite/` folder
4. Click **OK**
5. Wait for Gradle to sync (~2–5 minutes on first open)
6. If prompted, click **"Sync Now"** in the top banner

---

## Step 4 — Configure SDK Path (if needed)

If you see "SDK location not found", open `local.properties` and set your SDK path:

**Windows:**
```
sdk.dir=C\:\\Users\\YourName\\AppData\\Local\\Android\\Sdk
```

**macOS/Linux:**
```
sdk.dir=/Users/yourname/Library/Android/sdk
```

---

## Step 5 — Run on Emulator

1. Click **Tools → Device Manager**
2. Click **+ Create Device**
3. Choose: **Pixel 6** → **API 33 (Android 13)**
4. Click **Finish**, then click the ▶ play button
5. In the main toolbar, select your emulator and click **Run ▶**

---

## Step 6 — Run on Physical Device

1. On your Android phone, go to **Settings → About Phone**
2. Tap **Build Number** 7 times to enable Developer Options
3. Go to **Settings → Developer Options → Enable USB Debugging**
4. Connect phone via USB
5. Select your device in Android Studio toolbar → click **Run ▶**

---

## Step 7 — Build a Debug APK

To generate the APK file:

1. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Wait for the build to complete
3. Click **"locate"** in the bottom notification
4. Your APK is at:
   ```
   app/build/outputs/apk/debug/app-debug.apk
   ```
5. Transfer this APK to any Android device (API 24+) and install it

---

## App Features — Quick Reference

### ✈️ Flight Plan Tab
- Tap **✏️ pencil FAB** to enter drawing mode
- **Tap on the satellite map** to add polygon vertices (3 minimum)
- Adjust **Altitude**, **Front Overlap**, and **Side Overlap** sliders
- Results update live: **GSD, image count, flight time, coverage area**
- Tap **Undo** or **Clear** to edit the polygon
- Tap **💾 Save FAB** (bottom-right) to name and save the project

### 📁 Projects Tab
- All saved projects listed with key stats
- Tap **↗️ Load** to restore a project to the map
- Tap **🗑️ Delete** to remove a project

### 🗺️ Overlay Tab
- Tap **"Add Drone Images"** button to import from device gallery
- Images copied to `/storage/emulated/0/GeoCartFlightMap/`
- Shown as a thumbnail grid preview
- Lite mode — no photogrammetry processing

### 👤 About Tab
- Developer profile: Kelvin Maweu Mwatu
- App version and technology stack

---

## Project Structure

```
GeoCartFlightMapLite/
├── app/
│   ├── build.gradle                          ← Dependencies
│   └── src/main/
│       ├── AndroidManifest.xml               ← Permissions + Maps Key
│       ├── java/com/geocart/flightmaplite/
│       │   ├── GeoCartApp.kt                 ← Application class
│       │   ├── MainActivity.kt               ← Compose entry point
│       │   ├── core/
│       │   │   └── Constants.kt
│       │   ├── data/
│       │   │   ├── model/Project.kt          ← Room entity
│       │   │   ├── db/AppDatabase.kt         ← Room database
│       │   │   ├── db/ProjectDao.kt          ← DAO queries
│       │   │   └── repository/ProjectRepository.kt
│       │   ├── map/
│       │   │   └── FlightCalculator.kt       ← GSD + grid logic
│       │   └── ui/
│       │       ├── navigation/NavGraph.kt    ← Bottom nav
│       │       ├── screens/
│       │       │   ├── MapScreen.kt          ← Google Maps + drawing
│       │       │   ├── ProjectsScreen.kt     ← Save/load projects
│       │       │   ├── MapProductionScreen.kt← Drone image import
│       │       │   └── AboutScreen.kt        ← Developer profile
│       │       ├── theme/
│       │       │   ├── Color.kt
│       │       │   ├── Theme.kt
│       │       │   └── Type.kt
│       │       └── viewmodel/MainViewModel.kt
│       └── res/
│           ├── values/strings.xml
│           ├── values/themes.xml
│           ├── xml/file_paths.xml
│           └── mipmap-*/ic_launcher.png
├── build.gradle
├── gradle.properties                         ← AndroidX flags
├── settings.gradle
├── gradlew / gradlew.bat
└── local.properties                          ← SDK path (local only)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `SDK location not found` | Set `sdk.dir` in `local.properties` |
| Map shows grey tiles | Check/replace the Google Maps API key |
| Map shows "For development purposes only" watermark | Billing not enabled on Google Cloud project |
| `Gradle sync failed` | File → Invalidate Caches → Restart |
| Build error `kapt` | Ensure JDK 17 selected: File → Project Structure → SDK Location |
| Images not loading | Grant storage permissions on the device settings |

---

## Camera Profile Reference (DJI P1)

| Parameter | Value |
|-----------|-------|
| Sensor size | 35.9 × 23.9 mm |
| Focal length | 35 mm |
| Pixel size | 4.4 µm |
| Image resolution | 8192 × 5460 px |
| Typical cruise speed | 10 m/s |

**GSD formula:**  
`GSD (cm/px) = (Altitude_m × 4.4) / (35 × 10)`

At 120 m → **1.51 cm/px**  
At 60 m  → **0.75 cm/px**

---

*GeoCart FlightMap Lite · Built for Kelvin Maweu Mwatu · 2025*
