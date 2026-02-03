const chrono = require('chrono-node');

/**
 * Extract date from text using natural language parsing
 * @param {string} text - Text containing date information
 * @param {Date} referenceDate - Reference date for relative dates (default: now)
 * @returns {Date | null} Parsed date or null if no date found
 */
function extractDateFromText(text, referenceDate = new Date()) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    // Parse date using chrono-node
    const results = chrono.parse(text, referenceDate);

    if (results.length > 0) {
      // Return the first parsed date
      const parsedDate = results[0].start.date();
      console.log(`📅 Extracted date from "${text}": ${parsedDate.toISOString()}`);
      return parsedDate;
    }

    return null;
  } catch (err) {
    console.error(`❌ Error parsing date from text: ${err.message}`);
    return null;
  }
}

/**
 * Extract location from text using regex patterns
 * @param {string} text - Text containing location information
 * @returns {string | null} Extracted location or null if not found
 */
function extractLocationFromText(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Patterns to match locations
  const patterns = [
    // "in [City]" or "in [City, State]"
    /\bin\s+([A-Z][a-zA-Z\s]+(?:,\s*[A-Z]{2})?)\b/i,

    // "at [Address]" or "at [Place Name]"
    /\bat\s+([A-Z][a-zA-Z0-9\s,.'-]+(?:,\s*[A-Z]{2})?)\b/i,

    // "[City], [State]" pattern
    /\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/,

    // Common venue patterns: "[Place Name], [City]"
    /\b([A-Z][a-zA-Z\s'-]+),\s*([A-Z][a-zA-Z\s]+)\b/,

    // Street addresses: "123 Main St" or "123 Main Street, City"
    /\b\d+\s+[A-Z][a-zA-Z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Plaza|Place|Pl)(?:,\s*[A-Z][a-zA-Z\s]+)?\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let location;

      // Handle different capture group patterns
      if (match.length > 2 && match[2]) {
        // Pattern with city and state
        location = `${match[1].trim()}, ${match[2].trim()}`;
      } else {
        location = match[1].trim();
      }

      // Clean up the location string
      location = location.replace(/\s+/g, ' ').trim();

      // Filter out common false positives
      const falsePositives = ['the', 'a', 'an', 'this', 'that', 'these', 'those'];
      const firstWord = location.split(' ')[0].toLowerCase();
      if (falsePositives.includes(firstWord)) {
        continue;
      }

      console.log(`📍 Extracted location from "${text}": ${location}`);
      return location;
    }
  }

  return null;
}

/**
 * Extract multiple dates from text (e.g., start and end times)
 * @param {string} text - Text containing date information
 * @param {Date} referenceDate - Reference date for relative dates (default: now)
 * @returns {Array<Date>} Array of parsed dates
 */
function extractAllDatesFromText(text, referenceDate = new Date()) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  try {
    const results = chrono.parse(text, referenceDate);
    return results.map(result => result.start.date());
  } catch (err) {
    console.error(`❌ Error parsing dates from text: ${err.message}`);
    return [];
  }
}

/**
 * Extract hashtags from text
 * @param {string} text - Text containing hashtags
 * @returns {Array<string>} Array of hashtags (without # symbol)
 */
function extractHashtags(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const hashtagPattern = /#(\w+)/g;
  const matches = text.matchAll(hashtagPattern);
  const hashtags = Array.from(matches, match => match[1]);

  return [...new Set(hashtags)]; // Remove duplicates
}

/**
 * Extract all useful event information from text
 * @param {string} text - Full text to parse
 * @param {Date} referenceDate - Reference date for relative dates
 * @returns {Object} Extracted information
 */
function parseEventInfo(text, referenceDate = new Date()) {
  return {
    dates: extractAllDatesFromText(text, referenceDate),
    location: extractLocationFromText(text),
    hashtags: extractHashtags(text),
    startDate: extractDateFromText(text, referenceDate)
  };
}

module.exports = {
  extractDateFromText,
  extractLocationFromText,
  extractAllDatesFromText,
  extractHashtags,
  parseEventInfo
};
