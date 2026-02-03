const NewsAPI = require('newsapi');
require('dotenv').config();
const pool = require('../db/pool');
const { categorizeEvent, isProtestEvent } = require('../utils/categorize');
const { geocodeAddress } = require('../utils/geocoding');
const { extractDateFromText, extractLocationFromText } = require('../utils/text_parser');
const { initializeDataSource, updateDataSourceSuccess, updateDataSourceError } = require('../utils/datasource_tracker');

// Configuration
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_MAX_ARTICLES = parseInt(process.env.NEWS_API_MAX_ARTICLES) || 50;
const NEWS_API_SOURCES = process.env.NEWS_API_SOURCES || 'bbc-news,cnn,the-new-york-times';

// Initialize NewsAPI client
let newsapi = null;
if (NEWS_API_KEY && NEWS_API_KEY !== 'your_newsapi_key_here') {
  newsapi = new NewsAPI(NEWS_API_KEY);
}

/**
 * Search news articles for protest-related content
 */
async function searchNews() {
  if (!newsapi) {
    console.warn('⚠️  News API key not configured, skipping News scraper');
    return [];
  }

  try {
    // Search for protest-related keywords
    const response = await newsapi.v2.everything({
      q: 'protest OR demonstration OR rally OR march',
      sources: NEWS_API_SOURCES,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: NEWS_API_MAX_ARTICLES
    });

    if (response.status === 'ok') {
      return response.articles;
    } else {
      console.error(`❌ News API error: ${response.message || 'Unknown error'}`);
      return [];
    }
  } catch (err) {
    console.error(`❌ Error searching news: ${err.message}`);
    throw err;
  }
}

/**
 * Process a news article and extract event information
 */
async function processArticle(article) {
  const title = article.title;
  const description = article.description || '';
  const content = article.content || '';
  const fullText = `${title} ${description} ${content}`;

  // Check if this is actually about a protest/demonstration
  if (!isProtestEvent(title, description)) {
    console.log(`⚠️  Skipping article (not protest-related): ${title}`);
    return null;
  }

  // Try to extract location from text
  let location = extractLocationFromText(fullText);

  if (!location) {
    console.log(`⚠️  Skipping article (no location found): ${title}`);
    return null;
  }

  // Geocode the location
  const coords = await geocodeAddress(location);
  if (!coords) {
    console.log(`⚠️  Skipping article (geocoding failed): ${title} - ${location}`);
    return null;
  }

  // Try to extract event date from text
  let startTime = extractDateFromText(fullText);

  // If no specific date found in text, use article publish date
  if (!startTime) {
    startTime = new Date(article.publishedAt);
  }

  // Categorize the event
  const cause = categorizeEvent(title, description);

  return {
    title,
    description: description || content.substring(0, 500),
    cause,
    address: location,
    latitude: coords.latitude,
    longitude: coords.longitude,
    start_time: startTime,
    source_type: 'news',
    source_url: article.url,
    confidence_score: 0.7 // Medium confidence for news articles
  };
}

/**
 * Scrape news articles for protest-related events
 */
async function scrapeNewsArticles() {
  const NEWS_API_URL = 'https://newsapi.org/v2/everything';
  await initializeDataSource('News API', 'news', NEWS_API_URL);

  try {
    console.log('📰 Scraping news articles for protest events...');

    const articles = await searchNews();
    console.log(`📋 Found ${articles.length} news articles`);

    let insertedCount = 0;

    for (const article of articles) {
      const eventData = await processArticle(article);

      if (!eventData) {
        continue; // Skip if couldn't extract necessary info
      }

      // Insert into database
      const insertQuery = `
        INSERT INTO events (
          title, description, cause, address, latitude, longitude,
          start_time, status, source_type, source_url,
          confidence_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        eventData.confidence_score
      ];

      try {
        const result = await pool.query(insertQuery, values);
        if (result.rowCount > 0) {
          insertedCount++;
          console.log(`✅ Added: ${eventData.title}`);
        }
      } catch (dbErr) {
        console.error(`❌ Error inserting article:`, dbErr.message);
      }
    }

    console.log(`🎯 Added ${insertedCount} events from news articles`);

    await updateDataSourceSuccess('News API');

  } catch (err) {
    console.error('❌ Error scraping news:', err.message);
    await updateDataSourceError('News API', err.message);
    throw err;
  }
}

async function main() {
  try {
    await scrapeNewsArticles();
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { scrapeNewsArticles };
