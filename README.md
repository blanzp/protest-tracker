# 📢 Protest Tracker API

Real-time protest and demonstration tracking with geospatial queries and live updates.

## Features

- **🗺️ Geospatial Queries** - Find protests within X miles of any location
- **⚡ Real-time Updates** - WebSocket connections for live event updates  
- **📊 Categorization** - Events organized by cause (climate, immigration, etc.)
- **🔍 Data Sources** - Scrapes permits, social media, news sources
- **📱 Mobile-Ready** - JSON API perfect for mobile apps

## Quick Start

### 1. Database Setup
```bash
# Install PostgreSQL with PostGIS
sudo apt install postgresql postgis

# Create database
sudo -u postgres createdb protest_tracker
sudo -u postgres psql -d protest_tracker -c "CREATE EXTENSION postgis;"
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Install & Run
```bash
npm install
npm run migrate  # Create tables
npm run dev      # Start development server
```

### 4. Test Data
```bash
# Scrape NYC permits for sample data
node scrapers/nyc_permits.js
```

## API Endpoints

### Get Events
```
GET /api/events?lat=40.7128&lng=-74.0060&radius=10&causes=climate
```

**Parameters:**
- `lat`, `lng` - Location coordinates
- `radius` - Search radius in kilometers (default: 10)
- `causes` - Filter by cause (comma-separated)
- `status` - Event status (planned, active, ended)

**Response:**
```json
[
  {
    "id": 1,
    "title": "Climate Action Rally",
    "description": "Join us for climate justice",
    "cause": "climate",
    "address": "City Hall, NYC",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "start_time": "2026-01-25T14:00:00Z",
    "status": "planned",
    "distance_km": 2.5
  }
]
```

### Create Event
```
POST /api/events
Content-Type: application/json

{
  "title": "Student Climate Strike",
  "description": "Students for climate action",
  "cause": "climate",
  "address": "Union Square, NYC",
  "latitude": 40.7359,
  "longitude": -73.9911,
  "start_time": "2026-01-30T12:00:00Z"
}
```

### Get Causes
```
GET /api/causes
```

## WebSocket Events

Connect to `ws://localhost:8080` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'new_event') {
    console.log('New protest:', data.data);
  }
};
```

## Data Sources

- **NYC Open Data** - Official event permits
- **Social Media** - Twitter/X hashtag monitoring (coming soon)
- **News APIs** - Event mentions in news (coming soon)  
- **User Submissions** - Community-reported events

## Deployment

### Docker
```bash
# Build image
docker build -t protest-tracker .

# Run with docker-compose
docker-compose up -d
```

### Environment Variables
- `PORT` - Server port (default: 3000)
- `DB_*` - Database connection settings
- External API keys for data sources

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see LICENSE file for details

---

**⚠️ Important:** This tool is for informational purposes. Always verify event details independently and follow local laws regarding demonstrations.