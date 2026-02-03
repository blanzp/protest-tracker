require('dotenv').config();
const pool = require('../db/pool');

async function createTables() {
  try {
    console.log('Creating tables...');
    
    // Enable PostGIS extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    
    // Create events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        cause VARCHAR(50) NOT NULL,
        address TEXT NOT NULL,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        location GEOMETRY(POINT, 4326),
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE,
        status VARCHAR(20) DEFAULT 'planned',
        source_type VARCHAR(20) NOT NULL,
        source_url TEXT,
        confidence_score DECIMAL(3, 2) DEFAULT 0.5,
        expected_size INTEGER,
        permit_status VARCHAR(20),
        organizers TEXT[],
        hashtags TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS events_location_idx 
      ON events USING GIST (location);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS events_cause_idx 
      ON events (cause);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS events_status_idx 
      ON events (status);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS events_start_time_idx 
      ON events (start_time);
    `);
    
    // Create function to update location from lat/lng
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_location()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Create trigger to auto-update location
    await pool.query(`
      DROP TRIGGER IF EXISTS update_location_trigger ON events;
      CREATE TRIGGER update_location_trigger
        BEFORE INSERT OR UPDATE ON events
        FOR EACH ROW EXECUTE FUNCTION update_location();
    `);
    
    // Create data sources tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS data_sources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        url TEXT,
        last_scraped TIMESTAMP WITH TIME ZONE,
        status VARCHAR(20) DEFAULT 'active',
        error_message TEXT,
        last_error_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Add unique constraint on name if it doesn't exist
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE data_sources ADD CONSTRAINT data_sources_name_unique UNIQUE (name);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    console.log('✅ Tables created successfully!');
    
  } catch (err) {
    console.error('❌ Error creating tables:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  createTables().catch(console.error);
}

module.exports = { createTables };