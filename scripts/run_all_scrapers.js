require('dotenv').config();
const pool = require('../db/pool');

// Import all scrapers
const { scrapeNYCPermits } = require('../scrapers/nyc_permits');
const { scrapeTwitterHashtags } = require('../scrapers/twitter_hashtags');
const { scrapeNewsArticles } = require('../scrapers/news_scraper');

// List of scrapers to run
const SCRAPERS = [
  {
    name: 'NYC Permits',
    fn: scrapeNYCPermits,
    enabled: true
  },
  {
    name: 'Twitter Hashtags',
    fn: scrapeTwitterHashtags,
    enabled: !!process.env.TWITTER_BEARER_TOKEN && process.env.TWITTER_BEARER_TOKEN !== 'your_twitter_bearer_token_here'
  },
  {
    name: 'News API',
    fn: scrapeNewsArticles,
    enabled: !!process.env.NEWS_API_KEY && process.env.NEWS_API_KEY !== 'your_newsapi_key_here'
  }
];

/**
 * Run all configured scrapers sequentially
 */
async function runAllScrapers() {
  console.log('🚀 Starting scraper orchestration...\n');

  const results = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  for (const scraper of SCRAPERS) {
    results.total++;

    if (!scraper.enabled) {
      console.log(`⏭️  Skipping ${scraper.name} (not configured)\n`);
      results.skipped++;
      continue;
    }

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Running: ${scraper.name}`);
      console.log('='.repeat(60));

      await scraper.fn();

      console.log(`✅ ${scraper.name} completed successfully\n`);
      results.successful++;

    } catch (err) {
      console.error(`❌ ${scraper.name} failed: ${err.message}\n`);
      results.failed++;
      results.errors.push({
        scraper: scraper.name,
        error: err.message
      });
      // Continue to next scraper instead of stopping
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SCRAPING SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total scrapers: ${results.total}`);
  console.log(`✅ Successful: ${results.successful}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);

  if (results.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    results.errors.forEach(err => {
      console.log(`  - ${err.scraper}: ${err.error}`);
    });
  }

  // Query database for final event counts
  try {
    const eventCountResult = await pool.query(`
      SELECT
        source_type,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'planned' THEN 1 END) as planned,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'ended' THEN 1 END) as ended
      FROM events
      GROUP BY source_type
      ORDER BY count DESC
    `);

    console.log('\n📈 Event counts by source:');
    console.table(eventCountResult.rows);

    const totalResult = await pool.query('SELECT COUNT(*) as total FROM events');
    console.log(`\n🎯 Total events in database: ${totalResult.rows[0].total}`);

  } catch (err) {
    console.error('❌ Error querying database:', err.message);
  }

  console.log('\n' + '='.repeat(60));

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

async function main() {
  try {
    await runAllScrapers();
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runAllScrapers };
