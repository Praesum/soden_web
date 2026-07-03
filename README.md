# South Denver Warlord Static Site

Static webpage for `sodenwarlord.com` with editable event data and Google Calendar links.

## Run locally

### Windows
Double-click `run_local.bat`, or run:

```bat
run_local.bat 8080
```

Open: `http://localhost:8080`

### macOS / Linux
Run:

```bash
./run_local.sh 8080
```

Open: `http://localhost:8080`

## Edit site text and events

Edit `events.json`.

```json
{
  "description": "Single paragraph shown under the page title.",
  "timezone": "America/Denver",
  "events": [
    {
      "title": "Event title",
      "start": "2026-07-10T18:30:00-06:00",
      "end": "2026-07-10T21:30:00-06:00",
      "location": "South Denver, CO",
      "description": "Event details."
    }
  ]
}
```

Use ISO timestamps with timezone offsets. For Colorado daylight time, use `-06:00`; for standard time, use `-07:00`.

## Host as static files

Upload the folder contents to your web root. The site needs only these files:

- `index.html`
- `events.json`
- `assets/styles.css`
- `assets/app.js`
- `assets/favicon.svg`

## Docker option

```bash
docker build -t sodenwarlord .
docker run --rm -p 8080:80 sodenwarlord
```

Open: `http://localhost:8080`
