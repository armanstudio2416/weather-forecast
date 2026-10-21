
const WMO = {
  0:  ["☀️",  "Clear sky",            "clear"],
  1:  ["🌤️", "Mainly clear",          "clear"],
  2:  ["⛅",  "Partly cloudy",         "cloudy"],
  3:  ["☁️",  "Overcast",              "cloudy"],
  45: ["🌫️", "Foggy",                 "fog"],
  48: ["🌫️", "Freezing fog",          "fog"],
  51: ["🌦️", "Light drizzle",         "rain"],
  53: ["🌦️", "Moderate drizzle",      "rain"],
  55: ["🌧️", "Dense drizzle",         "rain"],
  61: ["🌧️", "Light rain",            "rain"],
  63: ["🌧️", "Moderate rain",         "rain"],
  65: ["🌧️", "Heavy rain",            "rain"],
  71: ["🌨️", "Light snow",            "snow"],
  73: ["🌨️", "Moderate snow",         "snow"],
  75: ["❄️",  "Heavy snow",            "snow"],
  77: ["🌨️", "Snow grains",           "snow"],
  80: ["🌦️", "Light showers",         "rain"],
  81: ["🌧️", "Moderate showers",      "rain"],
  82: ["⛈️",  "Violent showers",       "storm"],
  85: ["🌨️", "Snow showers",          "snow"],
  86: ["❄️",  "Heavy snow showers",    "snow"],
  95: ["⛈️",  "Thunderstorm",          "storm"],
  96: ["⛈️",  "Thunderstorm + hail",   "storm"],
  99: ["⛈️",  "Severe thunderstorm",   "storm"],
};

/* Helper: safely get the [emoji, description, theme] for a code.
   If the code isn't in the table, returns a fallback. */
function getWMO(code) {
  return WMO[code] ?? ["🌡️", "Unknown", "cloudy"];
}


/* ============================================================
   2. COMPASS DIRECTION HELPER
   The API gives wind direction as degrees (0–360).
   This function converts it to a compass label like "N", "SW", etc.
   The directions array is split into 8 x 45° slices.
============================================================ */
function degToCompass(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}


/* ============================================================
   3. DOM ELEMENT REFERENCES
   document.getElementById("id") finds an HTML element by its id.
   We store them in variables so we don't have to write
   document.getElementById(...) every single time.
============================================================ */
const cityInput    = document.getElementById("cityInput");     // text input
const searchBtn    = document.getElementById("searchBtn");     // search button
const acList       = document.getElementById("autocomplete");  // suggestions dropdown
const errorMsg     = document.getElementById("errorMsg");      // error banner
const loader       = document.getElementById("loader");        // spinning loader
const currentCard  = document.getElementById("currentCard");   // current weather panel
const hourlyCard   = document.getElementById("hourlyCard");    // hourly strip panel
const forecastCard = document.getElementById("forecastCard");  // 7-day panel
const outlookCard  = document.getElementById("outlookCard");   // 30-day summary panel


/* ============================================================
   4. STATE VARIABLES
   These variables hold information the app needs to remember
   between function calls.
============================================================ */
let activeLat     = null;  // latitude of the currently displayed city
let activeLon     = null;  // longitude of the currently displayed city
let activeCity    = null;  // display name of the city  e.g. "Ludhiana, India"
let refreshTimer  = null;  // holds the setInterval timer so we can cancel it
let debounceTimer = null;  // delays the autocomplete API call while the user types
let acIndex       = -1;    // which autocomplete item is keyboard-highlighted (-1 = none)


/* ============================================================
   5. SHOW / HIDE HELPERS
   The CSS class "hidden" sets display:none.
   These two tiny functions add/remove that class.
============================================================ */
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

function showError(msg) {
  errorMsg.textContent = msg;
  show(errorMsg);
}

function hideError() {
  hide(errorMsg);
}

