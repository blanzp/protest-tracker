const pool = require('../db/pool');

/**
 * Initialize or update a data source
 * @param {string} name - Unique name for the data source
 * @param {string} type - Type of source (permit, social, news, etc.)
 * @param {string} url - Source URL
 * @returns {Promise<void>}
 */
async function initializeDataSource(name, type, url) {
  try {
    await pool.query(`
      INSERT INTO data_sources (name, type, url, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (name) DO UPDATE
      SET type = $2, url = $3, updated_at = NOW()
    `, [name, type, url]);

    console.log(`📊 Data source initialized: ${name}`);
  } catch (err) {
    console.error(`❌ Error initializing data source ${name}:`, err.message);
    throw err;
  }
}

/**
 * Update data source after successful scrape
 * @param {string} name - Data source name
 * @returns {Promise<void>}
 */
async function updateDataSourceSuccess(name) {
  try {
    await pool.query(`
      UPDATE data_sources
      SET last_scraped = NOW(),
          status = 'active',
          error_message = NULL,
          updated_at = NOW()
      WHERE name = $1
    `, [name]);

    console.log(`✅ Data source updated successfully: ${name}`);
  } catch (err) {
    console.error(`❌ Error updating data source ${name}:`, err.message);
    throw err;
  }
}

/**
 * Update data source after failed scrape
 * @param {string} name - Data source name
 * @param {string} errorMessage - Error message to record
 * @returns {Promise<void>}
 */
async function updateDataSourceError(name, errorMessage) {
  try {
    await pool.query(`
      UPDATE data_sources
      SET status = 'error',
          error_message = $2,
          last_error_at = NOW(),
          updated_at = NOW()
      WHERE name = $1
    `, [name, errorMessage]);

    console.error(`❌ Data source error recorded: ${name} - ${errorMessage}`);
  } catch (err) {
    console.error(`❌ Error recording data source error for ${name}:`, err.message);
    throw err;
  }
}

/**
 * Get all data sources with their status
 * @returns {Promise<Array>} Array of data source records
 */
async function getDataSources() {
  try {
    const result = await pool.query(`
      SELECT * FROM data_sources
      ORDER BY last_scraped DESC NULLS LAST
    `);
    return result.rows;
  } catch (err) {
    console.error('❌ Error fetching data sources:', err.message);
    throw err;
  }
}

/**
 * Get data source by name
 * @param {string} name - Data source name
 * @returns {Promise<Object | null>} Data source record or null
 */
async function getDataSource(name) {
  try {
    const result = await pool.query(`
      SELECT * FROM data_sources WHERE name = $1
    `, [name]);
    return result.rows[0] || null;
  } catch (err) {
    console.error(`❌ Error fetching data source ${name}:`, err.message);
    throw err;
  }
}

module.exports = {
  initializeDataSource,
  updateDataSourceSuccess,
  updateDataSourceError,
  getDataSources,
  getDataSource
};
