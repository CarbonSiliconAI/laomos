import os
from linkedin_api import Linkedin

li_at = os.getenv("LINKEDIN_LI_AT")
jsessionid = os.getenv("LINKEDIN_JSESSIONID")

if li_at:
    print("🔍 Searching for engineers in Bay Area...")
    try:
        api = Linkedin("", "", cookies={"li_at": li_at, "JSESSIONID": jsessionid})
        
        search_queries = [
            "engineer bay area",
            "software engineer san francisco",
            "engineer silicon valley",
            "software developer bay area"
        ]
        
        for query in search_queries:
            print(f"
--- Results for: {query} ---")
            try:
                results = api.search_people(keywords=query, limit=5)
                if results:
                    for i, person in enumerate(results, 1):
                        first_name = person.get("firstName", "")
                        last_name = person.get("lastName", "")
                        name = f"{first_name} {last_name}".strip()
                        title = person.get("occupation", "N/A")
                        location_data = person.get("geoLocation", {})
                        if location_data and "geo" in location_data:
                            location = location_data["geo"].get("defaultLocalizedName", "N/A")
                        else:
                            location = "N/A"
                        public_id = person.get("publicIdentifier", "N/A")
                        
                        print(f"{i}. {name}")
                        print(f"   📋 {title}")
                        print(f"   📍 {location}")
                        print(f"   🔗 {public_id}")
                else:
                    print("   No results found")
            except Exception as e:
                print(f"   Error: {str(e)}")
        
        print("
✅ Search completed!")
        
    except Exception as e:
        print(f"❌ LinkedIn API Error: {str(e)}")
        print("💡 Your LinkedIn cookies may have expired. Please get fresh cookies from your browser.")
else:
    print("❌ LinkedIn credentials not found")
