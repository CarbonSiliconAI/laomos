import urllib.request
import json

try:
    with urllib.request.urlopen("http://wttr.in/?format=j1") as response:
        data = json.loads(response.read().decode())
        current = data["current_condition"][0]
        weather = data["weather"][0]
        
        print("Current Weather:")
        print(f"Temperature: {current[\"temp_C\"]}°C ({current[\"temp_F\"]}°F)")
        print(f"Condition: {current[\"weatherDesc\"][0][\"value\"]}")
        print(f"Humidity: {current[\"humidity\"]}%")
        print(f"Wind: {current[\"windspeedKmph\"]} km/h {current[\"winddir16Point\"]}")
        print(f"Feels like: {current[\"FeelsLikeC\"]}°C ({current[\"FeelsLikeF\"]}°F)")
        
        print("
Todays Forecast:")
        print(f"High: {weather[\"maxtempC\"]}°C ({weather[\"maxtempF\"]}°F)")
        print(f"Low: {weather[\"mintempC\"]}°C ({weather[\"mintempF\"]}°F)")
        
except Exception as e:
    print(f"Error getting weather data: {e}")
    print("Unable to connect to weather service")