/* Hide all result panels at once (called before a new search) */
function hideAllResults() {
  hide(currentCard);
  hide(hourlyCard);
  hide(forecastCard);
  hide(outlookCard);
}


/* ============================================================
   6. BACKGROUND THEME SWITCHER
   JS adds a class to <body> to change the background gradient.
   The gradients are defined in style.css.
   e.g. body.clear-day { background: linear-gradient(...); }
============================================================ */
const ALL_THEMES = [
  "clear-day", "clear-night",
  "cloudy-day", "cloudy-night",
  "rain", "snow", "storm", "fog"
];

function setTheme(weatherTheme, isDay) {
  // Remove ALL theme classes first, then add the correct one
  document.body.classList.remove(...ALL_THEMES);

  if (weatherTheme === "clear") {
    document.body.classList.add(isDay ? "clear-day" : "clear-night");
  } else if (weatherTheme === "cloudy") {
    document.body.classList.add(isDay ? "cloudy-day" : "cloudy-night");
  } else {
    // rain, snow, storm, fog — same class regardless of day/night
    document.body.classList.add(weatherTheme);
  }
}


/* ============================================================
   7. AUTOCOMPLETE — City suggestions as you type
   When the user types 2+ characters, we call the Open-Meteo
   Geocoding API which returns a list of matching cities.
   We use "debounce" to wait 300ms after the user stops typing
   before making the API call (avoids calling it on every keystroke).
============================================================ */

/* Listen for every keystroke in the search input */
cityInput.addEventListener("input", () => {
  const q = cityInput.value.trim();
  clearTimeout(debounceTimer); // cancel the previous timer

  if (q.length < 2) {
    hideAC(); // don't search for single characters
    return;
  }

  // Start a 300ms timer — if the user types again, it resets
  debounceTimer = setTimeout(() => fetchSuggestions(q), 300);
});

/* Fetch matching city names from the Geocoding API */
async function fetchSuggestions(q) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`;
    const res  = await fetch(url);
    const data = await res.json();
    renderAC(data.results || []);
  } catch {
    hideAC(); // silently hide if API call fails
  }
}

/* Build the dropdown list from the array of city results */
function renderAC(results) {
  if (!results.length) { hideAC(); return; }

  acList.innerHTML = ""; // clear previous suggestions
  acIndex = -1;

  results.forEach(place => {
    const li     = document.createElement("li");
    const region = [place.admin1, place.country].filter(Boolean).join(", ");

    li.innerHTML = `
      <span class="ac-city">${place.name}</span>
      <span class="ac-region">${region}</span>
    `;

    // Click selects this city
    li.addEventListener("click", () => selectCity(place));
    acList.appendChild(li);
  });

  show(acList);
}

/* Hide and clear the dropdown */
function hideAC() {
  hide(acList);
  acList.innerHTML = "";
  acIndex = -1;
}

/* Keyboard navigation: ↑ ↓ to move, Enter to select, Escape to close */
cityInput.addEventListener("keydown", e => {
  const items = acList.querySelectorAll("li");

  if (e.key === "ArrowDown" && items.length) {
    e.preventDefault();
    acIndex = (acIndex + 1) % items.length; // move down, wrap to top
    highlightAC(items);

  } else if (e.key === "ArrowUp" && items.length) {
    e.preventDefault();
    acIndex = (acIndex - 1 + items.length) % items.length; // move up, wrap to bottom
    highlightAC(items);

  } else if (e.key === "Enter") {
    if (acIndex >= 0 && items[acIndex]) {
      items[acIndex].click(); // select the highlighted item
    } else {
      startSearch(); // no item selected — just run the search
    }

  } else if (e.key === "Escape") {
    hideAC();
  }
});

/* Add/remove the "active" class to visually highlight one item */
function highlightAC(items) {
  items.forEach((el, i) => el.classList.toggle("active", i === acIndex));
}

/* Close the dropdown if the user clicks anywhere outside the search area */
document.addEventListener("click", e => {
  if (!e.target.closest(".search-wrap")) hideAC();
});

/* When the user picks a suggestion, save its coords and fetch weather */
function selectCity(place) {
  activeLat  = place.latitude;
  activeLon  = place.longitude;
  activeCity = [place.name, place.country].filter(Boolean).join(", ");
  cityInput.value = activeCity;
  hideAC();
  fetchWeather();
}


/* ============================================================
   8. SEARCH BUTTON
   If the user types a city and clicks Search (without picking
   from the dropdown), we geocode the text to get coordinates first.
============================================================ */
searchBtn.addEventListener("click", startSearch);

async function startSearch() {
  const q = cityInput.value.trim();
  if (!q) return;
  hideAC();

  try {
    show(loader);
    hideError();
    hideAllResults();

    // Step 1: Convert city name to lat/lon
    const url  = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en`;
    const res  = await fetch(url);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      hide(loader);
      showError(`"${q}" not found. Try a different spelling.`);
      return;
    }

    // Store the city and its coordinates
    const place = data.results[0];
    activeLat  = place.latitude;
    activeLon  = place.longitude;
    activeCity = [place.name, place.country].filter(Boolean).join(", ");

    // Step 2: Fetch the weather using those coordinates
    await fetchWeather();

  } catch {
    hide(loader);
    showError("Could not connect. Check your internet connection.");
  }
}


