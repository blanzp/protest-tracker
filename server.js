const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'protest_tracker',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Middleware
app.use(cors());
app.use(express.json());

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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