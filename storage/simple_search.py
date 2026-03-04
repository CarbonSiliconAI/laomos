import os
from linkedin_api import Linkedin

print("🔍 LinkedIn Bay Area Software Engineer Search")
print("=" * 50)

li_at = os.getenv("LINKEDIN_LI_AT")
jsessionid = os.getenv("LINKEDIN_JSESSIONID")

if not li_at or not jsessionid:
    print("❌ LinkedIn credentials not found")
    exit(1)

print(f"LI_AT length: {len(li_at)}")
print(f"JSESSIONID length: {len(jsessionid)}")

try:
    print("Authenticating with LinkedIn...")
    api = Linkedin("", "", cookies={"li_at": li_at, "JSESSIONID": jsessionid})
    print("✅ Authentication successful!")
    
    search_terms = ["software engineer bay area", "software engineer san francisco"]
    
    for term in search_terms:
        print(f"
--- Searching: {term} ---")
        try:
            results = api.search_people(keywords=term, limit=5)
            if results:
                print(f"Found {len(results)} results")
                for i, person in enumerate(results, 1):
                    name = f"{person.get('firstName', '')} {person.get('lastName', '')}".strip()
                    headline = person.get("headline", "N/A")
                    location = person.get("locationName", "N/A")
                    public_id = person.get("publicIdentifier", "N/A")
                    
                    print(f"{i}. {name}")
                    print(f"   📋 {headline}")
                    print(f"   📍 {location}")
                    if public_id != "N/A":
                        print(f"   🔗 linkedin.com/in/{public_id}")
                    print()
            else:
                print("   No results found")
        except Exception as e:
            print(f"   Error: {str(e)}")
    
    print("✅ Search completed!")
    
except Exception as e:
    print(f"❌ Error: {str(e)}")
    print("Your LinkedIn cookies may have expired.")

