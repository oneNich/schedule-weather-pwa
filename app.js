/**
 * app.js
 * -----------------------------------------------------------------------------
 * SUMMARY:
 * All of the app's behavior lives in this one file, organized into four
 * sections mirroring the React Native version's file split:
 *   1. AUTH        - Google sign-in via Identity Services token client
 *   2. CALENDAR    - fetch + render today's events
 *   3. WEATHER     - geocode a typed place, then fetch current conditions
 *   4. SCREEN SETUP - wiring buttons/inputs to the functions above
 *
 * Plain JS + DOM APIs are used instead of a framework, since a PWA doesn't
 * need React/Flutter's component model - there are only two screens.
 * -----------------------------------------------------------------------------
 */

// ============================================================================
// 1. AUTH
// ============================================================================

let accessToken = null;
let tokenClient = null;

/**
 * Sets up Google's OAuth "token client". Unlike a server-based app, a PWA
 * has no backend to exchange a code for a token, so we use Google's
 * implicit-style token flow: the browser gets an access token directly.
 */
function initializeGoogleAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPE,
    callback: handleTokenResponse,
  });

  // Render Google's own styled "Sign in" button into our placeholder div.
  // We use a plain button wired to tokenClient.requestAccessToken() instead
  // of Google's rendered identity button, since that button is meant for
  // ID-only sign-in, not for requesting Calendar access scopes.
  const buttonContainer = document.getElementById("google-signin-button");
  const signInButton = document.createElement("button");
  signInButton.id = "sign-in-button";
  signInButton.textContent = "Sign in with Google";
  signInButton.style.cssText =
    "background:#274B5E;color:#fff;border:none;border-radius:8px;padding:14px 32px;font-size:16px;font-weight:600;cursor:pointer;";
  signInButton.addEventListener("click", () => {
    tokenClient.requestAccessToken();
  });
  buttonContainer.appendChild(signInButton);

  // If a token from a previous session is still valid, skip straight to
  // the home screen instead of making the user sign in again.
  const storedToken = getStoredToken();
  if (storedToken) {
    accessToken = storedToken;
    showHomeScreen();
  }
}

/**
 * Called automatically by Google's SDK once the user finishes the sign-in
 * popup and approves the requested scopes.
 */
function handleTokenResponse(response) {
  if (response.error) {
    // The user closed the popup or denied access. Stay on the login screen.
    return;
  }

  accessToken = response.access_token;
  storeToken(accessToken, response.expires_in);
  showHomeScreen();
}

function storeToken(token, expiresInSeconds) {
  const expiryTimestamp = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem("google_access_token", token);
  localStorage.setItem("google_token_expiry", String(expiryTimestamp));
}

function getStoredToken() {
  const token = localStorage.getItem("google_access_token");
  const expiryString = localStorage.getItem("google_token_expiry");

  if (!token || !expiryString) {
    return null;
  }

  if (Date.now() >= Number(expiryString)) {
    clearStoredToken();
    return null;
  }

  return token;
}

function clearStoredToken() {
  localStorage.removeItem("google_access_token");
  localStorage.removeItem("google_token_expiry");
}

