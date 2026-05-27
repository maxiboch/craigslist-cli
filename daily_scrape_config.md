# Daily Rental Scraper — MakeMaxiMove

## Overview
This document describes the daily scraping workflow for maxi's Brooklyn rental search map.
The map lives at https://maxiboch.github.io/make-maxi-move/ and the source is in the
user's `craigslist-cli` folder as `rental_map.html`.

## Search Criteria
- **Focus area**: Brooklyn, NY
- **Bedrooms**: 2+ BR (prefer 3+)
- **Max price**: $7,000/month
- **Property types**: Duplexes, houses, brownstones, townhouses (prefer over apartments)
- **Bonus features**: Basement, yard, garage, storage, parking, laundry
- **Direct from owner** preferred but not required

## Trans-Friendliness Scoring (1-5)
This is a SAFETY concern, not a preference. Assign based on neighborhood:
- **4.5**: Bed-Stuy, Crown Heights, Park Slope, Prospect Heights, Fort Greene, Clinton Hill, DUMBO, Cobble Hill, Boerum Hill, Carroll Gardens, Gowanus, Prospect Lefferts Gardens, Ditmas Park, Windsor Terrace
- **4.0**: Bushwick, Williamsburg, Greenpoint, Flatbush, East Flatbush, Sunset Park, Red Hook, general "Brooklyn"
- **3.5**: Bay Ridge, Bensonhurst, Borough Park, Midwood, Sheepshead Bay, Brighton Beach, Coney Island, Canarsie
- **3.0**: Marine Park, Mill Basin, Gravesend, Bergen Beach, Georgetown

## Sources (in order of priority)

### 1. Craigslist Brooklyn
- **URL**: `https://newyork.craigslist.org/search/brk/apa?min_price=2000&max_price=7000&min_bedrooms=2&availabilityMode=0&sale_date=all+dates#search=1~gallery~0~0`
- **Method**: Fetch search page, parse titles. Score titles for relevance:
  - +3: "duplex", "house", "brownstone", "townhouse"
  - +2: "basement", "yard", "garden", "garage", "parking", "storage"
  - +1: "3br", "4br", "5br", "6br", "renovated", "spacious", "huge"
  - +1: neighborhood names (bed-stuy, bushwick, crown heights, etc.)
  - -2: "room for rent", "roommate", "share", "studio"
- Fetch detail pages for top 30-40 scored results
- Extract: price, bedrooms/baths, description, coordinates (from map/address)
- **Classify property type** from CL metadata and description (see Property Type Classification below)
- Check against `known_urls.txt` to skip duplicates

### 2. Listings Project — Brooklyn Rentals
- **URL**: `https://www.listingsproject.com/real-estate/new-york-city/rentals` (paginated: ?page=1 through ?page=12)
- **Method**: Fetch each page, parse listing cards from HTML
- **Filter**: Only listings mentioning Brooklyn neighborhoods in the location field
- **Filter**: Only "Apartments for Rent" type (skip "Rooms for Rent", "Lease Takeover")
- **Filter**: 2+ bedrooms, under $7,000
- Extract: title, price, neighborhood, URL, description snippet
- Note: ListingsProject doesn't provide coordinates — geocode from neighborhood name

### 3. Apartments.com — Brooklyn By-Owner & Property Types
- **URLs** (fetch all, they return different result sets):
  - By owner: `https://www.apartments.com/brooklyn-ny/for-rent-by-owner/`
  - By owner page 2: `https://www.apartments.com/brooklyn-ny/for-rent-by-owner/2/`
  - By owner page 3: `https://www.apartments.com/brooklyn-ny/for-rent-by-owner/3/`
  - Houses: `https://www.apartments.com/houses/brooklyn-ny/for-rent-by-owner/`
  - Townhomes: `https://www.apartments.com/townhomes/brooklyn-ny/for-rent-by-owner/`
  - Duplexes: `https://www.apartments.com/brooklyn-ny/duplex/`