/* ============================================================
   9. MAIN WEATHER FETCH
   This is the core function. It calls the Open-Meteo Forecast API
   and gets all the data we need in a single request:
     - current_weather  → right now: temp, wind, weather code
     - hourly           → every hour for the next 7 days
     - daily            → daily max/min for 7 days
   Then it passes the data to the render functions below.
============================================================ */
async function fetchWeather() {
  show(loader);
  hideError();
  hideAllResults();

  try {
    /*
      Build the API URL.
      All the parameters after the ? tell Open-Meteo what data we want.
      timezone=auto means it uses the city's local time zone automatically.
    */
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${activeLat}&longitude=${activeLon}` +
      `&current_weather=true` +
      `&hourly=temperature_2m,weathercode` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max` +
      `&forecast_days=7` +
      `&timezone=auto`;

    const res  = await fetch(url);
    const data = await res.json();

    // Sanity check — make sure we got real data back
    if (!data.current_weather) {
      throw new Error("API returned no weather data.");
    }

    // Call each render function with the relevant part of the data
    renderCurrent(data);
    renderHourly(data);
    renderForecast(data.daily);

    // Also fetch last 30 days of historical data for the outlook card
    await fetchOutlook();

    // Remember this city so it reloads automatically next time
    localStorage.setItem("weatherCity", JSON.stringify({
      lat: activeLat,
      lon: activeLon,
      name: activeCity
    }));

    // Start the 60-second auto-refresh timer
    startRefresh();

  } catch (err) {
    showError("Failed to load weather. Please try again.");
    console.error(err); // shows the error in browser DevTools (F12 → Console)
  } finally {
    hide(loader); // always hide the loader, even if there was an error
  }
}


/* ============================================================
   10. RENDER: CURRENT WEATHER
   Fills in the current weather card with live data.
============================================================ */
function renderCurrent(data) {
  const cw    = data.current_weather;               // shortcut
  const [emoji, desc, theme] = getWMO(cw.weathercode); // look up the code
  const isDay = cw.is_day === 1;                    // 1 = day, 0 = night

  // Change the page background to match the weather
  setTheme(theme, isDay);

  // City name
  document.getElementById("cityName").textContent = activeCity;

  // Local date and time at the city (the API returns local time automatically)
  const localTime = new Date(cw.time);
  document.getElementById("localTime").textContent =
    localTime.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) +
    " · " +
    localTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // "Updated HH:MM:SS" badge — shows when data was last refreshed
  document.getElementById("updatedBadge").textContent =
    "Updated " + new Date().toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

  // Big weather emoji and temperature
  document.getElementById("currentEmoji").textContent = emoji;
  document.getElementById("currentTemp").textContent  = `${Math.round(cw.temperature)}°C`;
  document.getElementById("currentDesc").textContent  = desc;

  // Stats strip: wind, direction, day/night
  document.getElementById("statWind").textContent    = `${cw.windspeed} km/h`;
  document.getElementById("statDir").textContent     = degToCompass(cw.winddirection);
  document.getElementById("statDayNight").textContent = isDay ? "☀️ Day" : "🌙 Night";

  show(currentCard);
}


