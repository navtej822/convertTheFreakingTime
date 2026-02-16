const GPS_UNIX_EPOCH_DIFF = 315964800;
const NTP_UNIX_EPOCH_DIFF = 2208988800;
const SECONDS_PER_GPS_WEEK = 604800;

const BUILT_IN_LEAP_SECOND_EFFECTIVE_DATES = [
  "1981-07-01T00:00:00Z",
  "1982-07-01T00:00:00Z",
  "1983-07-01T00:00:00Z",
  "1985-07-01T00:00:00Z",
  "1988-01-01T00:00:00Z",
  "1990-01-01T00:00:00Z",
  "1991-01-01T00:00:00Z",
  "1992-07-01T00:00:00Z",
  "1993-07-01T00:00:00Z",
  "1994-07-01T00:00:00Z",
  "1996-01-01T00:00:00Z",
  "1997-07-01T00:00:00Z",
  "1999-01-01T00:00:00Z",
  "2006-01-01T00:00:00Z",
  "2009-01-01T00:00:00Z",
  "2012-07-01T00:00:00Z",
  "2015-07-01T00:00:00Z",
  "2017-01-01T00:00:00Z"
].map((iso) => Math.floor(Date.parse(iso) / 1000));

const LEAP_SECOND_DATA_SOURCES = [
  "https://data.iana.org/time-zones/tzdb/leap-seconds.list",
  "https://raw.githubusercontent.com/eggert/tz/main/leap-seconds.list"
];

let leapSecondEffectiveDates = [...BUILT_IN_LEAP_SECOND_EFFECTIVE_DATES];
let leapSecondSourceLabel = "built-in table (through 2017-01-01)";

const converterList = document.querySelector("#converter-list");
const template = document.querySelector("#converter-template");
const addConverterButton = document.querySelector("#add-converter");

addConverterButton.addEventListener("click", () => addConverterCard());

updateLeapSecondStatus();
void refreshLeapSecondTable();
addConverterCard();

function addConverterCard() {
  const clone = template.content.firstElementChild.cloneNode(true);
  const modeSelect = clone.querySelector(".input-mode");
  const input = clone.querySelector(".source-input");
  const convertBtn = clone.querySelector(".convert-btn");
  const clearBtn = clone.querySelector(".clear-btn");
  const removeBtn = clone.querySelector(".remove-btn");
  const statusText = clone.querySelector(".status-text");
  const resultsWrapper = clone.querySelector(".results-wrapper");

  convertBtn.addEventListener("click", () => {
    const source = input.value.trim();
    const mode = modeSelect.value;

    statusText.textContent = "";
    resultsWrapper.innerHTML = "";

    if (!source) {
      statusText.textContent = "Add some text or time before converting.";
      return;
    }

    const inputType = mode.startsWith("paragraph-") ? mode.replace("paragraph-", "") : mode;
    const tokens = extractTokensForType(source, inputType);

    if (tokens.length === 0) {
      statusText.textContent = "No valid time values found in the input.";
      return;
    }

    const conversions = convertTokens(tokens, inputType);
    if (conversions.length === 0) {
      statusText.textContent = "No valid time values found in the input.";
      return;
    }

    statusText.textContent = `Converted ${conversions.length} value${conversions.length === 1 ? "" : "s"}.`;
    conversions.forEach((record, index) => {
      resultsWrapper.append(createResultPanel(record, index));
    });
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    statusText.textContent = "";
    resultsWrapper.innerHTML = "";
  });

  removeBtn.addEventListener("click", () => {
    clone.remove();
    refreshConverterIndices();
  });

  converterList.append(clone);
  refreshConverterIndices();
}

function refreshConverterIndices() {
  [...converterList.querySelectorAll(".converter-index")].forEach((el, idx) => {
    el.textContent = String(idx + 1);
  });
}

function extractTokensForType(source, inputType) {
  if (inputType === "gps-week-seconds") {
    return [...source.matchAll(/\b\d{10}\b/g)].map((match) => match[0]);
  }

  if (inputType === "unix") {
    return [...source.matchAll(/\b\d{9,13}\b/g)].map((match) => match[0]);
  }

  if (inputType === "gps") {
    return [...source.matchAll(/\b\d{4,12}\b/g)].map((match) => match[0]);
  }

  return [];
}

function convertTokens(tokens, inputType) {
  const results = [];

  for (const token of tokens) {
    if (inputType === "unix") {
      const unixSeconds = parseUnixToSeconds(token);
      if (unixSeconds != null) {
        results.push(toConversionRecord(token, "Unix/POSIX", unixSeconds));
      }
      continue;
    }

    if (inputType === "gps") {
      const gpsSeconds = Number.parseInt(token, 10);
      if (Number.isFinite(gpsSeconds) && gpsSeconds >= 0) {
        results.push(toConversionRecord(token, "GPS seconds", gpsSecondsToUnixSeconds(gpsSeconds)));
      }
      continue;
    }

    if (inputType === "gps-week-seconds") {
      const parsed = parseGpsWeekSeconds(token);
      if (parsed) {
        const gpsSeconds = parsed.week * SECONDS_PER_GPS_WEEK + parsed.secondsOfWeek;
        results.push(toConversionRecord(token, "GPS WWWWSSSSSS", gpsSecondsToUnixSeconds(gpsSeconds)));
      }
    }
  }

  return deduplicateBySourceAndUnix(results);
}

