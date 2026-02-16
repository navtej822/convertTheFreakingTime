const GPS_UNIX_EPOCH_DIFF = 315964800;
const NTP_UNIX_EPOCH_DIFF = 2208988800;

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

function updateLeapSecondStatus() {
  const statusElement = document.querySelector("#leap-second-status");
  if (!statusElement) return;

  const lastKnownLeap = leapSecondEffectiveDates[leapSecondEffectiveDates.length - 1];
  const yearsSinceLastLeap = (Date.now() / 1000 - lastKnownLeap) / (365.25 * 24 * 3600);
  const warning = yearsSinceLastLeap > 8
    ? " New leap seconds may be added in the future."
    : "";

  statusElement.textContent = `Leap second table: ${leapSecondSourceLabel}.${warning}`;
}

async function refreshLeapSecondTable() {
  for (const source of LEAP_SECOND_DATA_SOURCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(source, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      const text = await response.text();
      const parsedDates = parseLeapSecondsList(text);
      if (parsedDates.length === 0) {
        continue;
      }

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

    if (!Number.isFinite(ntpSeconds) || !Number.isFinite(taiMinusUtc)) {
      continue;
    }

    const gpsMinusUtc = taiMinusUtc - 19;
    if (gpsMinusUtc <= 0) {
      continue;
    }

    const unixSeconds = ntpSeconds - NTP_UNIX_EPOCH_DIFF;
    if (unixSeconds >= GPS_UNIX_EPOCH_DIFF) {
      parsed.push(unixSeconds);
    }
  }

  return parsed;
}

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
    const mode = modeSelect.value;
    const source = input.value.trim();

    resultsWrapper.innerHTML = "";

    if (!source) {
      statusText.textContent = "Add some text or time before converting.";
      return;
    }

    const conversions = mode === "paragraph" ? convertParagraph(source) : convertSingleSource(source, mode);

    if (conversions.length === 0) {
      statusText.textContent = "No valid time values found in the input.";
      return;
    }

    statusText.textContent = `Converted ${conversions.length} value${conversions.length === 1 ? "" : "s"}.`;
    conversions.forEach((result, index) => {
      resultsWrapper.append(createResultPanel(result, index));
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

function convertSingleSource(source, mode) {
  const cleaned = source.trim();

  if (mode === "unix") {
    const unixSeconds = parseUnixToSeconds(cleaned);
    return unixSeconds == null ? [] : [toConversionRecord(cleaned, "Unix/POSIX", unixSeconds)];
  }

  if (mode === "gps") {
    const gpsSeconds = Number.parseInt(cleaned, 10);
    if (!Number.isFinite(gpsSeconds)) return [];
    return [toConversionRecord(cleaned, "GPS seconds", gpsSecondsToUnixSeconds(gpsSeconds))];
  }

  if (mode === "gps-week-seconds") {
    const parsed = parseGpsWeekSeconds(cleaned);
    if (!parsed) return [];
    const gpsSeconds = parsed.week * 604800 + parsed.secondsOfWeek;
    return [toConversionRecord(cleaned, "GPS WWWWSSSSSS", gpsSecondsToUnixSeconds(gpsSeconds))];
  }

  const detected = detectTokenType(cleaned, source.toLowerCase());
  if (!detected) return [];

  if (detected.type === "unix") {
    const unixSeconds = parseUnixToSeconds(cleaned);
    return unixSeconds == null ? [] : [toConversionRecord(cleaned, "Auto detected Unix/POSIX", unixSeconds)];
  }

  if (detected.type === "gps") {
    return [toConversionRecord(cleaned, "Auto detected GPS seconds", gpsSecondsToUnixSeconds(detected.gpsSeconds))];
  }

  return [
    toConversionRecord(
      cleaned,
      "Auto detected GPS WWWWSSSSSS",
      gpsSecondsToUnixSeconds(detected.week * 604800 + detected.secondsOfWeek)
    )
  ];
}

function convertParagraph(paragraph) {
  const matches = paragraph.matchAll(/\b\d{4,13}\b/g);
  const lower = paragraph.toLowerCase();
  const results = [];

  for (const match of matches) {
    const token = match[0];
    const index = match.index ?? 0;
    const localContext = lower.slice(Math.max(0, index - 25), Math.min(lower.length, index + token.length + 25));
    const detected = detectTokenType(token, localContext);
    if (!detected) continue;

    if (detected.type === "unix") {
      const unixSeconds = parseUnixToSeconds(token);
      if (unixSeconds != null) {
        results.push(toConversionRecord(token, "Detected Unix/POSIX in paragraph", unixSeconds));
      }
      continue;
    }

    if (detected.type === "gps") {
      results.push(
        toConversionRecord(token, "Detected GPS seconds in paragraph", gpsSecondsToUnixSeconds(detected.gpsSeconds))
      );
      continue;
    }

    results.push(
      toConversionRecord(
        token,
        "Detected GPS WWWWSSSSSS in paragraph",
        gpsSecondsToUnixSeconds(detected.week * 604800 + detected.secondsOfWeek)
      )
    );
  }

  return deduplicateBySourceAndUnix(results);
}

function detectTokenType(token, context) {
  const stripped = token.replace(/\s+/g, "");

  if (!/^\d+$/.test(stripped)) {
    return null;
  }

  const gpsWeekSeconds = parseGpsWeekSeconds(stripped);
  const value = Number.parseInt(stripped, 10);

  if (/unix|posix|epoch/.test(context)) {
    return { type: "unix" };
  }

  if (/gps\s*(week|wwww|tow|seconds|time)/.test(context) && gpsWeekSeconds) {
    return { type: "gps-week-seconds", ...gpsWeekSeconds };
  }

  if (/gps/.test(context) && Number.isFinite(value)) {
    return { type: "gps", gpsSeconds: value };
  }

  if (stripped.length === 13) {
    return { type: "unix" };
  }

  if (gpsWeekSeconds && stripped.length === 10 && !/^1[6-9]\d{8}$/.test(stripped)) {
    return { type: "gps-week-seconds", ...gpsWeekSeconds };
  }

  if (stripped.length >= 9 && stripped.length <= 10) {
    if (value < 1600000000) {
      return { type: "gps", gpsSeconds: value };
    }
    return { type: "unix" };
  }

  if (stripped.length === 11 || stripped.length === 12) {
    return { type: "gps", gpsSeconds: value };
  }

  return null;
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
  const value = raw.replace(/\D/g, "");
  if (!/^\d{10}$/.test(value)) {
    return null;
  }

  const week = Number.parseInt(value.slice(0, 4), 10);
  const secondsOfWeek = Number.parseInt(value.slice(4), 10);

  if (secondsOfWeek >= 604800) {
    return null;
  }

  return { week, secondsOfWeek };
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
  const week = Math.floor(gpsSeconds / 604800);
  const secondsOfWeek = gpsSeconds % 604800;
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
  const isoDate = new Date(unixSeconds * 1000).toISOString();

  return {
    source,
    detectedAs,
    unixSeconds,
    unixMilliseconds: unixSeconds * 1000,
    gpsSeconds,
    gpsWeekSeconds: toGpsWeekSeconds(gpsSeconds),
    humanUtc: isoDate
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
