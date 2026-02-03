const axios = require('axios');

// Configuration
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GEOCODING_CACHE_SIZE_LIMIT = parseInt(process.env.GEOCODING_CACHE_SIZE_LIMIT) || 1000;
const GEOCODING_RATE_LIMIT_PER_SECOND = parseInt(process.env.GEOCODING_RATE_LIMIT_PER_SECOND) || 10;

// In-memory cache for geocoding results
const geocodeCache = new Map();

// Rate limiting state
let requestQueue = [];
let requestsThisSecond = 0;
let lastResetTime = Date.now();

/**
 * Rate limiter: ensures we don't exceed requests per second
 */
function waitForRateLimit() {
  return new Promise(resolve => {
    const now = Date.now();

    // Reset counter every second
    if (now - lastResetTime >= 1000) {
      requestsThisSecond = 0;
      lastResetTime = now;
    }

    // If under limit, proceed immediately
    if (requestsThisSecond < GEOCODING_RATE_LIMIT_PER_SECOND) {
      requestsThisSecond++;
      resolve();
    } else {
      // Wait until next second
      const waitTime = 1000 - (now - lastResetTime);
      setTimeout(() => {
        requestsThisSecond = 1;
        lastResetTime = Date.now();
        resolve();
      }, waitTime);
    }
  });
}

/**
 * Retry logic with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Retry on rate limit errors (429) or network errors
      if (err.response?.status === 429 || err.code === 'ECONNRESET') {
        const backoffTime = Math.pow(2, attempt) * 1000; // Exponential: 1s, 2s, 4s
        console.log(`⏳ Rate limited, retrying in ${backoffTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Geocode an address using Google Maps API
 * @param {string} address - The address to geocode
 * @returns {Promise<{latitude: number, longitude: number} | null>} Coordinates or null if failed
 */
async function geocodeAddress(address) {
  if (!address || typeof address !== 'string') {
    return null;
  }

  // Normalize address for cache key
  const cacheKey = address.toLowerCase().trim();

  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    console.log(`📍 Cache hit for: ${address}`);
    return geocodeCache.get(cacheKey);
  }

  // Check if API key is configured
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_maps_key_here') {
    console.warn('⚠️  Google Maps API key not configured, geocoding disabled');
    return null;
  }

  try {
    // Rate limiting
    await waitForRateLimit();

    // Make API request with retry logic
    const result = await retryWithBackoff(async () => {
      const url = 'https://maps.googleapis.com/maps/api/geocode/json';
      const response = await axios.get(url, {
        params: {
          address: address,
          key: GOOGLE_MAPS_API_KEY
        },
        timeout: 5000
      });

      return response.data;
    });

    // Check if geocoding was successful
    if (result.status === 'OK' && result.results.length > 0) {
      const location = result.results[0].geometry.location;
      const coords = {
        latitude: location.lat,
        longitude: location.lng
      };

      // Cache the result
      geocodeCache.set(cacheKey, coords);

      // Enforce cache size limit (LRU-style)
      if (geocodeCache.size > GEOCODING_CACHE_SIZE_LIMIT) {
        const firstKey = geocodeCache.keys().next().value;
        geocodeCache.delete(firstKey);
      }

      console.log(`📍 Geocoded: ${address} -> (${coords.latitude}, ${coords.longitude})`);
      return coords;
    } else if (result.status === 'ZERO_RESULTS') {
      console.warn(`⚠️  No results for address: ${address}`);
      // Cache null result to avoid repeated API calls
      geocodeCache.set(cacheKey, null);
      return null;
    } else {
      console.error(`❌ Geocoding failed for ${address}: ${result.status}`);
      return null;
    }
  } catch (err) {
    console.error(`❌ Geocoding error for ${address}:`, err.message);
    return null;
  }
}

/**
 * Batch geocode multiple addresses
 * @param {string[]} addresses - Array of addresses to geocode
 * @returns {Promise<Array<{address: string, coords: {latitude: number, longitude: number} | null}>>}
 */
async function batchGeocode(addresses) {
  const results = [];

  for (const address of addresses) {
    const coords = await geocodeAddress(address);
    results.push({ address, coords });
  }

  return results;
}

/**
 * Clear the geocoding cache
 */
function clearCache() {
  geocodeCache.clear();
  console.log('🗑️  Geocoding cache cleared');
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    size: geocodeCache.size,
    limit: GEOCODING_CACHE_SIZE_LIMIT
  };
}

module.exports = {
  geocodeAddress,
  batchGeocode,
  clearCache,
  getCacheStats
};
