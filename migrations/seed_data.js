require('dotenv').config();
const pool = require('../db/pool');

// Major cities with coordinates
const CITIES = {
  'New York, NY': { lat: 40.7128, lng: -74.0060 },
  'Los Angeles, CA': { lat: 34.0522, lng: -118.2437 },
  'San Francisco, CA': { lat: 37.7749, lng: -122.4194 },
  'Chicago, IL': { lat: 41.8781, lng: -87.6298 },
  'Washington, DC': { lat: 38.9072, lng: -77.0369 },
  'Seattle, WA': { lat: 47.6062, lng: -122.3321 },
  'Austin, TX': { lat: 30.2672, lng: -97.7431 },
  'Miami, FL': { lat: 25.7617, lng: -80.1918 }
};

// Sample events by cause
const EVENT_TEMPLATES = {
  climate: [
    { title: 'Climate Strike Rally', desc: 'Join us to demand action on climate change', hashtags: ['ClimateAction', 'FridaysForFuture'], organizers: ['Youth Climate Coalition'] },
    { title: 'Earth Day March', desc: 'March for a sustainable future', hashtags: ['EarthDay', 'GreenFuture'], organizers: ['Environmental Alliance'] },
    { title: 'Fossil Fuel Divestment Protest', desc: 'Demand divestment from fossil fuels', hashtags: ['DivestNow', 'ClimateJustice'], organizers: ['Divest Movement'] },
    { title: 'Green New Deal Rally', desc: 'Support for comprehensive climate legislation', hashtags: ['GreenNewDeal'], organizers: ['Progressive Action Network'] }
  ],
  reproductive: [
    { title: 'Reproductive Rights March', desc: 'Defend reproductive freedom', hashtags: ['ReproductiveRights', 'MyBodyMyChoice'], organizers: ['Women\'s Rights Coalition'] },
    { title: 'Stand with Planned Parenthood', desc: 'Rally in support of reproductive healthcare', hashtags: ['StandWithPP'], organizers: ['Healthcare Access Alliance'] },
    { title: 'Abortion Access Rally', desc: 'Protect access to safe abortion care', hashtags: ['AbortionIsHealthcare'], organizers: ['Reproductive Justice League'] }
  ],
  immigration: [
    { title: 'Immigrant Rights March', desc: 'Stand with immigrant communities', hashtags: ['ImmigrationReform', 'NoHumanIsIllegal'], organizers: ['Immigration Advocacy Network'] },
    { title: 'DACA Protection Rally', desc: 'Demand protection for DACA recipients', hashtags: ['DefendDACA', 'DreamAct'], organizers: ['Dreamer Alliance'] },
    { title: 'Families Belong Together', desc: 'End family separation at the border', hashtags: ['FamiliesBelongTogether'], organizers: ['Border Justice Coalition'] },
    { title: 'Refugee Welcome March', desc: 'Support refugee resettlement programs', hashtags: ['RefugeesWelcome'], organizers: ['Refugee Support Network'] }
  ],
  racial_justice: [
    { title: 'Black Lives Matter March', desc: 'Justice for victims of police violence', hashtags: ['BLM', 'BlackLivesMatter', 'JusticeNow'], organizers: ['BLM Local Chapter'] },
    { title: 'End Police Brutality Rally', desc: 'Demand accountability and reform', hashtags: ['EndPoliceBrutality', 'DefundThePolice'], organizers: ['Justice for All Coalition'] },
    { title: 'Racial Justice Vigil', desc: 'Remember victims, demand change', hashtags: ['RacialJustice', 'NeverForget'], organizers: ['Community Justice Network'] }
  ],
  lgbtq: [
    { title: 'Pride March', desc: 'Celebrate LGBTQ+ pride and equality', hashtags: ['Pride', 'LoveIsLove'], organizers: ['Pride Coalition'] },
    { title: 'Trans Rights Rally', desc: 'Protect transgender rights and healthcare', hashtags: ['TransRights', 'ProtectTransKids'], organizers: ['Trans Justice Alliance'] },
    { title: 'Marriage Equality Celebration', desc: 'Celebrating love and equality', hashtags: ['MarriageEquality', 'LoveWins'], organizers: ['LGBTQ Rights Foundation'] }
  ],
  labor: [
    { title: 'Workers Rights March', desc: 'Fair wages and working conditions for all', hashtags: ['UnionStrong', 'WorkersRights'], organizers: ['Local Union 123', 'Workers United'] },
    { title: 'Fight for $15 Rally', desc: 'Raise the minimum wage', hashtags: ['FightFor15'], organizers: ['Wage Justice Coalition'] },
    { title: 'Labor Day Solidarity March', desc: 'Standing together for worker rights', hashtags: ['LaborDay', 'Solidarity'], organizers: ['Central Labor Council'] }
  ],
  political: [
    { title: 'Voter Registration Drive Rally', desc: 'Get out the vote', hashtags: ['VoteReady', 'RegisterToVote'], organizers: ['Civic Engagement League'] },
    { title: 'Democracy Defense March', desc: 'Protect voting rights and democracy', hashtags: ['Democracy', 'VotingRights'], organizers: ['Democracy Now Coalition'] },
    { title: 'Political Accountability Rally', desc: 'Demand transparency and accountability', hashtags: ['Accountability'], organizers: ['Government Reform Alliance'] }
  ],
  other: [
    { title: 'Community Unity March', desc: 'Bringing our community together', hashtags: ['Unity', 'Community'], organizers: ['Community Alliance'] },
    { title: 'Peace Vigil', desc: 'Stand for peace and nonviolence', hashtags: ['Peace', 'Nonviolence'], organizers: ['Peace Coalition'] }
  ]
};