function parseUnixToSeconds(raw) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return null;

  if (raw.length >= 13) {
    return Math.floor(value / 1000);
  }

  return value;
}

function parseGpsWeekSeconds(raw) {
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{10}$/.test(digits)) {
    return null;
  }

  const week = Number.parseInt(digits.slice(0, 4), 10);
  const secondsOfWeek = Number.parseInt(digits.slice(4), 10);

  if (secondsOfWeek >= SECONDS_PER_GPS_WEEK) {
    return null;
  }

  return { week, secondsOfWeek };
}

function updateLeapSecondStatus() {
  const statusElement = document.querySelector("#leap-second-status");
  if (!statusElement) return;

  const lastKnownLeap = leapSecondEffectiveDates[leapSecondEffectiveDates.length - 1];
  const yearsSinceLastLeap = (Date.now() / 1000 - lastKnownLeap) / (365.25 * 24 * 3600);
  const warning = yearsSinceLastLeap > 8 ? " New leap seconds may be added in the future." : "";

  statusElement.textContent = `Leap second table: ${leapSecondSourceLabel}.${warning}`;
}

async function refreshLeapSecondTable() {
  for (const source of LEAP_SECOND_DATA_SOURCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(source, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const payload = await response.text();
      const parsedDates = parseLeapSecondsList(payload);
      if (parsedDates.length === 0) continue;

      leapSecondEffectiveDates = parsedDates;
      const latest = new Date(parsedDates[parsedDates.length - 1] * 1000).toISOString().slice(0, 10);
      leapSecondSourceLabel = `online source (${source}) through ${latest}`;
      updateLeapSecondStatus();
      return;
    } catch {
      // Try next source.
    }
  }

  updateLeapSecondStatus();
}

function parseLeapSecondsList(content) {
  const rows = content.split(/\r?\n/);
  const parsed = [];

  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#")) continue;

    const columns = line.split(/\s+/);
    if (columns.length < 2) continue;

    const ntpSeconds = Number.parseInt(columns[0], 10);
    const taiMinusUtc = Number.parseInt(columns[1], 10);

    if (!Number.isFinite(ntpSeconds) || !Number.isFinite(taiMinusUtc)) continue;

    const gpsMinusUtc = taiMinusUtc - 19;
    if (gpsMinusUtc <= 0) continue;

    const unixSeconds = ntpSeconds - NTP_UNIX_EPOCH_DIFF;
    if (unixSeconds >= GPS_UNIX_EPOCH_DIFF) {
      parsed.push(unixSeconds);
    }
  }

  return parsed;
}

function leapSecondsAtUnix(unixSeconds) {
  let leapCount = 0;
  for (const threshold of leapSecondEffectiveDates) {
    if (unixSeconds >= threshold) {
      leapCount += 1;
    }
  }
  return leapCount;
}

function unixSecondsToGpsSeconds(unixSeconds) {
  return unixSeconds - GPS_UNIX_EPOCH_DIFF + leapSecondsAtUnix(unixSeconds);
}

function gpsSecondsToUnixSeconds(gpsSeconds) {
  let unix = gpsSeconds + GPS_UNIX_EPOCH_DIFF - 18;

  for (let i = 0; i < 4; i += 1) {
    unix = gpsSeconds + GPS_UNIX_EPOCH_DIFF - leapSecondsAtUnix(unix);
  }

  return unix;
}

function toGpsWeekSeconds(gpsSeconds) {
  const week = Math.floor(gpsSeconds / SECONDS_PER_GPS_WEEK);
  const secondsOfWeek = gpsSeconds % SECONDS_PER_GPS_WEEK;
  return `${String(week).padStart(4, "0")}${String(secondsOfWeek).padStart(6, "0")}`;
}

function toConversionRecord(source, detectedAs, unixSeconds) {
  if (!Number.isFinite(unixSeconds) || unixSeconds < 0) {
    return {
      source,
      detectedAs,
      invalid: true,
      reason: "Unable to convert this value to a valid UTC date."
    };
  }

  const gpsSeconds = unixSecondsToGpsSeconds(unixSeconds);

  return {
    source,
    detectedAs,
    unixSeconds,
    unixMilliseconds: unixSeconds * 1000,
    gpsSeconds,
    gpsWeekSeconds: toGpsWeekSeconds(gpsSeconds),
    humanUtc: new Date(unixSeconds * 1000).toISOString()
  };
}

function deduplicateBySourceAndUnix(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.source}|${record.unixSeconds}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createResultPanel(result, index) {
  const panel = document.createElement("section");
  panel.className = "result-item";

  if (result.invalid) {
    panel.innerHTML = `<p><strong>#${index + 1}</strong> ${escapeHtml(result.source)} — ${escapeHtml(
      result.reason
    )}</p>`;
    return panel;
  }

  panel.innerHTML = `
    <p><strong>#${index + 1}</strong> ${escapeHtml(result.source)} <em>(${escapeHtml(result.detectedAs)})</em></p>
    <dl class="result-grid">
      <dt>Human readable (UTC)</dt><dd>${escapeHtml(result.humanUtc)}</dd>
      <dt>Unix / POSIX seconds</dt><dd>${result.unixSeconds}</dd>
      <dt>Unix milliseconds</dt><dd>${result.unixMilliseconds}</dd>
      <dt>GPS seconds</dt><dd>${result.gpsSeconds}</dd>
      <dt>GPS WWWWSSSSSS</dt><dd>${result.gpsWeekSeconds}</dd>
    </dl>
  `;

  return panel;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
