const axios = require('axios');
require('dotenv').config();
const pool = require('../db/pool');
const { categorizeEvent, isProtestEvent } = require('../utils/categorize');
const { geocodeAddress } = require('../utils/geocoding');
const { initializeDataSource, updateDataSourceSuccess, updateDataSourceError } = require('../utils/datasource_tracker');

// NYC Open Data API endpoint for permitted events
const NYC_PERMITS_URL = 'https://data.cityofnewyork.us/resource/tvpp-9vvx.json';

async function scrapeNYCPermits() {
  // Initialize data source tracking
  await initializeDataSource('NYC Permits', 'permit', NYC_PERMITS_URL);

  try {
    console.log('🔍 Scraping NYC permits...');
    
    // Get permits from last 30 days and next 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const params = {
      '$where': `start_date_time >= '${thirtyDaysAgo}' AND start_date_time <= '${thirtyDaysFromNow}'`,
      '$limit': 1000
    };
    
    const response = await axios.get(NYC_PERMITS_URL, { params });
    const permits = response.data;
    
    console.log(`📋 Found ${permits.length} total permits`);
    
    let protestCount = 0;
    
    for (const permit of permits) {
      // Skip if missing required fields
      if (!permit.event_name || !permit.start_date_time || !permit.event_location) {
        continue;
      }
      
      // Check if this looks like a protest/demonstration
      if (!isProtestEvent(permit.event_name, permit.event_details)) {
        continue;
      }
      
      const cause = categorizeEvent(permit.event_name, permit.event_details);

      // Try to extract coordinates (NYC data sometimes has lat/lng)
      let latitude = null, longitude = null;

      if (permit.latitude && permit.longitude) {
        latitude = parseFloat(permit.latitude);
        longitude = parseFloat(permit.longitude);
      } else {
        // Try geocoding the event location
        const geocoded = await geocodeAddress(permit.event_location);
        if (geocoded) {
          latitude = geocoded.latitude;
          longitude = geocoded.longitude;
        } else {
          // Fallback to NYC center coordinates
          latitude = 40.7128;
          longitude = -74.0060;
        }
      }
      
      // Insert into database
      const insertQuery = `
        INSERT INTO events (
          title, description, cause, address, latitude, longitude,
          start_time, end_time, status, source_type, source_url,
          confidence_score, permit_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      
      const values = [
        permit.event_name,
        permit.event_details || '',
        cause,
        permit.event_location,
        latitude,
        longitude,
        permit.start_date_time,
        permit.end_date_time || null,
        'planned',
        'permit',
        `${NYC_PERMITS_URL}/${permit.event_id}`,
        0.9, // High confidence for official permits
        'approved'
      ];
      
      try {
        const result = await pool.query(insertQuery, values);
        if (result.rowCount > 0) {
          protestCount++;
          console.log(`✅ Added: ${permit.event_name}`);
        }
      } catch (dbErr) {
        console.error(`❌ Error inserting ${permit.event_name}:`, dbErr.message);
      }
    }
    
    console.log(`🎯 Added ${protestCount} protest events from NYC permits`);

    // Update data source status to success
    await updateDataSourceSuccess('NYC Permits');

  } catch (err) {
    console.error('❌ Error scraping NYC permits:', err.message);
    await updateDataSourceError('NYC Permits', err.message);
    throw err;
  }
}

async function main() {
  try {
    await scrapeNYCPermits();
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { scrapeNYCPermits };