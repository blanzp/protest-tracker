const { Pool } = require('pg');
require('dotenv').config();

// Shared database connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'protest_tracker',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Handle connection errors
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

module.exports = pool;
