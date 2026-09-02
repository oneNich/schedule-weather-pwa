/**
 * config.js
 * -----------------------------------------------------------------------------
 * SUMMARY:
 * The one value you must fill in before sign-in will work: your Google OAuth
 * "Web application" client ID. A PWA only ever needs ONE client ID (unlike
 * the React Native version, which needed separate iOS/Android/Web ones),
 * because a PWA IS a website as far as Google's OAuth system is concerned.
 *
 * HOW TO GET ONE:
 * 1. Go to https://console.cloud.google.com/ and create (or pick) a project.
 * 2. Enable the "Google Calendar API" under APIs & Services > Library.
 * 3. Go to APIs & Services > Credentials > Create Credentials > OAuth client ID.
 * 4. Choose "Web application".
 * 5. Under "Authorized JavaScript origins", add the URL you'll serve this
 *    app from, e.g. http://localhost:5500 for local testing, or your real
 *    domain once deployed (e.g. https://yourname.github.io).
 * 6. Paste the resulting client ID below.
 * -----------------------------------------------------------------------------
 */

const GOOGLE_CLIENT_ID = "824991102211-8lvj2n58fqjcrfrmhblio88qh2kp1kc6.apps.googleusercontent.com";

// Read-only scope - this app only ever displays events, never creates or
// edits them.
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

// Open-Meteo needs no API key at all, which is why it's used for weather.
const OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
