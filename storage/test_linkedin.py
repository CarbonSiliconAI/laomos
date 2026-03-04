import os
from linkedin_api import Linkedin

li_at = os.getenv("LINKEDIN_LI_AT")
if li_at:
    print("LinkedIn credentials found")
    try:
        api = Linkedin("", "", cookies={"li_at": li_at})
        results = api.search_people(keywords="engineer bay area", limit=3)
        print("Found", len(results), "engineers in Bay Area:")
        for i, person in enumerate(results[:3], 1):
            name = person.get("firstName", "") + " " + person.get("lastName", "")
            title = person.get("occupation", "N/A")
            print(f"{i}. {name} - {title}")
    except Exception as e:
        print("Error:", str(e))
else:
    print("No LinkedIn credentials found")