/* ============================================================
   11. RENDER: HOURLY STRIP (next 24 hours)
   Builds a scrollable row of hour "pills" showing
   the emoji and temperature for each of the next 24 hours.
============================================================ */
function renderHourly(data) {
  const scroll = document.getElementById("hourlyScroll");
  scroll.innerHTML = ""; // clear previous content

  /*
    The hourly array from the API contains data for 7 days.
    We need to find the current hour (matching current_weather.time)
    and then show only the next 24 hours from that point.
  */
  const nowStr   = data.current_weather.time; // e.g. "2025-07-03T14:00"
  const startIdx = Math.max(0, data.hourly.time.indexOf(nowStr));

  const times = data.hourly.time.slice(startIdx, startIdx + 24);
  const temps = data.hourly.temperature_2m.slice(startIdx, startIdx + 24);
  const codes = data.hourly.weathercode.slice(startIdx, startIdx + 24);

  times.forEach((timeStr, i) => {
    const [emoji] = getWMO(codes[i]);

    // Format the hour label — first entry shows "Now", rest show "3 PM" style
    const label = i === 0
      ? "Now"
      : new Date(timeStr).toLocaleTimeString([], { hour: "numeric" });

    // Build the hour pill element
    const pill = document.createElement("div");
    pill.className = "hour-pill" + (i === 0 ? " now-pill" : "");
    pill.innerHTML = `
      <span class="hour-time">${label}</span>
      <span class="hour-icon">${emoji}</span>
      <span class="hour-temp">${Math.round(temps[i])}°</span>
    `;
    scroll.appendChild(pill);
  });

  show(hourlyCard);
}


/* ============================================================
   12. RENDER: 7-DAY FORECAST
   Builds a list of rows, one per day, showing the weather
   emoji, description, high, and low temperature.
============================================================ */
function renderForecast(daily) {
  const list = document.getElementById("forecastList");
  list.innerHTML = ""; // clear previous content

  daily.time.forEach((dateStr, i) => {
    const [emoji, desc] = getWMO(daily.weathercode[i]);
    const date    = new Date(dateStr);

    // First row = "Today", rest = day name like "Monday"
    const dayName = i === 0
      ? "Today"
      : date.toLocaleDateString([], { weekday: "long" });

    const row = document.createElement("div");
    row.className = "forecast-row";
    row.innerHTML = `
      <span class="fc-day">${dayName}</span>
      <div class="fc-icon-desc">
        <span class="fc-icon">${emoji}</span>
        <span class="fc-desc">${desc}</span>
      </div>
      <span class="fc-min">${Math.round(daily.temperature_2m_min[i])}°</span>
      <span class="fc-max">${Math.round(daily.temperature_2m_max[i])}°</span>
    `;
    list.appendChild(row);
  });

  show(forecastCard);
}


