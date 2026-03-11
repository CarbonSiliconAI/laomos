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

Full forecast with details:
```bash
curl --connect-timeout 5 -m 10 -s "wttr.in/London?format=j1"
# Returns JSON with current conditions and multi-day forecast
```

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
- When weather data will be used in subsequent actions (e.g., clothing recommendations), explicitly extract and format the weather information in a structured way for downstream consumption
- Provide weather data in clear, structured format with labeled fields (Temperature, Humidity, Wind, Conditions) to enable proper integration in multi-step workflows
- Use `format=j1` for JSON output when data needs to be parsed or passed to other tools programmatically
- Verify that all weather parameters (temperature, humidity, wind speed, conditions) are included in output before marking action complete
