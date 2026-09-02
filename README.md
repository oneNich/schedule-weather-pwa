# Schedule & Weather (PWA)

A Progressive Web App version of the schedule + weather project — plain
HTML/CSS/JS, installable to a phone's home screen, no build step required.

## What's different from the React Native version

- No Expo, no App Store/Play Store — it's just a website that can be "installed."
- One Google OAuth client ID needed instead of three (Web/iOS/Android).
- Uses Google's Identity Services JS library instead of `expo-auth-session`.
- Uses `localStorage` instead of `AsyncStorage` for saving the login token.
- A service worker caches the app's own files so it opens instantly and has
  a basic offline fallback for the shell (calendar/weather data still needs
  a live connection, since it must be current).

## Project structure

```
schedule-weather-pwa/
├── index.html          # The whole UI: login screen + home screen
├── styles.css
├── app.js              # Auth, calendar fetch, weather fetch, DOM updates
├── config.js           # <-- YOU EDIT THIS: your Google client ID
├── manifest.json        # Makes it installable
├── service-worker.js    # Offline app-shell caching
└── icons/                # Put icon-192.png and icon-512.png here
```

## One-time setup

### 1. Get a Google OAuth Client ID
Full instructions are in the comment block at the top of `config.js`:
1. Create a project at [console.cloud.google.com](https://console.cloud.google.com/).
2. Enable the **Google Calendar API**.
3. Create an OAuth Client ID of type **Web application**.
4. Add the URL you'll test from (see step 2 below) under **Authorized JavaScript origins**.
5. Paste the client ID into `config.js`.

### 2. Serve the files (do NOT just double-click index.html)
Browsers block some PWA features (service workers, OAuth) on `file://` URLs,
so you need a local web server. Easiest options:

**Using VS Code:** install the **Live Server** extension, right-click
`index.html`, choose "Open with Live Server." It'll serve at something like
`http://127.0.0.1:5500` — add that exact URL to your OAuth client's
authorized origins.

**Using Node (no extension needed):**
```bash
npx serve .
```

### 3. Add icons (optional but needed for a clean install prompt)
Drop any 192×192 and 512×512 PNG images into `icons/` named `icon-192.png`
and `icon-512.png`. Without these, the app still works, just with a generic
icon when installed.

## Deploying it for real

Since it's just static files, any static host works:
- **GitHub Pages** — push this folder to a repo, enable Pages in repo Settings.
- **Netlify / Vercel** — drag-and-drop the folder or connect the repo.

Whichever URL you end up with, add it to the OAuth client's **Authorized
JavaScript origins** in Google Cloud Console, or sign-in will fail with a
"redirect_uri_mismatch"-style error.

## Installing it on a phone

Once served over `https://` (required for install prompts — `localhost` is
exempted for testing), open the URL in Chrome/Safari and use "Add to Home
Screen" (Safari) or the install icon in the address bar (Chrome/Edge).
