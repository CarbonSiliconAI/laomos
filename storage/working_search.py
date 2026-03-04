#!/usr/bin/env python3
import os
from linkedin_api import Linkedin

def main():
    # Get credentials from environment variables
    li_at = li_at = "AQEDAWVJSiIFYgAPAAABnLdaMOIAAAGc22a04k0AC1cMSZnUPLZrdGv7t6_VJUUlGZYZ2122aLmv6qCcuslG_IX1GRvGfTymOgeDZJrEtfCUMhpuCgsCOh3TawAyL0L5kEmSLtiUw57Wrst23VlVTYVx"
    jsessionid = jsessionid = "ajax:1631019628487339649"
    
    print("Testing LinkedIn authentication...")
    print(f"LI_AT length: {len(li_at) if li_at else 0}")
    print(f"JSESSIONID length: {len(jsessionid) if jsessionid else 0}")
    
    if not li_at or not jsessionid:
        print("Error: LinkedIn cookies not found in environment variables")
        return
    
    try:
        # Initialize LinkedIn API with cookies
        api = Linkedin('', '', cookies={
            'li_at': li_at,
            'JSESSIONID': jsessionid
        })
        
        print("✅ Successfully authenticated with LinkedIn")
        
        # Search for engineers in Bay Area
        print("\n🔍 Searching for engineers in Bay Area...")
        
        search_terms = [
            "software engineer San Francisco",
            "engineer Bay Area", 
            "software engineer Silicon Valley",
            "engineer Palo Alto",
            "software developer San Jose"
        ]
        
        for term in search_terms:
            print(f"\n--- Searching: {term} ---")
            try:
                results = api.search_people(keywords=term, limit=3)
                
                if results:
                    for i, person in enumerate(results, 1):
                        name = person.get('name', 'N/A')
                        headline = person.get('headline', 'N/A')
                        location = person.get('location', 'N/A')
                        public_id = person.get('public_id', 'N/A')
                        
                        print(f"{i}. {name}")
                        print(f"   Title: {headline}")
                        print(f"   Location: {location}")
                        if public_id != 'N/A':
                            print(f"   Profile: linkedin.com/in/{public_id}")
                        print()
                else:
                    print("   No results found")
                    
            except Exception as e:
                print(f"   Error searching '{term}': {str(e)}")
        
    except Exception as e:
        print(f"❌ Authentication failed: {str(e)}")
        print("Your cookies may have expired. Please get fresh cookies from LinkedIn.")

if __name__ == "__main__":
    main()