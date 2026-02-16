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

- Convert a single time value or scan a paragraph for multiple time values.
- Automatic type detection with manual override modes.
- Concurrent multi-converter cards with a `+ Add Converter` button.
- Shows human-readable UTC output along with all supported formats.
