const axios = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'protest_tracker',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// NYC Open Data API endpoint for permitted events
const NYC_PERMITS_URL = 'https://data.cityofnewyork.us/resource/tvpp-9vvx.json';

// Keywords that suggest protests/demonstrations
const PROTEST_KEYWORDS = [
  'rally', 'demonstration', 'protest', 'march', 'vigil', 'strike',
  'climate', 'abortion', 'immigration', 'rights', 'justice', 'action',
  'solidarity', 'occupy', 'resist', 'movement', 'activist'
];

// Map event types to causes
const CAUSE_MAPPING = {
  'climate': ['climate', 'environment', 'earth day', 'green'],
  'reproductive': ['abortion', 'reproductive', 'planned parenthood', 'roe'],
  'immigration': ['immigration', 'ice', 'border', 'refugee', 'daca'],
  'racial_justice': ['blm', 'black lives', 'racial', 'police', 'justice'],
  'lgbtq': ['pride', 'lgbtq', 'gay', 'trans', 'gender'],
  'labor': ['union', 'worker', 'strike', 'labor', 'wage'],
  'political': ['election', 'vote', 'democrat', 'republican', 'trump', 'biden'],
  'other': []
};

function categorizeEvent(eventName, description = '') {
  const text = `${eventName} ${description}`.toLowerCase();
  
  for (const [cause, keywords] of Object.entries(CAUSE_MAPPING)) {
    if (cause === 'other') continue;
    
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return cause;
      }
    }
  }
  
  return 'other';
}

function isProtestEvent(eventName, description = '') {
  const text = `${eventName} ${description}`.toLowerCase();
  
  return PROTEST_KEYWORDS.some(keyword => text.includes(keyword));
}

async function scrapeNYCPermits() {
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
        // Default to rough NYC coordinates if not available
        // In production, you'd use a geocoding service
        latitude = 40.7128;
        longitude = -74.0060;
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
    
  } catch (err) {
    console.error('❌ Error scraping NYC permits:', err.message);
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