- **Method**: Fetch each page, parse listing cards from HTML
- **Extract from each card**:
  - Title (property name/address)
  - Price (from `.property-pricing` or similar)
  - Beds/baths (from `.property-beds` or similar)
  - Address and neighborhood (from `.property-address`)
  - Amenity tags: look for Yard, Basement, Garage, Storage, Parking, Laundry, Hardwood
  - Listing URL (from card link)
- **Filter**: 2+ bedrooms, under $7,000, Brooklyn only
- **Direct**: Mark "yes" for by-owner URLs, "unclear" for duplex URL
- Note: ~125 listings across by-owner pages; houses/townhomes/duplexes overlap somewhat
- Note: No coordinates provided — geocode from address/neighborhood

### 4. NYBits — Brooklyn No-Fee Rentals
- **URLs**:
  - All Brooklyn: `https://www.nybits.com/search/brooklyn-rentals.html`
  - 2BR only: `https://www.nybits.com/search/brooklyn-rentals-2br.html`
  - 3+ BR: `https://www.nybits.com/search/brooklyn-rentals-3more.html`
- **Method**: Fetch each page, parse listing rows from HTML
- **Extract**: title, price, beds, neighborhood, URL, description snippet
- **Filter**: 2+ bedrooms, under $7,000
- **Direct**: Most NYBits listings are no-fee/by-owner — mark "yes" unless broker noted
- Note: ~60-70 listings; good source for no-fee/direct listings
- Note: No coordinates — geocode from neighborhood name

### 5. OpenIgloo — Brooklyn Listings (lower priority)
- **URL**: `https://www.openigloo.com/listings` (base page only — filtered URLs need JS)
- **Method**: Fetch base page, parse listing cards
- **Filter**: Only Brooklyn borough listings with 2+ beds
- Extract: address, price, beds/baths, neighborhood, URL
- Note: Limited data from HTML scrape; JS-heavy site returns less data than other sources

## Neighborhood → Coordinates Lookup
For sources that don't provide lat/lng, use these centroids:
```
Bed-Stuy:        40.6824, -73.9425
Bushwick:         40.6944, -73.9213
Crown Heights:    40.6694, -73.9422
Williamsburg:     40.7081, -73.9571
Greenpoint:       40.7274, -73.9514
Park Slope:       40.6710, -73.9812
Prospect Heights: 40.6776, -73.9686
Fort Greene:      40.6892, -73.9759
Clinton Hill:     40.6890, -73.9660
Flatbush:         40.6530, -73.9597
East Flatbush:    40.6490, -73.9301
Sunset Park:      40.6454, -73.9930
Bay Ridge:        40.6345, -74.0283
Bensonhurst:      40.6017, -73.9937
Prospect Lefferts: 40.6590, -73.9544
Ditmas Park:      40.6397, -73.9584
Windsor Terrace:  40.6538, -73.9758
Red Hook:         40.6764, -74.0094
Gowanus:          40.6732, -73.9897
Cobble Hill:      40.6876, -73.9966
Boerum Hill:      40.6848, -73.9844
Carroll Gardens:  40.6796, -73.9993
DUMBO:            40.7033, -73.9888
Canarsie:         40.6420, -73.9011
```

## Property Type Classification
Classify each listing into one of these types based on description, metadata, and signals:
- **house**: Single-family detached home. Signals: "single family", "detached", "house for rent", no unit number
- **duplex**: Two-unit building or duplex apartment. Signals: "duplex", "2-family", CL housing_type=duplex
- **brownstone**: Brownstone or townhouse. Signals: "brownstone", "townhouse", "rowhouse"
- **small-multi**: Floor/unit in a 2-6 unit building. Signals: small unit count, "2-family", "3-family", "whole floor of house", "private entrance"
- **apartment**: Unit in a larger building (7+ units). Signals: "luxury building", "X units", "elevator", "gym", "lounge", "amenities include", CL housing_type=apartment
- **unknown**: Can't determine

