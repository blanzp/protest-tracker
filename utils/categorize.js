// Keywords that suggest protests/demonstrations
const PROTEST_KEYWORDS = [
  'rally', 'demonstration', 'protest', 'march', 'vigil', 'strike',
  'climate', 'abortion', 'immigration', 'rights', 'justice', 'action',
  'solidarity', 'occupy', 'resist', 'movement', 'activist'
];

// Map event types to causes
const CAUSE_MAPPING = {
  'climate': ['climate', 'environment', 'earth day', 'green'],
  'reproductive': ['abortion', 'reproductive', 'planned parenthood', 'roe'],
  'immigration': ['immigration', 'ice', 'border', 'refugee', 'daca'],
  'racial_justice': ['blm', 'black lives', 'racial', 'police', 'justice'],
  'lgbtq': ['pride', 'lgbtq', 'gay', 'trans', 'gender'],
  'labor': ['union', 'worker', 'strike', 'labor', 'wage'],
  'political': ['election', 'vote', 'democrat', 'republican', 'trump', 'biden'],
  'other': []
};

/**
 * Categorize an event based on keywords in the name and description
 * @param {string} eventName - The event name/title
 * @param {string} description - The event description (optional)
 * @returns {string} The cause category
 */
function categorizeEvent(eventName, description = '') {
  const text = `${eventName} ${description}`.toLowerCase();

  for (const [cause, keywords] of Object.entries(CAUSE_MAPPING)) {
    if (cause === 'other') continue;

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return cause;
      }
    }
  }

  return 'other';
}

/**
 * Check if an event appears to be a protest/demonstration
 * @param {string} eventName - The event name/title
 * @param {string} description - The event description (optional)
 * @returns {boolean} True if event matches protest keywords
 */
function isProtestEvent(eventName, description = '') {
  const text = `${eventName} ${description}`.toLowerCase();

  return PROTEST_KEYWORDS.some(keyword => text.includes(keyword));
}

module.exports = {
  PROTEST_KEYWORDS,
  CAUSE_MAPPING,
  categorizeEvent,
  isProtestEvent
};
