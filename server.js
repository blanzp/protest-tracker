const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const cron = require('node-cron');
require('dotenv').config();
const pool = require('./db/pool');

const app = express();
const port = process.env.PORT || 3000;
const DEFAULT_EVENT_DURATION_HOURS = process.env.DEFAULT_EVENT_DURATION_HOURS || 4;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: 8080 });

// Broadcast to all connected clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Update event statuses based on time
async function updateEventStatuses() {
  try {
    // Update planned events to active when start_time has passed
    const activatedResult = await pool.query(`
      UPDATE events
      SET status = 'active', updated_at = NOW()
      WHERE status = 'planned' AND start_time <= NOW()
      RETURNING id, title, 'planned' as old_status, 'active' as new_status
    `);

    // Update active events to ended when end_time has passed
    const endedWithTimeResult = await pool.query(`
      UPDATE events
      SET status = 'ended', updated_at = NOW()
      WHERE status = 'active' AND end_time IS NOT NULL AND end_time <= NOW()
      RETURNING id, title, 'active' as old_status, 'ended' as new_status
    `);

    // Update active events to ended when no end_time and past default duration
    const endedNoTimeResult = await pool.query(`
      UPDATE events
      SET status = 'ended', updated_at = NOW()
      WHERE status = 'active'
        AND end_time IS NULL
        AND start_time <= NOW() - INTERVAL '${DEFAULT_EVENT_DURATION_HOURS} hours'
      RETURNING id, title, 'active' as old_status, 'ended' as new_status
    `);

    // Combine all status changes
    const allChanges = [
      ...activatedResult.rows,
      ...endedWithTimeResult.rows,
      ...endedNoTimeResult.rows
    ];

    // Broadcast status changes
    if (allChanges.length > 0) {
      console.log(`⏰ Updated ${allChanges.length} event statuses`);

      allChanges.forEach(change => {
        broadcast({
          type: 'status_update',
          data: {
            eventId: change.id,
            title: change.title,
            oldStatus: change.old_status,
            newStatus: change.new_status,
            timestamp: new Date().toISOString()
          }
        });
      });
    }
  } catch (err) {
    console.error('❌ Error updating event statuses:', err);
  }
}

// Routes

// Get events with geospatial filtering
app.get('/api/events', async (req, res) => {
  try {
    const { lat, lng, radius = 10, causes, status = 'active' } = req.query;
    
    let query = `
      SELECT e.*, 
             ST_Distance(ST_Point(longitude, latitude)::geography, 
                        ST_Point($2, $1)::geography) / 1000 as distance_km
      FROM events e 
      WHERE 1=1
    `;
    
    const params = [lat, lng];
    let paramIndex = 2;
    
    // Add proximity filter if coordinates provided
    if (lat && lng) {
      query += ` AND ST_DWithin(ST_Point(longitude, latitude)::geography, 
                               ST_Point($2, $1)::geography, $${++paramIndex} * 1000)`;
      params.push(radius);
    }
    
    // Add cause filter
    if (causes) {
      const causeArray = causes.split(',');
      query += ` AND cause = ANY($${++paramIndex})`;
      params.push(causeArray);
    }
    
    // Add status filter  
    query += ` AND status = $${++paramIndex}`;
    params.push(status);
    
    query += ` ORDER BY ${lat && lng ? 'distance_km' : 'start_time'} ASC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single event
app.get('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new event (user submission)
app.post('/api/events', async (req, res) => {
  try {
    const {
      title, description, cause, address, latitude, longitude,
      start_time, end_time, organizers, hashtags, source_url
    } = req.body;
    
    const query = `
      INSERT INTO events (title, description, cause, address, latitude, longitude, 
                         start_time, end_time, status, source_type, source_url, 
                         organizers, hashtags, confidence_score)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'planned', 'user', $9, $10, $11, 0.8)
      RETURNING *
    `;
    
    const values = [
      title, description, cause, address, latitude, longitude,
      start_time, end_time, source_url, organizers, hashtags
    ];
    
    const result = await pool.query(query, values);
    const newEvent = result.rows[0];
    
    // Broadcast new event to all connected clients
    broadcast({ type: 'new_event', data: newEvent });
    
    res.status(201).json(newEvent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get available causes
app.get('/api/causes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cause, COUNT(*) as count
      FROM events
      WHERE status IN ('planned', 'active')
      GROUP BY cause
      ORDER BY count DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get data sources status
app.get('/api/data-sources', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM data_sources
      ORDER BY last_scraped DESC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Schedule status updates every minute
cron.schedule('* * * * *', updateEventStatuses);
console.log('⏰ Scheduled automatic status updates (runs every minute)');

// Run initial status update on startup
updateEventStatuses();

// Start server
app.listen(port, () => {
  console.log(`🚀 Protest Tracker API running on port ${port}`);
  console.log(`📡 WebSocket server running on port 8080`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  pool.end();
  process.exit(0);
});