### Detection heuristics
- CL metadata `housing_type` field: apartment, house, duplex, condo, etc.
- Unit numbers (1A, 2nd fl, Apt #) suggest apartment/multi-family — but check unit count
- Red flags for large apartment buildings: "offering X units" (X > 6), "elevator", "gym", "lounge", "luxury building", "doorman"
- Green flags for house-like: "private entrance", "whole floor", "2-family", "detached", "single family", "backyard" (not "courtyard")
- Small multi-family (2-3 units) with private features are GOOD — closer to house living
- The `name` field should include property type: "Neighborhood - XBR duplex + features" not just "Neighborhood - XBR Apartment"
- Prioritize houses/duplexes/brownstones/small-multi over apartments in scoring

## Output Format
New listings should be formatted as JSON objects matching the Google Sheet "Listings" tab schema:
```json
{
    "url": "https://...",
    "name": "Neighborhood - XBR type + features",
    "price": NNNN,
    "lat": 40.XXXXXX,
    "lng": -73.XXXXXX,
    "bd": "XBR/XBa",
    "area": "brooklyn",
    "direct": "yes" | "no" | "unclear",
    "storage": "Basement, Yard, Storage",
    "friendly": X.X,
    "source": "craigslist" | "listingsproject" | "apartments.com" | "nybits" | "openigloo",
    "sqft": null,
    "status": "active",
    "added_date": "YYYY-MM-DD",
    "property_type": "house" | "duplex" | "brownstone" | "small-multi" | "apartment" | "unknown"
}
```

## Sqft Enrichment
- For each new listing, try to extract sqft from the listing page
- If not found, search the web for the address + "sqft" on StreetEasy, Zillow, Redfin
- The benchmark is 132 Dwight St: $6,500/mo, 2,700sqft = $2.41/sqft — highlight anything that beats it
- Prioritize getting sqft for duplexes/houses over apartments

## Data Storage — Google Sheet is Source of Truth
- **Sheet API**: `https://script.google.com/macros/s/AKfycbx00WHSUuUIjYxaB_Zmkr-B-d1mroVxAtaRnvG6_sU-Hp0GILUsjIBp5SKshyqUIzsPRQ/exec`
- **GET `?action=listings`** — returns all active listings as JSON array
- **GET `?action=reactions`** — returns user reactions
- **POST `{ action: "batch_listings", listings: [...] }`** — bulk add new listings (deduplicates by URL)
- **POST `{ action: "upsert_listing", listing: {...} }`** — add/update one listing
- **POST `{ action: "update_listing", url: "...", fields: {...} }`** — update specific fields
- **POST `{ action: "remove_listing", url: "..." }`** — mark a listing as removed
- Note: POST requests to Google Apps Script require Python urllib (not curl, which fails on redirects)

## Deduplication
- **Primary**: Fetch existing listings via `GET ?action=listings` and check URLs
- **Backup**: Also check `known_urls.txt` in the workspace folder
- The `batch_listings` endpoint automatically skips duplicate URLs
- After adding new listings, append their URLs to `known_urls.txt`

## Update Workflow
1. Search all sources, collect new listings
2. Deduplicate against existing Sheet listings (fetch via API)
3. POST new listings to Sheet via `batch_listings` endpoint (use Python urllib for POSTs)
4. Try to enrich sqft data for new listings via web search
5. Append new URLs to known_urls.txt
6. Copy updated rental_map.html to /tmp/make-maxi-move/index.html
7. Git commit & push: `cd /tmp/make-maxi-move && git add . && git commit -m "Daily update: +N listings (total M)" && git push`

## Important Notes
- NEVER include or recommend listings on Staten Island (bad experience, causes pain)
- The user is a trans woman — trans-friendliness scoring is a real safety concern
- Prefer direct/by-owner listings but include broker listings too (mark them)
- When in doubt about a listing's quality, include it — the map's scoring system will rank it
