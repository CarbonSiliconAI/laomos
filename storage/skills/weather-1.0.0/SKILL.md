---
name: weather
description: Get current weather and forecasts (no API key required).
homepage: https://wttr.in/:help
metadata: {"clawdbot":{"emoji":"🌤️","requires":{"bins":["curl"]}}}
---

# Weather

Two free services, no API keys needed.

## wttr.in (primary)

Quick one-liner:
curl --connect-timeout 5 -m 10 -s "wttr.in/London?format=3"
# Output: London: ⛅️ +8°C

Compact format:
```bash
curl --connect-timeout 5 -m 10 -s "wttr.in/London?format=%l:+%c+%t+%h+%w"
# Output: London: ⛅️ +8°C 71% ↙5km/h
```

Full forecast:
```bash
curl --connect-timeout 5 -m 10 -s "wttr.in/London?T"
```

Format codes: `%c` condition · `%t` temp · `%h` humidity · `%w` wind · `%l` location · `%m` moon

Tips:
- URL-encode spaces: `wttr.in/New+York`
- Airport codes: `wttr.in/JFK`
- Units: `?m` (metric) `?u` (USCS)
- Today only: `?1` · Current only: `?0`
- PNG: `curl --connect-timeout 5 -m 10 -s "wttr.in/Berlin.png" -o /tmp/weather.png`

## Open-Meteo (fallback, JSON)

Free, no key, good for programmatic use:
```bash
curl --connect-timeout 5 -m 10 -s "https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&current_weather=true"
```

Find coordinates for a city, then query. Returns JSON with temp, windspeed, weathercode.

Docs: https://open-meteo.com/en/docs

## Error Handling

If wttr.in is unavailable, fall back to Open-Meteo with coordinate lookup:
```bash
# Example fallback pattern
curl --connect-timeout 5 -m 10 -s "wttr.in/London?format=3" || \
curl --connect-timeout 5 -m 10 -s "https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&current_weather=true&temperature_unit=fahrenheit"
```

## Important Notes

- Always include `--connect-timeout 5` to prevent hanging on network issues
- Use `-m 10` (10 second max operation time) for reliability
- For location-based queries without explicit location, wttr.in auto-detects from IP
- Ensure responses complete before proceeding to dependent tasks
- Test API availability before chaining weather queries with other operations