/* ============================================================
   13. FETCH + RENDER: LAST 30 DAYS OUTLOOK
   Uses the Open-Meteo Historical Archive API to get actual
   recorded weather data for the past 30 days at this location.
   We then calculate:
     • Average daily high temperature
     • Average daily low temperature
     • Total rainfall in mm
     • Number of rainy days
   This gives real, meaningful context about the city's recent weather.
============================================================ */
async function fetchOutlook() {
  try {
    // Build date range: 30 days ago → yesterday
    const today = new Date();
    const end   = new Date(today);
    end.setDate(end.getDate() - 1);      // yesterday

    const start = new Date(today);
    start.setDate(start.getDate() - 30); // 30 days ago

    // Format dates as "YYYY-MM-DD" (what the API requires)
    const fmt = d => d.toISOString().slice(0, 10);

    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=${activeLat}&longitude=${activeLon}` +
      `&start_date=${fmt(start)}&end_date=${fmt(end)}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
      `&timezone=auto`;

    const res  = await fetch(url);
    const data = await res.json();

    if (!data.daily) return; // no historical data — skip silently

    // Filter out null values (some days may be missing)
    const maxTemps = data.daily.temperature_2m_max.filter(v => v != null);
    const minTemps = data.daily.temperature_2m_min.filter(v => v != null);
    const rainData = data.daily.precipitation_sum;

    // Calculate averages and totals
    const avgMax    = (maxTemps.reduce((a, b) => a + b, 0) / maxTemps.length).toFixed(1);
    const avgMin    = (minTemps.reduce((a, b) => a + b, 0) / minTemps.length).toFixed(1);
    const totalRain = rainData.reduce((a, b) => a + (b ?? 0), 0).toFixed(0);
    const rainyDays = rainData.filter(v => (v ?? 0) > 1).length; // >1mm = a rainy day

    renderOutlook(avgMax, avgMin, totalRain, rainyDays);

  } catch {
    hide(outlookCard); // if the historical API fails, just hide the section
  }
}

function renderOutlook(avgMax, avgMin, totalRain, rainyDays) {
  document.getElementById("outlookGrid").innerHTML = `
    <div class="outlook-stat">
      <div class="outlook-icon">🌡️</div>
      <div class="outlook-value">${avgMax}°C</div>
      <div class="outlook-key">Avg High</div>
    </div>
    <div class="outlook-stat">
      <div class="outlook-icon">🌙</div>
      <div class="outlook-value">${avgMin}°C</div>
      <div class="outlook-key">Avg Low</div>
    </div>
    <div class="outlook-stat">
      <div class="outlook-icon">🌧️</div>
      <div class="outlook-value">${totalRain}mm</div>
      <div class="outlook-key">Total Rain</div>
    </div>
  `;

  document.getElementById("outlookNote").textContent =
    `Based on real recorded data from the last 30 days · ${rainyDays} rainy days out of 30`;

  show(outlookCard);
}


/* ============================================================
   14. AUTO-REFRESH — every 60 seconds
   setInterval(fn, ms) calls fn repeatedly every ms milliseconds.
   60 * 1000 = 60,000 milliseconds = 1 minute.
   We clear the old timer first to avoid stacking multiple timers.
============================================================ */
function startRefresh() {
  clearInterval(refreshTimer);                          // cancel old timer if any
  refreshTimer = setInterval(fetchWeather, 60 * 1000); // refresh every 1 minute
}


/* ============================================================
   15. PAGE LOAD — runs when the HTML page finishes loading
   We check localStorage (browser memory) to see if the user
   searched a city before. If yes, load it immediately.
   If not, default to Ludhiana.
============================================================ */
window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("weatherCity");

  if (saved) {
    try {
      const { lat, lon, name } = JSON.parse(saved);
      activeLat  = lat;
      activeLon  = lon;
      activeCity = name;
      cityInput.value = name;
      fetchWeather();
    } catch {
      loadDefault(); // if saved data is broken, fall back to default
    }
  } else {
    loadDefault();
  }
});

/* Load the default city (Ludhiana) on first visit */
function loadDefault() {
  activeLat  = 30.9009;
  activeLon  = 75.8573;
  activeCity = "Ludhiana, India";
  cityInput.value = activeCity;
  fetchWeather();
}
