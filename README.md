# Fortis - Security Response Advisor App 
## Made for Certis Cisco Hackathon

Integrated security platform that detects incidents captured on CCTV in a web app for command centre officers, lets them assign incidents to security officers and senior security officers, and informs those teams through a mobile app during their shift.

## Team

`team Null`

- Joshe D/O Chantiramugan
- Vania Graciella Kwee
- Niruba Annriea Kichor Sagayaradje
- Wong Poh Yee

## Overview

Our platform empowers security personnel and organisations to respond faster and smarter during emergencies. By combining real-time data analytics, AI-driven incident detection through CCTV analysis, and guided response recommendations, the system improves situational awareness, reduces human error, and supports faster, more consistent decision-making during critical events.

This repository is split into two main parts:

- `frontend/`: Expo + React Native app using `expo-router`
- `backend/`: Flask API and small Python utilities

The product supports role-based experiences including:

- `securityofficer`
- `securitysupervisor`
- `sso`

At a high level, the workflow is:

- CCTV feeds are analysed to detect incidents
- Command centre officers review and assign incidents in the web platform
- Security officers and senior security officers receive updates in the mobile app while on shift
- The platform supports guided and timely response during active incidents

Supabase is used as the primary backend service for authentication, storage, and database access.

## Tech Stack

Frontend

- Expo
- React Native
- TypeScript
- `expo-router`

Backend

- Flask

Database

- Supabase

Languages and Tooling

- JavaScript / TypeScript
- Python
- npm

## Repository Structure

```text
CertisCisco-Hackathon/
|- frontend/
|  |- app/                     # Expo Router routes
|  |  |- securityofficer/
|  |  |- securitysupervisor/
|  |  `- sso/
|  |- components/              # Shared UI components
|  |- lib/                     # Supabase client and app helpers
|  |- assets/                  # Images and static assets
|  |- package.json
|  `- app.json
|- backend/
|  |- app.py                   # Flask app
|  |- dataentry.py             # Local helper script
|  `- requirements.txt
`- README.md
```

## Prerequisites

- Node.js 18+
- npm
- Python 3.10+
- Expo Go or Android Studio / Xcode emulator
- A Supabase project

## Frontend Setup

1. Go to the frontend folder:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

To prevent errors: Install these additional frontend packages used by the project:

```bash
npm install @supabase/supabase-js
npm install lucide-react-native
npm install @expo/vector-icons
npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/elements
npm install react-native-maps react-native-svg
npm install expo-location
npm install react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated
npm install react-native-qrcode-svg react-native-svg
npx expo install expo-image-picker
npx expo install expo-video
npx expo install expo-notifications
npx expo install expo-device
npx expo install react-native-modal
npm i react-native-image-zoom-viewer
npx expo install react-native-webview
npm i react-native-youtube-iframe
```

3. Create or update `frontend/.env` with the required Expo public variables:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

These variables are read in [frontend/lib/supabase.ts](/d:/Documents/GitHub/CertisCisco-Hackathon/frontend/lib/supabase.ts).

4. Start the Expo app:

```bash
npm run start
```

Useful alternatives:

```bash
npm run android
npm run ios
npm run web
npm run lint
```

## Backend Setup

1. Go to the backend folder:

```bash
cd backend
```

2. Create a virtual environment and activate it:

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Start the Flask API:

```bash
python app.py
```

The default health endpoint is:

```text
GET http://localhost:5001/health
```

## Environment Variables

Frontend:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Backend:

- Add any Flask or Supabase secrets to `backend/.env`
- Do not hardcode service credentials in Python scripts

## Notes for Contributors

- The frontend uses file-based routing via `expo-router`.
- Shared business logic and integrations live under `frontend/lib/`.
- Role-specific screens are grouped under their respective route folders in `frontend/app/`.
- If you add new services or deployment steps, update this README alongside the code.

## Development Tips

- Run the frontend from `frontend/`, not the repo root.
- The backend is currently minimal and can run independently from the mobile app.
- Supabase schema, policies, and seed data are important for full functionality, so some screens may not work correctly without the expected tables and auth setup.

## Next Improvements

- Add Supabase schema documentation
- Add API endpoint documentation
- Add screenshots or demo GIFs
- Add deployment instructions
- Replace any local test credentials with env-based configuration
