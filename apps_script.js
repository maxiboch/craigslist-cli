// === GOOGLE APPS SCRIPT — MakeMaxiMove Rental Map ===
// Deploy: Extensions > Apps Script > Deploy > Web app > Execute as "Me" > Anyone
// Two tabs:
//   "Listings" — ground truth for all rental listings (one row per listing)
//   "MakeMaxiMove" — per-user reactions/status (one row per url+user pair)
//
// GET endpoints:
//   ?action=listings         → returns all active listings as JSON array
//   ?action=reactions        → returns reactions object { url: { user: {...} } }
//   (no params)              → returns reactions (backwards compat)
//
// POST endpoints:
//   { action: "upsert_listing", listing: {...} }  → add/update one listing
//   { action: "batch_listings", listings: [...] } → bulk import listings
//   { action: "remove_listing", url: "..." }      → mark listing as removed
//   { action: "reaction", url, user, interest, status, notes } → save reaction
//   (legacy: { url, user, interest, status, notes })           → save reaction

// ============ LISTINGS TAB ============
// Columns: url | name | price | lat | lng | bd | area | direct | storage | friendly | source | sqft | status | added_date | property_type

const LISTINGS_HEADERS = ['url','name','price','lat','lng','bd','area','direct','storage','friendly','source','sqft','status','added_date','property_type'];
const REACTIONS_HEADERS = ['url','user','interest','status','notes','updated_at'];

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'reactions';

  if (action === 'listings') {
    return getListings();
  } else {
    return getReactions();
  }
}

function getListings() {
  const sheet = getOrCreateSheet('Listings', LISTINGS_HEADERS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }

  const headers = data[0];
  const listings = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // skip empty rows
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      // Convert numeric fields
      if (['price','lat','lng','friendly','sqft'].includes(headers[j])) {
        val = val === '' || val === null ? null : Number(val);
      }
      obj[headers[j]] = val;
    }
    // Only return active listings by default
    if (obj.status !== 'removed' && obj.status !== 'scam') {
      listings.push(obj);
    }
  }

  return ContentService.createTextOutput(JSON.stringify(listings)).setMimeType(ContentService.MimeType.JSON);
}

function getReactions() {
  const sheet = getOrCreateSheet('MakeMaxiMove', REACTIONS_HEADERS);
  const data = sheet.getDataRange().getValues();
  const result = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const url = row[0];
    const user = row[1];
    if (!url || !user) continue;
    if (!result[url]) result[url] = {};
    result[url][user] = {
      interest: row[2] || 'new',
      status: row[3] || 'new',
      notes: row[4] || '',
      updated_at: row[5] || ''
    };
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ============ POST HANDLER ============

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const action = payload.action || 'reaction';

  switch(action) {
    case 'upsert_listing':
      return upsertListing(payload.listing);
    case 'batch_listings':
      return batchListings(payload.listings);
    case 'remove_listing':
      return removeListing(payload.url);
    case 'update_listing':
      return updateListingFields(payload.url, payload.fields);
    default:
      return saveReaction(payload);
  }
}

function upsertListing(listing) {
  const sheet = getOrCreateSheet('Listings', LISTINGS_HEADERS);
  const data = sheet.getDataRange().getValues();

  // Check if URL already exists
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === listing.url) {
      // Update existing row
      const row = LISTINGS_HEADERS.map(h => listing[h] !== undefined ? listing[h] : data[i][LISTINGS_HEADERS.indexOf(h)]);
      sheet.getRange(i+1, 1, 1, row.length).setValues([row]);
      return ContentService.createTextOutput(JSON.stringify({ok:true, action:'updated'})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Add new row
  const row = LISTINGS_HEADERS.map(h => listing[h] !== undefined ? listing[h] : '');
  sheet.appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({ok:true, action:'created'})).setMimeType(ContentService.MimeType.JSON);
}

function batchListings(listings) {
  const sheet = getOrCreateSheet('Listings', LISTINGS_HEADERS);
  const data = sheet.getDataRange().getValues();

  // Build index of existing URLs
  const existingUrls = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) existingUrls.add(data[i][0]);
  }

  // Only add new listings (skip duplicates)
  const newRows = [];
  let skipped = 0;

  for (const listing of listings) {
    if (existingUrls.has(listing.url)) {
      skipped++;
      continue;
    }
    const row = LISTINGS_HEADERS.map(h => listing[h] !== undefined ? (listing[h] === null ? '' : listing[h]) : '');
    newRows.push(row);
    existingUrls.add(listing.url);
  }

  if (newRows.length > 0) {
    sheet.getRange(data.length + 1, 1, newRows.length, LISTINGS_HEADERS.length).setValues(newRows);
  }

  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    added: newRows.length,
    skipped: skipped,
    total: data.length - 1 + newRows.length
  })).setMimeType(ContentService.MimeType.JSON);
}

function removeListing(url) {
  const sheet = getOrCreateSheet('Listings', LISTINGS_HEADERS);
  const data = sheet.getDataRange().getValues();
  const statusCol = LISTINGS_HEADERS.indexOf('status') + 1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === url) {
      sheet.getRange(i+1, statusCol).setValue('removed');
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({error:'not found'})).setMimeType(ContentService.MimeType.JSON);
}

function updateListingFields(url, fields) {
  const sheet = getOrCreateSheet('Listings', LISTINGS_HEADERS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === url) {
      for (const [key, val] of Object.entries(fields)) {
        const col = LISTINGS_HEADERS.indexOf(key);
        if (col >= 0) {
          sheet.getRange(i+1, col+1).setValue(val === null ? '' : val);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({error:'not found'})).setMimeType(ContentService.MimeType.JSON);
}

function saveReaction(payload) {
  const sheet = getOrCreateSheet('MakeMaxiMove', REACTIONS_HEADERS);
  const user = payload.user || 'anonymous';
  const data = sheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === payload.url && data[i][1] === user) {
      if (payload.interest !== undefined) sheet.getRange(i+1, 3).setValue(payload.interest);
      if (payload.status !== undefined) sheet.getRange(i+1, 4).setValue(payload.status);
      if (payload.notes !== undefined) sheet.getRange(i+1, 5).setValue(payload.notes);
      sheet.getRange(i+1, 6).setValue(new Date().toISOString());
      found = true;
      break;
    }
  }

  if (!found) {
    sheet.appendRow([
      payload.url,
      user,
      payload.interest || 'new',
      payload.status || 'new',
      payload.notes || '',
      new Date().toISOString()
    ]);
  }

  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
}
