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
curl --connect-timeout 5 -m 10 -s "wttr.in/London?format=%l:+%c+%t+%h+%w"
# Output: London: ⛅️ +8°C 71% ↙5km/h

ASCII art forecast:
```bash
curl --connect-timeout 5 -m 10 -s "wttr.in/London"
# Returns formatted ASCII art with detailed forecast
```

Format codes: `%c` condition · `%t` temp · `%h` humidity · `%w` wind · `%l` location · `%m` moon · `%p` pressure

Tips:
- URL-encode spaces: `wttr.in/New+York`
- Airport codes: `wttr.in/JFK`
- Units: `?m` (metric) `?u` (USCS)
- Today only: `?1` · Current only: `?0`
- PNG: `curl --connect-timeout 5 -m 10 -s "wttr.in/Berlin.png" -o /tmp/weather.png`
- Auto-detect location from IP: `wttr.in/?format=...` (no location specified)

## Open-Meteo (fallback, JSON)

Free, no key, good for programmatic use and data extraction:
```bash
curl --connect-timeout 5 -m 10 -s "https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&current_weather=true&temperature_unit=fahrenheit"
```

Find coordinates for a city, then query. Returns JSON with temp, windspeed, weathercode.

Docs: https://open-meteo.com/en/docs

## Error Handling

If wttr.in is unavailable, fall back to Open-Meteo with coordinate lookup:
```bash
# Example fallback pattern
curl --connect-timeout 5 -m 10 -s "wttr.in/?format=j1" || \
curl --connect-timeout 5 -m 10 -s "https://api.open-meteo.com/v1/forecast?latitude=37.5&longitude=-122.0&current_weather=true&temperature_unit=fahrenheit"
```

## Critical Implementation Notes

- Always include `--connect-timeout 5` to prevent hanging on network issues
- Use `-m 10` (10 second max operation time) for reliability
- For location-based queries without explicit location, wttr.in auto-detects from IP address
- Ensure responses complete and are fully captured before proceeding to dependent tasks
- Test API availability before chaining weather queries with other operations
- **CRITICAL FOR MULTI-STEP WORKFLOWS**: When weather data is retrieved, explicitly pass the complete weather information (temperature, conditions, humidity, wind speed, forecast details) to any downstream actions that depend on it
- Always store weather data in a clearly formatted summary that includes:
  - Current temperature and conditions
  - Humidity and wind speed
  - 3-day forecast with hourly breakdowns
  - Specific numeric values (not just descriptions)
- For clothing/outfit recommendations or any weather-dependent guidance, the downstream action MUST receive the full weather context, not just a generic template
