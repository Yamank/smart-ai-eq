# Smart AI EQ — PRD

## Original problem statement
AI-powered adaptive headphone EQ app (Expo). Login (Google/Apple). Setup screen: Manufacturer -> Headphones -> Firmware (Latest default) cascading dropdowns, 8/10 band radio, Optimize EQ. EQ page: detect playing song, AI gathers song/headphone/firmware info and recommends parametric EQ (band freq limits, gain ±8 dB step 0.5, Q 0.1–10 step 0.1), applied live, advanced parametric UI, auto re-optimize on song change. Prefill last selection, feedback for missing devices, admin adds to master list, offline support. Reference design: black/white/red Nothing-style equaliser.

## User choices
- AI: GPT 5.6 Terra (Emergent key); admin can allow users to paste own keys + pick model
- Auth: Google (Emergent-managed, works in Expo Go) + native Apple Sign-In (iOS) + admin email/password
- Native song detection: requested "try anyway" — not possible in Expo Go; manual Now Playing input for now
- Curated catalog seed (~48 brands, ~390 models) + admin-managed growth
- Offline: cached catalog, last selection, saved EQ profiles
- Minimal UI + A/B Test button (with/without AI EQ)

## Architecture
- Backend FastAPI: server.py (auth, catalog, feedback, settings, eq/recommend with caching + strict clamping, eq/preview WAV, profiles), catalog_seed.py, audio_dsp.py (synth reference clip + RBJ peaking biquads, loudness matched)
- Frontend Expo Router: login, index (setup), eq, feedback (modal), profiles, admin, ai-settings (modal); src/api.ts, auth.tsx, eq.ts, components (Dropdown, EqGraph svg, BandSlider, ABTest expo-audio, Toast)

## Implemented (2026-10-04)
- All above features; backend 26/26 tests pass; frontend flows pass

## Backlog
- P0: Native build: Android NotificationListener for now-playing detection + auto song-change; system-wide EQ via Android audio effects (dev build only)
- P1: Apple sign-in validation on real iOS build; firmware data verification by admin; feedback delete
- P2: Export EQ to companion apps (Wavelet/Poweramp format), community presets
