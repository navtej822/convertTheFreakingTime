# convertTheFreakingTime

Frontend-only web app to convert:
- Unix / POSIX (epoch) time
- GPS seconds
- GPS time in `WWWWSSSSSS`

## Run locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Features

- Convert single values or scan paragraphs for multiple values.
- Explicit input type selection (no auto-detection guesses).
- Robust token extraction from surrounding text (e.g. `Interval(start=1455306978, end=1455307008)`).
- Concurrent multi-converter cards with a `+ Add Converter` button.
- Shows human-readable UTC output along with all supported formats.
- Uses a built-in leap-second table and attempts an online refresh from IANA/tz data for long-term accuracy.