// Source types with confidence scores
const SOURCE_TYPES = [
  { type: 'permit', score: 0.9 },
  { type: 'user', score: 0.8 },
  { type: 'news', score: 0.7 },
  { type: 'social', score: 0.6 }
];

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEvent() {
  // Pick a cause
  const causes = Object.keys(EVENT_TEMPLATES);
  const cause = randomChoice(causes);
  const template = randomChoice(EVENT_TEMPLATES[cause]);

  // Pick a city
  const city = randomChoice(Object.keys(CITIES));
  const coords = CITIES[city];

  // Add slight random offset to coordinates (within ~1km)
  const latOffset = (Math.random() - 0.5) * 0.01;
  const lngOffset = (Math.random() - 0.5) * 0.01;

  // Generate timing
  const now = new Date();
  const statusRoll = Math.random();
  let status, startTime, endTime;

  if (statusRoll < 0.2) {
    // 20% past events (ended)
    status = 'ended';
    const daysAgo = randomInt(1, 30);
    startTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    endTime = new Date(startTime.getTime() + randomInt(2, 6) * 60 * 60 * 1000);
  } else if (statusRoll < 0.5) {
    // 30% current events (active)
    status = 'active';
    const hoursAgo = randomInt(1, 4);
    startTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    endTime = new Date(startTime.getTime() + randomInt(3, 6) * 60 * 60 * 1000);
  } else {
    // 50% future events (planned)
    status = 'planned';
    const daysAhead = randomInt(1, 60);
    startTime = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    endTime = new Date(startTime.getTime() + randomInt(2, 6) * 60 * 60 * 1000);
  }

  // Pick source type
  const source = randomChoice(SOURCE_TYPES);

  return {
    title: template.title,
    description: template.desc,
    cause,
    address: `${city} City Center, ${city}`,
    latitude: coords.lat + latOffset,
    longitude: coords.lng + lngOffset,
    start_time: startTime,
    end_time: endTime,
    status,
    source_type: source.type,
    source_url: `https://example.com/event/${Math.random().toString(36).substring(7)}`,
    organizers: template.organizers,
    hashtags: template.hashtags,
    confidence_score: source.score,
    expected_size: randomInt(50, 5000)
  };
}

async function seedData() {
  try {
    console.log('🌱 Seeding database with test data...');

    const numEvents = randomInt(75, 100);
    let insertedCount = 0;

    for (let i = 0; i < numEvents; i++) {
      const event = generateEvent();

      const query = `
        INSERT INTO events (
          title, description, cause, address, latitude, longitude,
          start_time, end_time, status, source_type, source_url,
          organizers, hashtags, confidence_score, expected_size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT DO NOTHING
        RETURNING id
      `;

      const values = [
        event.title,
        event.description,
        event.cause,
        event.address,
        event.latitude,
        event.longitude,
        event.start_time,
        event.end_time,
        event.status,
        event.source_type,
        event.source_url,
        event.organizers,
        event.hashtags,
        event.confidence_score,
        event.expected_size
      ];

      try {
        const result = await pool.query(query, values);
        if (result.rowCount > 0) {
          insertedCount++;
          console.log(`✅ Added: ${event.title} in ${event.address} (${event.status})`);
        }
      } catch (dbErr) {
        console.error(`❌ Error inserting event:`, dbErr.message);
      }
    }

    console.log(`\n🎯 Successfully seeded ${insertedCount} events`);

    // Show summary
    const summary = await pool.query(`
      SELECT
        cause,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'planned' THEN 1 END) as planned,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'ended' THEN 1 END) as ended
      FROM events
      GROUP BY cause
      ORDER BY count DESC
    `);

    console.log('\n📊 Database Summary:');
    console.table(summary.rows);

  } catch (err) {
    console.error('❌ Error seeding data:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedData().catch(console.error);
}

module.exports = { seedData };
