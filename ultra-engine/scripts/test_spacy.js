// Smoke test for spaCy NER sidecar.
// Usage: docker compose exec ultra_engine node scripts/test_spacy.js
// (or set SPACY_BASE_URL=http://localhost:8009 y correr local)
const nlp = require('../src/nlp');
const spacy = require('../src/spacy');

const SAMPLES = [
  {
    lang: 'en',
    text: 'Apple CEO Tim Cook met with European Commission president Ursula von der Leyen in Brussels yesterday to discuss the new Digital Markets Act, after Microsoft and Google reported $50B in combined Q3 revenue.',
  },
  {
    lang: 'es',
    text: 'El presidente Pedro Sánchez se reunió con la canciller alemana en Madrid para debatir el plan de recuperación de la Unión Europea, valorado en 750.000 millones de euros. Telefónica y Banco Santander anunciaron inversiones en Argelia.',
  },
  {
    lang: 'en',
    text: 'Working holiday visa applications for New Zealand from Spain and Algeria opened in March 2026, with the New Zealand Immigration office in Auckland processing 5,000 cases.',
  },
];

(async () => {
  console.log('--- spaCy sidecar health ---');
  const h = await spacy.health();
  console.log(h || 'DOWN (will fallback to compromise)');
  console.log();

  for (const s of SAMPLES) {
    console.log(`--- [${s.lang}] ${s.text.slice(0, 60)}... ---`);
    const res = await nlp.extractEntitiesSpacy(s.text, s.lang);
    console.log('source:', res._source);
    console.log('people:', res.people);
    console.log('orgs:  ', res.organizations);
    console.log('places:', res.places);
    console.log('countries:', res.countries);
    console.log();
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