function handleSignOut() {
  if (accessToken) {
    // Revokes the token on Google's side too, not just locally.
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  clearStoredToken();
  showLoginScreen();
}

// ============================================================================
// 2. CALENDAR
// ============================================================================

// Holds the day's events once loaded, so both the initial render and any
// later weather search can rebuild the grid from the same data without
// re-fetching the calendar.
let todaysEvents = [];

// Holds hourly weather once a city has been searched, keyed by hour (0-23).
// Empty until the user searches, at which point the grid re-renders with
// weather filled in.
let hourlyWeatherByHour = {};

async function loadTodaysSchedule() {
  const loadingEl = document.getElementById("schedule-loading");
  const errorEl = document.getElementById("schedule-error");

  loadingEl.classList.remove("hidden");
  errorEl.classList.add("hidden");

  try {
    todaysEvents = await fetchTodaysEvents(accessToken);
    loadingEl.classList.add("hidden");
    renderHourlyGrid();
  } catch (error) {
    loadingEl.classList.add("hidden");
    errorEl.textContent = "Couldn't load your calendar. Your session may have expired.";
    errorEl.classList.remove("hidden");
  }
}

/**
 * Fetches today's events from the Google Calendar API and returns them in a
 * simple shape, same as the calendarService.js in the React Native version.
 */
async function fetchTodaysEvents(token) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Calendar request failed with status ${response.status}`);
  }

  const data = await response.json();
  const rawEvents = data.items || [];

  return rawEvents.map(mapGoogleEventToScheduleItem);
}

function mapGoogleEventToScheduleItem(googleEvent) {
  let startTime;
  let endTime;
  let isAllDay;

  if (googleEvent.start.dateTime) {
    startTime = new Date(googleEvent.start.dateTime);
    endTime = new Date(googleEvent.end.dateTime);
    isAllDay = false;
  } else {
    // All-day event - Google gives just a date, no time-of-day.
    startTime = new Date(googleEvent.start.date);
    endTime = new Date(googleEvent.end.date);
    isAllDay = true;
  }

  return {
    title: googleEvent.summary || "(No title)",
    startTime: startTime,
    endTime: endTime,
    isAllDay: isAllDay,
  };
}

/**
 * Returns the events that overlap a given hour (0-23) of today, so the grid
 * can show each event in every hour row it spans (e.g. a 2-4pm meeting
 * appears in both the 2pm and 3pm rows).
 */
function eventsForHour(hour) {
  return todaysEvents.filter((event) => {
    if (event.isAllDay) {
      // Show all-day events in the very first row only, so they don't
      // clutter every hour of the day.
      return hour === 0;
    } else {
      const startHour = event.startTime.getHours();
      const endHour = event.endTime.getHours();
      const endMinute = event.endTime.getMinutes();

      // An event ending exactly on the hour (e.g. 3:00pm) shouldn't also
      // claim the 3pm row - it already ended.
      let effectiveEndHour = endHour;
      if (endMinute === 0) {
        effectiveEndHour = endHour - 1;
      }

      return hour >= startHour && hour <= effectiveEndHour;
    }
  });
}

// ============================================================================
// 3. WEATHER
// ============================================================================

async function handleWeatherSearch() {
  const cityInput = document.getElementById("city-input");
  const loadingEl = document.getElementById("weather-loading");
  const errorEl = document.getElementById("weather-error");
  const placeNameEl = document.getElementById("weather-place-name");

  const query = cityInput.value.trim();

  if (query.length === 0) {
    errorEl.textContent = "Type a city or ZIP code first.";
    errorEl.classList.remove("hidden");
    return;
  }

  loadingEl.classList.remove("hidden");
  errorEl.classList.add("hidden");
  placeNameEl.classList.add("hidden");

  try {
    const place = await geocodeLocation(query);
    hourlyWeatherByHour = await fetchHourlyWeather(place.latitude, place.longitude);

    placeNameEl.textContent = `Showing weather for ${place.name}, ${place.region}`;
    placeNameEl.classList.remove("hidden");

    renderHourlyGrid();
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
  } finally {
    loadingEl.classList.add("hidden");
  }
}

async function geocodeLocation(query) {
  const params = new URLSearchParams({ name: query, count: "1" });
  const response = await fetch(`${OPEN_METEO_GEOCODE_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Location lookup failed. Check your connection and try again.");
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error(`Couldn't find a place matching "${query}". Try a different spelling.`);
  }

  const bestMatch = data.results[0];
  return {
    name: bestMatch.name,
    region: bestMatch.admin1 || bestMatch.country || "",
    latitude: bestMatch.latitude,
    longitude: bestMatch.longitude,
  };
}

/**
 * Fetches today's hourly forecast and returns it as a lookup keyed by hour
 * (0-23), so the grid can pull out "hourlyWeatherByHour[14]" for the 2pm row.
 *
 * "timezone=auto" is important here: it tells Open-Meteo to return the 24
 * hourly values aligned to the LOCATION's local midnight-to-midnight, not
 * UTC or the browser's timezone - otherwise index 14 wouldn't reliably mean
 * "2pm at that location."
 */
async function fetchHourlyWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "temperature_2m,weather_code",
    temperature_unit: "fahrenheit",
    timezone: "auto",
    forecast_days: "1",
  });

  const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error("Weather lookup failed. Check your connection and try again.");
  }

  const data = await response.json();
  const hourlyTimes = data.hourly.time; // e.g. ["2026-09-02T00:00", "2026-09-02T01:00", ...]
  const hourlyTemps = data.hourly.temperature_2m;
  const hourlyCodes = data.hourly.weather_code;

  const lookup = {};
  for (let i = 0; i < hourlyTimes.length; i++) {
    const hourOfDay = new Date(hourlyTimes[i]).getHours();
    lookup[hourOfDay] = {
      temperatureF: Math.round(hourlyTemps[i]),
      emoji: weatherCodeToEmoji(hourlyCodes[i]),
    };
  }

  return lookup;
}

