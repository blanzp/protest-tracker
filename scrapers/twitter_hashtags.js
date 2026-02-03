const axios = require('axios');
require('dotenv').config();
const pool = require('../db/pool');
const { categorizeEvent } = require('../utils/categorize');
const { geocodeAddress } = require('../utils/geocoding');
const { extractDateFromText, extractLocationFromText, extractHashtags } = require('../utils/text_parser');
const { initializeDataSource, updateDataSourceSuccess, updateDataSourceError } = require('../utils/datasource_tracker');

// Configuration
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const TWITTER_MAX_RESULTS_PER_REQUEST = parseInt(process.env.TWITTER_MAX_RESULTS_PER_REQUEST) || 100;
const TWITTER_SEARCH_DAYS_BACK = parseInt(process.env.TWITTER_SEARCH_DAYS_BACK) || 7;

// Twitter API v2 endpoint
const TWITTER_API_URL = 'https://api.twitter.com/2/tweets/search/recent';

// Protest-related hashtags to search for
const PROTEST_HASHTAGS = [
  '#protest',
  '#rally',
  '#march',
  '#climatestrike',
  '#blacklivesmatter',
  '#immigration',
  '#reproductiverights',
  '#lgbtq',
  '#labor',
  '#strike'
];

// Rate limiting state (Twitter allows 450 requests per 15-minute window)
let requestsThisWindow = 0;
let windowStartTime = Date.now();
const MAX_REQUESTS_PER_WINDOW = 450;
const WINDOW_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Wait for rate limit if necessary
 */
async function waitForRateLimit() {
  const now = Date.now();
  const windowElapsed = now - windowStartTime;

  // Reset window if 15 minutes have passed
  if (windowElapsed >= WINDOW_DURATION_MS) {
    requestsThisWindow = 0;
    windowStartTime = now;
  }

  // If we've hit the limit, wait until window resets
  if (requestsThisWindow >= MAX_REQUESTS_PER_WINDOW) {
    const waitTime = WINDOW_DURATION_MS - windowElapsed;
    console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestsThisWindow = 0;
    windowStartTime = Date.now();
  }

  requestsThisWindow++;
}

/**
 * Search Twitter for tweets with protest-related hashtags
 */
async function searchTwitter() {
  if (!TWITTER_BEARER_TOKEN || TWITTER_BEARER_TOKEN === 'your_twitter_key_here') {
    console.warn('⚠️  Twitter Bearer Token not configured, skipping Twitter scraper');
    return [];
  }

  await waitForRateLimit();

  // Build search query
  const query = PROTEST_HASHTAGS.join(' OR ');

  // Calculate start time (TWITTER_SEARCH_DAYS_BACK days ago)
  const startTime = new Date(Date.now() - TWITTER_SEARCH_DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();

  try {
    const response = await axios.get(TWITTER_API_URL, {
      headers: {
        'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`
      },
      params: {
        query: query,
        max_results: TWITTER_MAX_RESULTS_PER_REQUEST,
        start_time: startTime,
        'tweet.fields': 'created_at,geo,entities',
        'expansions': 'geo.place_id',
        'place.fields': 'full_name,geo'
      }
    });

    return response.data.data || [];
  } catch (err) {
    if (err.response?.status === 429) {
      console.error('❌ Twitter rate limit exceeded');
      throw new Error('Rate limit exceeded');
    }
    console.error(`❌ Twitter API error: ${err.message}`);
    throw err;
  }
}

/**
 * Extract first sentence from text
 */
function getFirstSentence(text) {
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : text.substring(0, 100);
}

/**
 * Process a tweet and extract event information
 */
async function processTweet(tweet) {
  const text = tweet.text;

  // Extract title (first sentence)
  const title = getFirstSentence(text);

  // Extract hashtags
  const hashtags = extractHashtags(text);

  // Try to extract location from tweet
  let location = null;
  let latitude = null;
  let longitude = null;

  // First, try to get location from tweet geo data
  if (tweet.geo && tweet.geo.place_id) {
    location = tweet.geo.place_id; // This would need expansion data
  }

  // If no geo data, try to parse location from text
  if (!location) {
    location = extractLocationFromText(text);
  }

  // Geocode the location if we found one
  if (location) {
    const coords = await geocodeAddress(location);
    if (coords) {
      latitude = coords.latitude;
      longitude = coords.longitude;
    }
  }

  // Skip if we couldn't determine location
  if (!latitude || !longitude) {
    console.log(`⚠️  Skipping tweet (no location): ${title}`);
    return null;
  }

  // Extract date from text or use tweet creation time
  let startTime = extractDateFromText(text);
  if (!startTime) {
    startTime = new Date(tweet.created_at);
  }

  // Categorize the event
  const cause = categorizeEvent(title, text);

  return {
    title,
    description: text,
    cause,
    address: location,
    latitude,
    longitude,
    start_time: startTime,
    source_type: 'social',
    source_url: `https://twitter.com/i/web/status/${tweet.id}`,
    hashtags,
    confidence_score: 0.6 // Lower confidence for social media
  };
}

/**
 * Scrape Twitter for protest-related events
 */
async function scrapeTwitterHashtags() {
  await initializeDataSource('Twitter Hashtags', 'social', TWITTER_API_URL);

  try {
    console.log('🐦 Scraping Twitter for protest hashtags...');

    const tweets = await searchTwitter();
    console.log(`📋 Found ${tweets.length} tweets`);

    let insertedCount = 0;

    for (const tweet of tweets) {
      const eventData = await processTweet(tweet);

      if (!eventData) {
        continue; // Skip if couldn't extract necessary info
      }

      // Insert into database
      const insertQuery = `
        INSERT INTO events (
          title, description, cause, address, latitude, longitude,
          start_time, status, source_type, source_url,
          hashtags, confidence_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT DO NOTHING
        RETURNING id
      `;

      const values = [
        eventData.title,
        eventData.description,
        eventData.cause,
        eventData.address,
        eventData.latitude,
        eventData.longitude,
        eventData.start_time,
        'planned', // Default to planned status
        eventData.source_type,
        eventData.source_url,
        eventData.hashtags,
        eventData.confidence_score
      ];

      try {
        const result = await pool.query(insertQuery, values);
        if (result.rowCount > 0) {
          insertedCount++;
          console.log(`✅ Added: ${eventData.title}`);
        }
      } catch (dbErr) {
        console.error(`❌ Error inserting tweet ${tweet.id}:`, dbErr.message);
      }
    }

    console.log(`🎯 Added ${insertedCount} events from Twitter`);

    await updateDataSourceSuccess('Twitter Hashtags');

  } catch (err) {
    console.error('❌ Error scraping Twitter:', err.message);
    await updateDataSourceError('Twitter Hashtags', err.message);
    throw err;
  }
}

async function main() {
  try {
    await scrapeTwitterHashtags();
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { scrapeTwitterHashtags };
