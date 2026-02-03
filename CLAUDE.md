# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time protest and demonstration tracking API with geospatial queries. The system aggregates protest data from various sources (permits, social media, user submissions) and provides location-based queries using PostgreSQL/PostGIS.

## Development Commands

```bash
# Setup
npm install
npm run migrate              # Create database tables (runs migrations/create_tables.js)

# Development
npm run dev                  # Start server with nodemon auto-reload
npm start                    # Start production server

# Data scraping
node scrapers/nyc_permits.js # Scrape NYC permits for test data

# Docker
docker-compose up -d         # Start app + PostgreSQL with PostGIS
```

## Architecture

### Core Components

**server.js** - Express API server with REST endpoints and WebSocket server
- REST API runs on port 3000 (configurable via PORT env var)
- WebSocket server runs on port 8080 (hardcoded)
- Database connection pool shared across requests
- Broadcast function sends real-time updates to all WebSocket clients

**Database (PostgreSQL + PostGIS)**
- Single `events` table with geospatial indexing
- `location` column auto-populated via database trigger from lat/lng
- PostGIS enables geography-based distance calculations
- Indexes on: location (GIST), cause, status, start_time

**migrations/create_tables.js** - Database schema setup
- Creates events table with PostGIS POINT geometry
- Sets up trigger to auto-update location GEOMETRY from latitude/longitude DECIMAL fields
- Creates GIST spatial index for fast proximity queries
- Creates data_sources tracking table (currently unused)

**scrapers/nyc_permits.js** - Data ingestion from NYC Open Data
- Filters permits by protest keywords (rally, demonstration, protest, etc.)
- Categorizes events into causes (climate, reproductive, immigration, etc.) using keyword matching
- Defaults to NYC center coordinates (40.7128, -74.0060) when geocoding unavailable
- Uses ON CONFLICT DO NOTHING to avoid duplicates

### Geospatial Query Pattern

The `/api/events` endpoint uses PostGIS geography calculations:
```sql
ST_Distance(ST_Point(longitude, latitude)::geography,
            ST_Point($lng, $lat)::geography) / 1000 as distance_km
```

And proximity filtering:
```sql
ST_DWithin(ST_Point(longitude, latitude)::geography,
           ST_Point($lng, $lat)::geography,
           $radius * 1000)
```

Distance calculations are in meters, converted to kilometers for the API response.

### Event Status Flow

- `planned` - Future event
- `active` - Currently happening
- `ended` - Past event

Status updates are manual; there's no automated status transition based on time.

### Real-time Updates

When a new event is created via POST `/api/events`, the server broadcasts to all WebSocket clients:
```javascript
broadcast({ type: 'new_event', data: newEvent });
```

The WebSocket server (port 8080) is separate from the Express server (port 3000).

## Database Schema Notes

**events table:**
- `latitude`/`longitude` are DECIMAL fields (user-facing)
- `location` is a PostGIS GEOMETRY(POINT, 4326) (internal, auto-updated)
- `organizers` and `hashtags` are TEXT[] arrays
- `confidence_score` ranges 0.0-1.0 (user submissions: 0.8, permits: 0.9)
- `source_type` values: 'user', 'permit', (future: 'social', 'news')

## Environment Setup

Requires PostgreSQL with PostGIS extension. Use docker-compose for easy setup:
```bash
docker-compose up -d
```

Or install locally:
```bash
sudo apt install postgresql postgis
sudo -u postgres createdb protest_tracker
sudo -u postgres psql -d protest_tracker -c "CREATE EXTENSION postgis;"
```

## Data Source Integration

Current: NYC Open Data (permits)
Future: Twitter/X hashtags, news APIs, user submissions

To add new scrapers, follow the pattern in `scrapers/nyc_permits.js`:
1. Fetch data from external API
2. Filter/categorize events
3. Insert with `ON CONFLICT DO NOTHING` for idempotency
4. Set appropriate `confidence_score` and `source_type`