function weatherCodeToEmoji(code) {
  if (code === 0) {
    return "☀️";
  } else if (code === 1 || code === 2 || code === 3) {
    return "⛅";
  } else if (code === 45 || code === 48) {
    return "🌫️";
  } else if (code >= 51 && code <= 57) {
    return "🌦️";
  } else if (code >= 61 && code <= 67) {
    return "🌧️";
  } else if (code >= 71 && code <= 77) {
    return "🌨️";
  } else if (code >= 80 && code <= 82) {
    return "🌧️";
  } else if (code >= 85 && code <= 86) {
    return "🌨️";
  } else if (code >= 95) {
    return "⛈️";
  } else {
    return "❓";
  }
}

/**
 * Builds all 24 rows of the Time | Weather | Schedule grid from whatever
 * data is currently available. Safe to call multiple times - e.g. once
 * right after the calendar loads (weather cells blank), and again once a
 * city search fills in hourlyWeatherByHour. Each call clears and rebuilds
 * the grid from scratch rather than patching individual cells, since a
 * full day is only 24 rows - cheap enough to redraw entirely.
 */
function renderHourlyGrid() {
  const gridEl = document.getElementById("hourly-grid");

  // Remove any previously rendered rows, but keep the 3 header cells
  // (the first 3 children of the grid container).
  while (gridEl.children.length > 3) {
    gridEl.removeChild(gridEl.lastChild);
  }

  const currentHour = new Date().getHours();

  for (let hour = 0; hour < 24; hour++) {
    const isCurrentHour = hour === currentHour;

    gridEl.appendChild(buildTimeCell(hour, isCurrentHour));
    gridEl.appendChild(buildWeatherCell(hour, isCurrentHour));
    gridEl.appendChild(buildScheduleCell(hour, isCurrentHour));
  }

  gridEl.classList.remove("hidden");
}

function buildTimeCell(hour, isCurrentHour) {
  const cell = document.createElement("div");
  cell.className = "grid-cell time-cell";
  if (isCurrentHour) {
    cell.classList.add("current-hour");
  }
  cell.textContent = formatHourLabel(hour);
  return cell;
}

function buildWeatherCell(hour, isCurrentHour) {
  const cell = document.createElement("div");
  cell.className = "grid-cell weather-cell";
  if (isCurrentHour) {
    cell.classList.add("current-hour");
  }

  const weatherForHour = hourlyWeatherByHour[hour];
  if (weatherForHour) {
    const emojiSpan = document.createElement("span");
    emojiSpan.className = "weather-emoji";
    emojiSpan.textContent = weatherForHour.emoji;

    const tempSpan = document.createElement("span");
    tempSpan.textContent = `${weatherForHour.temperatureF}°`;

    cell.appendChild(emojiSpan);
    cell.appendChild(tempSpan);
  } else {
    cell.classList.add("muted-text");
    cell.textContent = "–";
  }

  return cell;
}

function buildScheduleCell(hour, isCurrentHour) {
  const cell = document.createElement("div");
  cell.className = "grid-cell schedule-cell";
  if (isCurrentHour) {
    cell.classList.add("current-hour");
  }

  const matchingEvents = eventsForHour(hour);
  if (matchingEvents.length === 0) {
    // Intentionally blank - an empty hour doesn't need a placeholder dash
    // here, unlike the weather column, since most hours will be empty and
    // dashes everywhere would add visual noise.
  } else {
    matchingEvents.forEach((event) => {
      const chip = document.createElement("span");
      chip.className = "event-chip";
      chip.textContent = event.title;
      cell.appendChild(chip);
    });
  }

  return cell;
}

function formatHourLabel(hour) {
  const referenceDate = new Date();
  referenceDate.setHours(hour, 0, 0, 0);
  return referenceDate.toLocaleTimeString([], { hour: "numeric" });
}

// ============================================================================
// 4. SCREEN SETUP
// ============================================================================

function showLoginScreen() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("home-screen").classList.add("hidden");
}

function showHomeScreen() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("home-screen").classList.remove("hidden");
  loadTodaysSchedule();
}

function setUpEventListeners() {
  document.getElementById("sign-out-button").addEventListener("click", handleSignOut);
  document.getElementById("weather-search-button").addEventListener("click", handleWeatherSearch);
  document.getElementById("city-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleWeatherSearch();
    }
  });
}

// ---- Entry point -----------------------------------------------------------

window.addEventListener("load", () => {
  setUpEventListeners();
  initializeGoogleAuth();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js");
  }
});
