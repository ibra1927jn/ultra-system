// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: WorldMonitor Phase 2 read-only      ║
// ║  Consumer de las 4 tablas wm_* producidas por los crons  ║
// ║  wm-cluster-news, wm-focal-points, wm-country-scores,    ║
// ║  wm-trending-keywords.                                   ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');

const router = express.Router();

// ─── COUNTRY NAME ALIASES (for country filtering across all feeds) ──
// ISO → array of search terms in multiple languages (name + nationality adjective)
// Used to find articles in any language that mention a country,
// regardless of feed scope. Keeps top ~80 countries covered; others fall back to ISO alone.
const COUNTRY_ALIASES = {
  US: ['United States', 'USA', 'America', 'American', 'EE.UU', 'Estados Unidos', 'États-Unis', 'américain', 'estadounidense', 'Amerika', 'الولايات المتحدة', 'Vereinigten Staaten'],
  GB: ['United Kingdom', 'UK', 'Britain', 'British', 'Reino Unido', 'británico', 'Royaume-Uni', 'britannique', 'المملكة المتحدة', 'Großbritannien'],
  FR: ['France', 'French', 'Francia', 'francés', 'français', 'Französisch', 'فرنسا', 'frances'],
  DE: ['Germany', 'German', 'Alemania', 'alemán', 'Allemagne', 'allemand', 'ألمانيا', 'deutsch', 'Deutschland'],
  ES: ['Spain', 'Spanish', 'España', 'español', 'Espagne', 'espagnol', 'إسبانيا', 'Spanien'],
  IT: ['Italy', 'Italian', 'Italia', 'italiano', 'Italie', 'italien', 'إيطاليا', 'Italien'],
  PT: ['Portugal', 'Portuguese', 'portugués', 'portugais', 'البرتغال'],
  NL: ['Netherlands', 'Dutch', 'Holanda', 'holandés', 'Pays-Bas', 'néerlandais', 'هولندا', 'Niederlande'],
  BE: ['Belgium', 'Belgian', 'Bélgica', 'belga', 'Belgique', 'belge', 'بلجيكا'],
  CH: ['Switzerland', 'Swiss', 'Suiza', 'suizo', 'Suisse', 'suisse', 'سويسرا', 'Schweiz'],
  AT: ['Austria', 'Austrian', 'austríaco', 'Autriche', 'autrichien', 'النمسا', 'Österreich'],
  SE: ['Sweden', 'Swedish', 'Suecia', 'sueco', 'Suède', 'suédois', 'السويد', 'Schweden'],
  NO: ['Norway', 'Norwegian', 'Noruega', 'noruego', 'Norvège', 'norvégien', 'النرويج', 'Norwegen'],
  DK: ['Denmark', 'Danish', 'Dinamarca', 'danés', 'Danemark', 'danois', 'الدنمارك', 'Dänemark'],
  FI: ['Finland', 'Finnish', 'Finlandia', 'finlandés', 'Finlande', 'finlandais', 'فنلندا'],
  IE: ['Ireland', 'Irish', 'Irlanda', 'irlandés', 'Irlande', 'irlandais', 'أيرلندا', 'Irland'],
  PL: ['Poland', 'Polish', 'Polonia', 'polaco', 'Pologne', 'polonais', 'بولندا', 'Polen'],
  CZ: ['Czech', 'Czech Republic', 'República Checa', 'checo', 'Tchéquie', 'tchèque', 'التشيك', 'Tschechien'],
  GR: ['Greece', 'Greek', 'Grecia', 'griego', 'Grèce', 'grec', 'اليونان', 'Griechenland'],
  RO: ['Romania', 'Romanian', 'Rumania', 'rumano', 'Roumanie', 'roumain', 'رومانيا', 'Rumänien'],
  HU: ['Hungary', 'Hungarian', 'Hungría', 'húngaro', 'Hongrie', 'hongrois', 'المجر', 'Ungarn'],
  BG: ['Bulgaria', 'Bulgarian', 'búlgaro', 'Bulgarie', 'bulgare', 'بلغاريا', 'Bulgarien'],
  UA: ['Ukraine', 'Ukrainian', 'Ucrania', 'ucraniano', 'ukrainien', 'أوكرانيا'],
  RU: ['Russia', 'Russian', 'Rusia', 'ruso', 'Russie', 'russe', 'روسيا', 'Russland'],
  BY: ['Belarus', 'Belarusian', 'Bielorrusia', 'bielorruso', 'Biélorussie', 'بيلاروسيا'],
  TR: ['Turkey', 'Turkish', 'Turquía', 'turco', 'Turquie', 'turc', 'تركيا', 'Türkei'],
  CN: ['China', 'Chinese', 'chino', 'chinois', 'الصين', 'chinesisch'],
  JP: ['Japan', 'Japanese', 'Japón', 'japonés', 'Japon', 'japonais', 'اليابان'],
  KR: ['South Korea', 'Korean', 'Corea del Sur', 'coreano', 'Corée du Sud', 'coréen', 'كوريا', 'Südkorea'],
  KP: ['North Korea', 'DPRK', 'Corea del Norte', 'Corée du Nord', 'كوريا الشمالية', 'Nordkorea'],
  IN: ['India', 'Indian', 'indio', 'hindú', 'indien', 'الهند', 'indisch'],
  PK: ['Pakistan', 'Pakistani', 'paquistaní', 'pakistanais', 'باكستان'],
  BD: ['Bangladesh', 'Bangladeshi', 'bangladesí', 'بنغلاديش'],
  ID: ['Indonesia', 'Indonesian', 'indonesio', 'indonésien', 'إندونيسيا'],
  VN: ['Vietnam', 'Vietnamese', 'vietnamita', 'vietnamien', 'فيتنام'],
  TH: ['Thailand', 'Thai', 'Tailandia', 'tailandés', 'Thaïlande', 'thaïlandais', 'تايلاند'],
  PH: ['Philippines', 'Filipino', 'Filipinas', 'filipino', 'الفلبين'],
  MY: ['Malaysia', 'Malaysian', 'Malasia', 'malayo', 'Malaisie', 'ماليزيا'],
  SG: ['Singapore', 'Singaporean', 'Singapur', 'سنغافورة'],
  TW: ['Taiwan', 'Taiwanese', 'taiwanés', 'taïwanais', 'تايوان'],
  HK: ['Hong Kong', 'Hongkongese', 'هونغ كونغ'],
  AU: ['Australia', 'Australian', 'australiano', 'australien', 'أستراليا'],
  NZ: ['New Zealand', 'Kiwi', 'Nueva Zelanda', 'Nouvelle-Zélande', 'néo-zélandais', 'نيوزيلندا', 'Neuseeland'],
  CA: ['Canada', 'Canadian', 'Canadá', 'canadiense', 'canadien', 'كندا'],
  MX: ['Mexico', 'Mexican', 'México', 'mexicano', 'Mexique', 'mexicain', 'المكسيك', 'Mexiko'],
  BR: ['Brazil', 'Brazilian', 'Brasil', 'brasileño', 'brésilien', 'Brasilien', 'البرازيل'],
  AR: ['Argentina', 'Argentine', 'argentino', 'argentin', 'الأرجنتين', 'Argentinien'],
  CL: ['Chile', 'Chilean', 'chileno', 'chilien', 'تشيلي'],
  PE: ['Peru', 'Peruvian', 'Perú', 'peruano', 'Pérou', 'péruvien', 'بيرو'],
  CO: ['Colombia', 'Colombian', 'colombiano', 'colombien', 'كولومبيا', 'Kolumbien'],
  VE: ['Venezuela', 'Venezuelan', 'venezolano', 'vénézuélien', 'فنزويلا'],
  EC: ['Ecuador', 'Ecuadorian', 'ecuatoriano', 'équatorien', 'الإكوادور'],
  BO: ['Bolivia', 'Bolivian', 'boliviano', 'bolivien', 'بوليفيا'],
  UY: ['Uruguay', 'Uruguayan', 'uruguayo', 'uruguayen', 'الأوروغواي'],
  PY: ['Paraguay', 'Paraguayan', 'paraguayo', 'paraguayen', 'باراغواي'],
  CU: ['Cuba', 'Cuban', 'cubano', 'cubain', 'كوبا'],
  DO: ['Dominican', 'Dominicana', 'dominicano', 'dominicain'],
  PR: ['Puerto Rico', 'Puerto Rican', 'puertorriqueño', 'portoricain'],
  IL: ['Israel', 'Israeli', 'israelí', 'israélien', 'إسرائيل'],
  PS: ['Palestine', 'Palestinian', 'Palestina', 'palestino', 'palestinien', 'فلسطين', 'Gaza', 'Cisjordania', 'West Bank'],
  LB: ['Lebanon', 'Lebanese', 'Líbano', 'libanés', 'Liban', 'libanais', 'لبنان', 'Libanon'],
  SY: ['Syria', 'Syrian', 'Siria', 'sirio', 'Syrie', 'syrien', 'سوريا', 'Syrien'],
  JO: ['Jordan', 'Jordanian', 'Jordania', 'jordano', 'Jordanie', 'jordanien', 'الأردن'],
  IQ: ['Iraq', 'Iraqi', 'iraquí', 'irakien', 'العراق'],
  IR: ['Iran', 'Iranian', 'Irán', 'iraní', 'iranien', 'إيران'],
  SA: ['Saudi Arabia', 'Saudi', 'Arabia Saudí', 'saudí', 'Arabie saoudite', 'saoudien', 'السعودية'],
  AE: ['UAE', 'Emirates', 'Emiratos', 'emiratí', 'الإمارات', 'Émirats'],
  QA: ['Qatar', 'Qatari', 'catarí', 'qatari', 'قطر'],
  KW: ['Kuwait', 'Kuwaiti', 'kuwaití', 'koweïtien', 'الكويت'],
  YE: ['Yemen', 'Yemeni', 'yemení', 'yéménite', 'اليمن', 'Houthi'],
  OM: ['Oman', 'Omani', 'omaní', 'omanais', 'عمان'],
  EG: ['Egypt', 'Egyptian', 'Egipto', 'egipcio', 'Égypte', 'égyptien', 'مصر', 'Ägypten'],
  LY: ['Libya', 'Libyan', 'Libia', 'libio', 'libyen', 'ليبيا'],
  TN: ['Tunisia', 'Tunisian', 'Túnez', 'tunecino', 'Tunisie', 'tunisien', 'تونس', 'Tunesien'],
  DZ: ['Algeria', 'Algerian', 'Argelia', 'argelino', 'Algérie', 'algérien', 'الجزائر', 'Algerien'],
  MA: ['Morocco', 'Moroccan', 'Marruecos', 'marroquí', 'Maroc', 'marocain', 'المغرب', 'Marokko'],
  SD: ['Sudan', 'Sudanese', 'Sudán', 'sudanés', 'soudanais', 'السودان'],
  SO: ['Somalia', 'Somali', 'somalí', 'somalien', 'الصومال'],
  ET: ['Ethiopia', 'Ethiopian', 'Etiopía', 'etíope', 'Éthiopie', 'éthiopien', 'إثيوبيا'],
  KE: ['Kenya', 'Kenyan', 'keniano', 'kényan', 'كينيا'],
  NG: ['Nigeria', 'Nigerian', 'nigeriano', 'nigérian', 'نيجيريا'],
  ZA: ['South Africa', 'South African', 'Sudáfrica', 'sudafricano', 'Afrique du Sud', 'sud-africain', 'جنوب أفريقيا', 'Südafrika'],
  GH: ['Ghana', 'Ghanaian', 'ghanés', 'ghanéen', 'غانا'],
  CI: ['Ivory Coast', 'Côte d\'Ivoire', 'Costa de Marfil', 'marfileño', 'ivoirien', 'ساحل العاج'],
  SN: ['Senegal', 'Senegalese', 'senegalés', 'sénégalais', 'السنغال'],
  CM: ['Cameroon', 'Cameroonian', 'Camerún', 'camerunés', 'Cameroun', 'camerounais', 'الكاميرون'],
  AF: ['Afghanistan', 'Afghan', 'Afganistán', 'afgano', 'afghan', 'أفغانستان', 'Taliban'],
  MM: ['Myanmar', 'Burma', 'Burmese', 'Birmania', 'birmano', 'birman', 'ميانمار'],
  NP: ['Nepal', 'Nepali', 'nepalí', 'népalais', 'نيبال'],
  LK: ['Sri Lanka', 'Sri Lankan', 'esrilanqués', 'sri-lankais', 'سريلانكا'],
  GE: ['Georgia', 'Georgian', 'Georgia', 'georgiano', 'Géorgie', 'géorgien', 'جورجيا'],
  AM: ['Armenia', 'Armenian', 'armenio', 'arménien', 'أرمينيا'],
  AZ: ['Azerbaijan', 'Azerbaijani', 'Azerbaiyán', 'azerí', 'Azerbaïdjan', 'azerbaïdjanais', 'أذربيجان'],
  KZ: ['Kazakhstan', 'Kazakh', 'Kazajistán', 'kazajo', 'Kazakhstan', 'kazakh', 'كازاخستان'],
};

// Fallback: build country term list from ISO + geoHierarchy lookup (lazy)
function getCountryTerms(iso, countryNameFromGeo) {
  const aliases = COUNTRY_ALIASES[iso];
  if (aliases && aliases.length) return aliases;
  // Fallback: use the name from geoHierarchy + ISO
  const terms = [];
  if (countryNameFromGeo) terms.push(countryNameFromGeo);
  return terms.length ? terms : [iso];
}

// ─── TOPIC KEYWORDS (multilingual) ──
// The NLP classifier at feed-level misclassifies most articles into generic
// buckets. To fix this, we build keyword sets per topic across major languages.
// Filter matches on primary_topic OR secondary_topic OR title contains any keyword.
// This dramatically expands topic coverage for every workspace.
// High-confidence keywords only — specific enough to avoid false positives.
// Generic terms like "tour", "league", "match", "cup", "draft", "pilot", "coach",
// "goal", "draft", "season", "ticket", "game" were REMOVED because they match
// unrelated articles (Pope's Africa tour, legal case appeals, flight pilot, etc).
const TOPIC_KEYWORDS = {
  football_soccer: ['football','soccer','fútbol','calcio','Champions League','La Liga','Premier League','Bundesliga','Serie A','Ligue 1','FIFA','UEFA','Copa Libertadores','Copa America','Copa del Rey','Copa America','Boca Juniors','River Plate','Real Madrid','FC Barcelona','Barça','Manchester City','Manchester United','Bayern Munich','Bayern München','PSG','Juventus','Chelsea FC','Arsenal FC','Liverpool FC','Atlético Madrid','Flamengo','Palmeiras','Messi','Cristiano Ronaldo','Mbappé','Neymar','Haaland','Lewandowski','Vinicius','Benzema','Scaloni','Balón de Oro','Superclásico'],
  basketball_nba: ['NBA','baloncesto','basketball','Euroliga','EuroLeague','WNBA','LeBron James','Stephen Curry','Giannis Antetokounmpo','Nikola Jokic','Kevin Durant','Luka Doncic','Lakers','Celtics','Golden State Warriors','Bucks','FIBA','NCAA basketball','March Madness'],
  motorsport_f1: ['Formula 1','Fórmula 1','F1 Grand Prix','MotoGP','NASCAR','IndyCar','Verstappen','Lewis Hamilton','Charles Leclerc','Lando Norris','Carlos Sainz','Fernando Alonso','Valentino Rossi','Marc Márquez','Francesco Bagnaia','Dakar Rally','WRC rally'],
  combat_sports: ['UFC','MMA','boxing match','boxeo','Canelo Álvarez','Tyson Fury','Jake Paul','Conor McGregor','WWE','Khabib','jiu-jitsu','taekwondo champion','karate champion','heavyweight champion'],
  athletics_other: ['athletics','atletismo','marathon','maratón','Olympic Games','Juegos Olímpicos','Olympic gold','Tour de France','Giro d\'Italia','Vuelta a España','Wimbledon','Roland Garros','US Open tennis','Australian Open tennis','ATP Tour','WTA','Rafael Nadal','Djokovic','Carlos Alcaraz','Iga Swiatek','Aryna Sabalenka','Sinner','gymnastics','gimnasia artística','Tour de Francia','Giro de Italia','PGA Tour','Masters Tournament','US Open golf','Open Championship golf','Ryder Cup','McIlroy','Scheffler','triathlon','triatlón'],
  gaming_esports: ['esports','e-sports','League of Legends','LoL Worlds','DOTA 2','Counter-Strike','CS:GO','CS2','Fortnite','Valorant','esports championship','Twitch streamer','speedrun'],
  rugby_cricket: ['rugby','cricket','Six Nations rugby','Rugby World Cup','IPL cricket','Indian Premier League','All Blacks','Springboks','Wallabies','British & Irish Lions','The Ashes','Test cricket','ODI cricket','T20 cricket'],

  technology: ['artificial intelligence','inteligencia artificial','machine learning','deep learning','LLM','ChatGPT','OpenAI','Claude AI','Gemini AI','Anthropic','semiconductor','microchip','Nvidia','Intel chip','TSMC','smartphone','iPhone','Android phone','Silicon Valley','tech giant','Big Tech','electric vehicle','EV stock'],
  cybersecurity: ['ransomware','cyberattack','ciberataque','phishing','malware','data breach','filtración de datos','zero-day','CVE ','hacker','hacked','hacking','DDoS attack','exploit vulnerability','vulnerabilidad crítica','spyware','Pegasus spyware'],
  science_research: ['peer-reviewed','Nature journal','Science journal','Nobel Prize','premio Nobel','clinical trial','ensayo clínico','research study','estudio científico','CRISPR','quantum computing','computación cuántica','genome sequencing','secuenciación genoma','particle physics','física de partículas'],
  space_astronomy: ['SpaceX launch','NASA mission','Mars rover','Moon landing','Starship','Falcon Heavy','ISS','International Space Station','James Webb','JWST','Hubble','asteroide','black hole','agujero negro','ESA','Artemis program','Voyager','Parker Solar','exoplanet','exoplaneta','Saturn','Saturno','Jupiter','Júpiter','Vía Láctea','Milky Way'],

  economy_finance: ['inflación','inflation rate','Federal Reserve','rate hike','tipos de interés','GDP growth','PIB','recession','recesión','Wall Street','Dow Jones','S&P 500','Nasdaq','Nikkei','FTSE','DAX','IBEX','central bank','banco central','BCE','ECB','IMF','FMI','World Bank','Banco Mundial','bond yield','Treasury bond','deuda pública','quantitative easing','Eurozone','eurozona','Bitcoin price','Ethereum','blockchain','stablecoin','crypto market','Goldman Sachs','JPMorgan','Morgan Stanley'],
  supply_chain: ['supply chain','cadena de suministro','logistics giant','tariff war','arancel','trade deal','acuerdo comercial','WTO','OMC','container shipping','naviera','freight rates','shipping rates','semiconductor shortage','chip shortage','port congestion'],
  real_estate: ['real estate market','mercado inmobiliario','housing market','mercado de la vivienda','mortgage rate','tipo hipotecario','home price','precio de la vivienda','rental market','alquiler','property developer','promotora inmobiliaria'],
  startups_venture: ['Series A','Series B','Series C','seed round','ronda semilla','venture capital','capital de riesgo','Y Combinator','Andreessen Horowitz','Sequoia Capital','unicorn startup','IPO filing','salida a bolsa','angel investor','inversor ángel'],

  elections_governance: ['presidential election','elecciones presidenciales','parliamentary election','elecciones legislativas','voter turnout','participación electoral','campaign trail','ballot','papeleta','referendum','referéndum','primary election','elecciones primarias','political party','partido político','coalition government','gobierno de coalición','prime minister','primer ministro','cabinet','gabinete','senate vote','senado vota','congress vote','congreso vota','impeachment'],
  legal_justice: ['Supreme Court','Corte Suprema','Tribunal Supremo','ICC','International Criminal Court','Corte Penal Internacional','ICJ','Hague','La Haya','indictment','acusación formal','guilty verdict','veredicto de culpabilidad','life sentence','cadena perpetua','appeal court','apelación'],
  human_rights: ['human rights','derechos humanos','Amnesty International','Human Rights Watch','freedom of speech','libertad de expresión','civil rights','derechos civiles','LGBTQ rights','women\'s rights','derechos de la mujer','political prisoner','preso político'],
  migration_refugees: ['refugee crisis','crisis de refugiados','asylum seeker','solicitante de asilo','border crossing','cruce fronterizo','deportation','deportación','ICE detention','Frontex','Mediterranean migrant','migrante mediterráneo','displaced people','desplazados'],

  conflict: ['ceasefire','alto el fuego','airstrike','ataque aéreo','missile strike','ataque con misil','drone strike','ataque con dron','invasion','invasión','offensive','ofensiva','siege','asedio','bombardment','bombardeo','casualties','civilians killed','civiles muertos','war crime','crimen de guerra','frontline','primera línea'],
  military_defense: ['NATO','OTAN','Pentagon','Pentágono','aircraft carrier','portaaviones','fighter jet','avión de combate','submarine','submarino','military exercise','ejercicio militar','defense budget','presupuesto de defensa','arms sale','venta de armas','Joint Chiefs'],
  nuclear_proliferation: ['nuclear weapon','arma nuclear','uranium enrichment','enriquecimiento de uranio','IAEA','OIEA','JCPOA','Iran deal','ICBM','nuclear warhead','ojiva nuclear','nuclear test','prueba nuclear','non-proliferation','no proliferación'],
  crime_organized: ['drug cartel','cártel','narcotraficante','drug lord','capo','Sinaloa cartel','CJNG','El Chapo','mafia','mob boss','organized crime','crimen organizado','kingpin','money laundering','lavado de dinero','DEA operation','Interpol'],

  climate_environment: ['climate change','cambio climático','global warming','calentamiento global','greenhouse gas','gas de efecto invernadero','carbon emission','emisión de carbono','net zero','emisiones cero','COP climate','Paris Agreement','Acuerdo de París','renewable energy','energía renovable','solar power','energía solar','wind farm','parque eólico','heatwave','ola de calor','extreme weather','clima extremo'],
  disaster_natural: ['earthquake','terremoto','sismo','magnitude','magnitud','Richter','flash flood','inundación','hurricane','huracán','tsunami warning','volcano eruption','erupción volcánica','wildfire','incendio forestal','typhoon','tifón','cyclone','ciclón','evacuation order','orden de evacuación','landslide','deslizamiento de tierra'],
  biodiversity_wildlife: ['endangered species','especies en peligro','wildlife conservation','conservación de fauna','deforestation','deforestación','rainforest','selva tropical','coral bleaching','blanqueamiento coral','poaching','caza furtiva','mass extinction','extinción masiva','Amazon rainforest','Amazonas selva'],
  agriculture_farming: ['wheat harvest','cosecha de trigo','corn crop','cultivo de maíz','soybean','soja','rice production','producción de arroz','livestock farming','ganadería','dairy industry','industria láctea','crop failure','pérdida de cosecha','drought farming','sequía agricultura','USDA report'],

  medicine_pharma: ['pandemic','pandemia','outbreak','brote','virus outbreak','brote viral','vaccine','vacuna','vaccination campaign','campaña de vacunación','clinical trial','ensayo clínico','cancer treatment','tratamiento oncológico','cardiovascular disease','enfermedad cardiovascular','diabetes','Alzheimer','dementia','demencia','WHO','OMS','FDA approval','aprobación FDA','EMA','mental health crisis','crisis salud mental','antibiotic resistance','resistencia antibióticos','epidemic','epidemia','measles','sarampión','tuberculosis','cholera','cólera','ebola','malaria','dengue','zika'],

  maritime: ['shipping lane','ruta marítima','container ship','buque portacontenedores','oil tanker','petrolero','Strait of Hormuz','Estrecho de Ormuz','Suez Canal','Canal de Suez','Panama Canal','Canal de Panamá','Bab el-Mandeb','Malacca','Houthi attack','ataque hutí','maritime blockade','bloqueo marítimo','naval vessel','buque naval','cargo ship','carguero','cruise ship','crucero','fishing fleet','flota pesquera'],

  united_nations: ['United Nations','Naciones Unidas','UN Security Council','Consejo de Seguridad de la ONU','UNESCO','UNICEF','UNHCR','ACNUR','UN General Assembly','Asamblea General','UN Secretary','Secretario General ONU','Antonio Guterres','peacekeeping force','fuerza de paz','blue helmets','cascos azules'],
  media_journalism: ['press freedom','libertad de prensa','journalist killed','periodista asesinado','media censorship','censura mediática','Reporters Without Borders','Reporteros Sin Fronteras','Pulitzer Prize','Premio Pulitzer','newsroom'],

  cinema_tv: ['Oscar nominee','nominado al Oscar','Academy Award','Emmy Award','Cannes Film Festival','Festival de Cannes','Netflix series','Disney+','HBO Max','box office','taquilla','blockbuster film','película taquillera','Hollywood actor','actor de Hollywood','film director','director de cine','Oscar winner','ganador del Oscar','Bollywood film'],
  music: ['Grammy Award','premios Grammy','Eurovision Song','Festival Eurovisión','Billboard charts','música Billboard','world tour concert','concierto gira mundial','Taylor Swift','Beyoncé','Drake album','Bad Bunny','Rosalía','BTS','K-pop group'],
  art_museums: ['Louvre Museum','museo Louvre','Prado Museum','Museo del Prado','MoMA','Tate Modern','Picasso painting','pintura de Picasso','Dalí','Frida Kahlo','Banksy artwork','Venice Biennale','Bienal de Venecia','art auction','subasta de arte','Sotheby\'s','Christie\'s'],
  literature_books: ['Nobel Prize literature','Premio Nobel de Literatura','Pulitzer fiction','Booker Prize','bestseller novel','novela bestseller','literary award','premio literario'],
  fashion: ['Milan Fashion Week','Semana de la Moda de Milán','Paris Fashion Week','Semana de la Moda de París','New York Fashion Week','Vogue magazine','Gucci','Louis Vuitton','Balenciaga','Chanel','Dior','Prada','Hermès','fashion designer','diseñador de moda'],
  gastronomy_food_culture: ['Michelin star','estrella Michelin','Michelin-starred','celebrity chef','chef con estrella','wine tasting','cata de vinos','culinary','gastronómico','world\'s best restaurant','mejor restaurante','food festival','festival gastronómico'],
  tourism_travel: ['tourist arrival','llegada de turistas','tourism boom','auge turístico','all-inclusive resort','hotel resort','airline strike','huelga aerolínea','flight delay','retraso de vuelo','visa requirement','requisito de visa','passport renewal','renovación pasaporte','travel advisory','aviso de viaje'],

  education_academia: ['university ranking','ranking universitario','Harvard','MIT','Stanford University','Oxford University','Cambridge University','scholarship program','programa de becas','tuition fee','matrícula universitaria','college admission','admisión universitaria','academic research','investigación académica'],
  religion_spirituality: ['Pope','papa','Vatican','Vaticano','Catholic Church','Iglesia Católica','bishop','obispo','cardinal','cardenal','Ramadan','Ramadán','Easter Sunday','Domingo de Pascua','Christmas Mass','Misa de Navidad','Hajj pilgrimage','peregrinación Hajj','religious persecution','persecución religiosa'],
  automotive: ['Tesla Model','Toyota Camry','Ford F-150','BMW M','Mercedes-Benz','Volkswagen Group','Ferrari car','Porsche 911','Lamborghini','electric vehicle sales','venta de vehículos eléctricos','autonomous driving','conducción autónoma','EV charging'],
  archaeology_history: ['archaeological find','hallazgo arqueológico','ancient tomb','tumba antigua','Roman ruins','ruinas romanas','Greek temple','templo griego','Mayan pyramid','pirámide maya','Inca ruins','ruinas inca','dinosaur fossil','fósil de dinosaurio','pharaoh tomb','tumba de faraón'],
};

// Given array of topic keys, return alternation regex pattern with word boundaries.
// Critical: \y (POSIX word boundary in Postgres) prevents "MMA" from matching
// "suMMAry", "NBA" from matching arbitrary substrings, etc.
// Non-latin text (Arabic, Chinese) skips boundaries since \y has undefined
// behavior on non-ASCII; we wrap each term safely.
function wrapBoundary(s) {
  // If keyword starts/ends with non-word char (space, accent, etc.), skip boundary
  const startsWord = /^\w/.test(s);
  const endsWord = /\w$/.test(s);
  return (startsWord ? '\\y' : '') + s + (endsWord ? '\\y' : '');
}
const _escRegex = s => s.replace(/[.\\()[\]{}*+?^$|]/g, '\\$&');

function buildTopicRegex(topics) {
  if (!Array.isArray(topics) || !topics.length) return '';
  const set = new Set();
  for (const t of topics) {
    const kws = TOPIC_KEYWORDS[t];
    if (kws) kws.forEach(k => set.add(k));
  }
  if (!set.size) return '';
  return [...set].map(k => wrapBoundary(_escRegex(k))).join('|');
}

// Build regex pattern for country filter (same boundary handling)
function buildCountryRegex(terms) {
  if (!Array.isArray(terms) || !terms.length) return '';
  return terms.map(k => wrapBoundary(_escRegex(k))).join('|');
}

// ─── GET /api/wm/summary ─ Snapshot agregado de las 4 tablas wm_* ───
//
// Devuelve el estado actual del cerebro de inteligencia: top países por
// CII, top focal points, top spikes de keywords, y los multi-source
// clusters más activos de las últimas horas. Pensado para consumirse
// desde el comando /world de Telegram y desde el dashboard.
router.get('/summary', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);
    const clusterHours = Math.min(parseInt(req.query.clusterHours, 10) || 6, 48);

    const [countries, focalPoints, trending, clusters, totals] = await Promise.all([
      db.queryAll(
        `SELECT code, name, score, level, trend, change_24h,
                component_unrest, component_conflict,
                component_security, component_information, last_seen
         FROM wm_country_scores
         ORDER BY score DESC, last_seen DESC
         LIMIT $1`,
        [limit]
      ),
      db.queryAll(
        `SELECT entity_id, entity_type, display_name,
                news_mentions, focal_score, urgency,
                top_headlines, last_seen
         FROM wm_focal_points
         ORDER BY focal_score DESC
         LIMIT $1`,
        [limit]
      ),
      db.queryAll(
        `SELECT term, mention_count, unique_sources,
                multiplier, baseline, confidence, last_seen
         FROM wm_trending_keywords
         ORDER BY mention_count DESC
         LIMIT $1`,
        [limit]
      ),
      db.queryAll(
        `SELECT cluster_key, primary_title, primary_source, primary_link,
                source_count, member_count, last_seen
         FROM wm_clusters
         WHERE source_count > 1
           AND last_seen >= NOW() - ($1::int * INTERVAL '1 hour')
         ORDER BY source_count DESC, last_seen DESC
         LIMIT $2`,
        [clusterHours, limit]
      ),
      db.queryOne(
        `SELECT
           (SELECT COUNT(*) FROM wm_clusters)            AS clusters_total,
           (SELECT COUNT(*) FROM wm_clusters WHERE source_count > 1) AS clusters_multi_source,
           (SELECT COUNT(*) FROM wm_focal_points)        AS focal_points_total,
           (SELECT COUNT(*) FROM wm_country_scores)      AS country_scores_total,
           (SELECT COUNT(*) FROM wm_trending_keywords)   AS trending_total,
           (SELECT MAX(updated_at) FROM wm_clusters)         AS clusters_last_update,
           (SELECT MAX(updated_at) FROM wm_focal_points)     AS focal_points_last_update,
           (SELECT MAX(updated_at) FROM wm_country_scores)   AS country_scores_last_update,
           (SELECT MAX(updated_at) FROM wm_trending_keywords) AS trending_last_update`
      ),
    ]);

    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      totals,
      top_countries: countries,
      top_focal_points: focalPoints,
      top_trending: trending,
      top_multi_source_clusters: clusters,
    });
  } catch (err) {
    console.error('❌ /api/wm/summary error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/country/:iso ─ Top news per country ──────────
//
// Wraps the SQL function top_news_country(iso, limit, hours).
// Returns enriched articles with NLP data for a given country.
// Usage: GET /api/wm/news/country/PK?limit=20&hours=24
router.get('/news/country/:iso', async (req, res) => {
  try {
    const iso = String(req.params.iso).toUpperCase().slice(0, 2);
    if (!/^[A-Z]{2}$/.test(iso)) {
      return res.status(400).json({ ok: false, error: 'invalid ISO code' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168);

    const rows = await db.queryAll(
      `SELECT * FROM top_news_country($1, $2, $3)`,
      [iso, limit, hours]
    );

    res.json({ ok: true, country: iso, count: rows.length, data: rows });
  } catch (err) {
    console.error(`❌ /api/wm/news/country error:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/topic/:topic ─ Top news by topic ─────────────
router.get('/news/topic/:topic', async (req, res) => {
  try {
    const topic = String(req.params.topic).toLowerCase().slice(0, 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await db.queryAll(
      `SELECT article_id, title, url, published_at, relevance_score,
              source_name, lang, continent, subregion, sentiment_label, nlp_summary
       FROM v_news_by_topic
       WHERE primary_topic = $1
       ORDER BY relevance_score DESC, published_at DESC LIMIT $2`,
      [topic, limit]
    );
    res.json({ ok: true, topic, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/topic error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/topic/:topic/region/:region ──────────────────
router.get('/news/topic/:topic/region/:region', async (req, res) => {
  try {
    const topic = String(req.params.topic).toLowerCase().slice(0, 30);
    const region = String(req.params.region).slice(0, 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await db.queryAll(
      `SELECT article_id, title, url, published_at, relevance_score,
              source_name, lang, continent, subregion, sentiment_label, nlp_summary
       FROM v_news_by_topic
       WHERE primary_topic = $1 AND (subregion = $2 OR continent = $2)
       ORDER BY relevance_score DESC, published_at DESC LIMIT $3`,
      [topic, region, limit]
    );
    res.json({ ok: true, topic, region, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/topic/region error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/region/:region ───────────────────────────────
router.get('/news/region/:region', async (req, res) => {
  try {
    const region = String(req.params.region).slice(0, 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await db.queryAll(
      `SELECT article_id, title, url, published_at, relevance_score,
              source_name, lang, primary_topic, country_name, subregion, continent,
              sentiment_label, nlp_summary
       FROM v_news_by_region
       WHERE subregion = $1 OR continent = $1
       ORDER BY relevance_score DESC, published_at DESC LIMIT $2`,
      [region, limit]
    );
    res.json({ ok: true, region, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/region error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/country/:iso/topic/:topic ───────────────────
router.get('/news/country/:iso/topic/:topic', async (req, res) => {
  try {
    const iso = String(req.params.iso).toUpperCase().slice(0, 2);
    if (!/^[A-Z]{2}$/.test(iso)) {
      return res.status(400).json({ ok: false, error: 'invalid ISO code' });
    }
    const topic = String(req.params.topic).toLowerCase().slice(0, 30);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const rows = await db.queryAll(
      `SELECT article_id, title, url, published_at, relevance_score,
              source_name, lang, primary_topic, country_name, subregion, continent,
              sentiment_label, nlp_summary
       FROM v_news_by_country_topic
       WHERE country_iso = $1 AND (primary_topic = $2 OR secondary_topic = $2)
       ORDER BY relevance_score DESC, published_at DESC LIMIT $3`,
      [iso, topic, limit]
    );
    res.json({ ok: true, country: iso, topic, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/country/topic error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/summary ─ Executive summary ─────────────────
router.get('/news/summary', async (req, res) => {
  try {
    const [byContinentRaw, byTopicRaw, quality] = await Promise.all([
      db.queryAll(`
        SELECT continent, count(*) articles,
          count(DISTINCT source_name) sources,
          count(*) FILTER (WHERE relevance_score >= 8) high_score,
          round(avg(relevance_score)::numeric, 1) avg_score
        FROM v_news_by_topic
        GROUP BY continent ORDER BY articles DESC
      `),
      db.queryAll(`
        SELECT primary_topic, count(*) articles,
          count(*) FILTER (WHERE relevance_score >= 8) high_score,
          count(*) FILTER (WHERE sentiment_label = 'negative') negative,
          round(avg(relevance_score)::numeric, 1) avg_score
        FROM v_news_by_topic
        GROUP BY primary_topic ORDER BY high_score DESC, articles DESC LIMIT 10
      `),
      db.queryOne(`
        SELECT count(*) total_feeds,
          count(*) FILTER (WHERE articles_72h > 0) active_feeds,
          count(*) FILTER (WHERE articles_72h = 0) dead_feeds,
          round(avg(duplicate_pct)::numeric, 1) avg_dup_pct,
          round(avg(enriched_pct)::numeric, 1) avg_enrich_pct
        FROM v_feed_quality
      `)
    ]);

    // Top 3 articles per continent (single query with window function)
    const topArticles = await db.queryAll(`
      SELECT * FROM (
        SELECT continent, title, source_name, relevance_score, published_at,
               ROW_NUMBER() OVER (PARTITION BY continent ORDER BY relevance_score DESC, published_at DESC) AS rn
        FROM v_news_by_topic
        WHERE continent IS NOT NULL
      ) ranked WHERE rn <= 3
    `);
    const topByContinent = {};
    for (const c of byContinentRaw) {
      topByContinent[c.continent] = {
        ...c,
        top_articles: topArticles.filter(a => a.continent === c.continent).map(({ rn, ...rest }) => rest)
      };
    }

    res.json({
      ok: true,
      continents: topByContinent,
      topics: byTopicRaw,
      feed_health: quality
    });
  } catch (err) {
    console.error('❌ /api/wm/news/summary error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═════��═════════════════════════════════════════════════════
//  MAP ENDPOINTS — /api/wm/map/*
//  Datos para el WorldMonitor interactivo (Leaflet)
// ═════���════════════════════��════════════════════════════════

// ─── GET /api/wm/map/flights ─ Latest flight snapshot ─────
// ?type=military|commercial|all (default all)
// Returns latest snapshot (last 2h) sampled to max 3000 per type
router.get('/map/flights', async (req, res) => {
  try {
    const type = String(req.query.type || 'all').toLowerCase();
    const results = {};

    if (type === 'all' || type === 'military') {
      const mil = await db.queryAll(`
        SELECT icao24, callsign, aircraft_type, operator, operator_country,
               lat, lon, altitude_ft, heading_deg, speed_kt, hotspot, confidence,
               observed_at
        FROM wm_military_flights
        WHERE observed_at >= NOW() - INTERVAL '2 hours'
          AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT 3000
      `);
      results.military = mil;
    }

    if (type === 'all' || type === 'commercial') {
      const com = await db.queryAll(`
        SELECT icao24, callsign, origin_country, lat, lon,
               altitude_ft, heading_deg, speed_kt, region, observed_at
        FROM wm_commercial_flights
        WHERE observed_at >= NOW() - INTERVAL '2 hours'
          AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT 3000
      `);
      results.commercial = com;
    }

    res.json({ ok: true, data: results });
  } catch (err) {
    console.error('❌ /api/wm/map/flights error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/vessels ─ Latest vessel snapshot ─────
// ?type=military|commercial|all (default all)
router.get('/map/vessels', async (req, res) => {
  try {
    const type = String(req.query.type || 'all').toLowerCase();
    const results = {};

    if (type === 'all' || type === 'military') {
      const mil = await db.queryAll(`
        SELECT mmsi, vessel_name, vessel_type, operator, operator_country,
               lat, lon, heading_deg, speed_kt, near_chokepoint, near_base,
               confidence, observed_at
        FROM wm_military_vessels
        WHERE observed_at >= NOW() - INTERVAL '4 hours'
          AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT 2000
      `);
      results.military = mil;
    }

    if (type === 'all' || type === 'commercial') {
      const com = await db.queryAll(`
        SELECT mmsi, vessel_name, category, flag_country,
               lat, lon, heading_deg, speed_kt, near_chokepoint,
               destination, observed_at
        FROM wm_commercial_vessels
        WHERE observed_at >= NOW() - INTERVAL '4 hours'
          AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT 2000
      `);
      results.commercial = com;
    }

    res.json({ ok: true, data: results });
  } catch (err) {
    console.error('❌ /api/wm/map/vessels error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/fires ─ Active fires last 24h ───────
router.get('/map/fires', async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 72);
    const rows = await db.queryAll(`
      SELECT lat, lon, bright_ti4, frp, confidence, satellite, acq_date, acq_time,
             daynight, region
      FROM wm_satellite_fires
      WHERE observed_at >= NOW() - ($1::int * INTERVAL '1 hour')
        AND lat IS NOT NULL AND lon IS NOT NULL
      ORDER BY frp DESC NULLS LAST
      LIMIT 5000
    `, [hours]);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/fires error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──��� GET /api/wm/map/quakes ─ Recent earthquakes ──────────
router.get('/map/quakes', async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours, 10) || 48, 168);
    const rows = await db.queryAll(`
      SELECT usgs_id, magnitude, place, event_time, depth_km,
             lat, lon, alert_level, tsunami, felt, significance, url
      FROM wm_earthquakes
      WHERE event_time >= NOW() - ($1::int * INTERVAL '1 hour')
        AND lat IS NOT NULL AND lon IS NOT NULL
      ORDER BY magnitude DESC
      LIMIT 200
    `, [hours]);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/quakes error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/countries ─ Choropleth data ──────────
// Combines country sentiment, GDELT volume, CII scores
router.get('/map/countries', async (req, res) => {
  try {
    const [sentiment, gdelt, scores, alerts] = await Promise.all([
      db.queryAll(`
        SELECT country_iso2, article_count, positive_pct, neutral_pct,
               negative_pct, avg_score, period_date
        FROM wm_country_sentiment
        WHERE period_date >= CURRENT_DATE - INTERVAL '3 days'
        ORDER BY period_date DESC
      `),
      db.queryAll(`
        SELECT country, date, volume_intensity, avg_tone
        FROM wm_gdelt_geo_timeline
        WHERE date >= CURRENT_DATE - INTERVAL '3 days'
        ORDER BY date DESC
      `),
      db.queryAll(`
        SELECT code, name, score, level, trend, change_24h,
               component_unrest, component_conflict,
               component_security, component_information
        FROM wm_country_scores
        ORDER BY score DESC
      `),
      db.queryAll(`
        SELECT country, alert_date, current_volume, z_score, severity,
               top_title, top_url
        FROM wm_gdelt_volume_alerts
        WHERE alert_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY z_score DESC
      `)
    ]);

    res.json({ ok: true, data: { sentiment, gdelt, scores, alerts } });
  } catch (err) {
    console.error('❌ /api/wm/map/countries error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/events ─ Geopolitical events ────────
router.get('/map/events', async (req, res) => {
  try {
    const rows = await db.queryAll(`
      SELECT e.id, e.event_type, e.actors, e.action, e.location,
             e.location_geo, e.event_date, e.confidence,
             c.headline as cluster_headline, c.article_count
      FROM wm_events e
      LEFT JOIN wm_event_clusters c ON c.id = e.cluster_id
      WHERE e.created_at >= NOW() - INTERVAL '72 hours'
      ORDER BY e.created_at DESC
      LIMIT 200
    `);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/events error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/outages ─ Internet outages ──────���───
router.get('/map/outages', async (req, res) => {
  try {
    const rows = await db.queryAll(`
      SELECT * FROM wm_internet_outages
      WHERE last_seen_at >= NOW() - INTERVAL '48 hours'
      ORDER BY last_seen_at DESC
      LIMIT 50
    `);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/outages error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  STATIC LAYERS — pre-extracted JSON (cached in memory)
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '../../data');
const cache = {};

function loadJson(key) {
  if (!cache[key]) {
    try {
      const file = path.join(dataDir, `map-${key}.json`);
      cache[key] = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn(`⚠️ loadJson(${key}): ${err.message}`);
      return [];
    }
  }
  return cache[key];
}

router.get('/map/bases', (req, res) => {
  const data = loadJson('bases');
  const type = req.query.type;
  const filtered = type ? data.filter(b => b.type === type) : data;
  res.json({ ok: true, count: filtered.length, data: filtered });
});

router.get('/map/pipelines', (req, res) => {
  const data = loadJson('pipelines');
  const type = req.query.type;
  const filtered = type ? data.filter(p => p.type === type) : data;
  res.json({ ok: true, count: filtered.length, data: filtered });
});

router.get('/map/ports', (req, res) => {
  res.json({ ok: true, count: loadJson('ports').length, data: loadJson('ports') });
});

router.get('/map/hotspots', (req, res) => {
  res.json({ ok: true, count: loadJson('hotspots').length, data: loadJson('hotspots') });
});

router.get('/map/nuclear', (req, res) => {
  res.json({ ok: true, count: loadJson('nuclear').length, data: loadJson('nuclear') });
});

router.get('/map/cables', (req, res) => {
  res.json({ ok: true, count: loadJson('cables').length, data: loadJson('cables') });
});

router.get('/map/waterways', (req, res) => {
  res.json({ ok: true, count: loadJson('waterways').length, data: loadJson('waterways') });
});

router.get('/map/economic', (req, res) => {
  res.json({ ok: true, count: loadJson('economic').length, data: loadJson('economic') });
});

router.get('/map/conflicts', (req, res) => {
  res.json({ ok: true, count: loadJson('conflicts').length, data: loadJson('conflicts') });
});

router.get('/map/disasters', async (req, res) => {
  try {
    const rows = await db.queryAll(`
      SELECT id, source, event_id, category, title, description,
             lat, lon, event_date, magnitude, magnitude_unit,
             alert_level, country, source_url, closed
      FROM wm_natural_events
      WHERE closed = false OR last_seen >= NOW() - INTERVAL '72 hours'
      ORDER BY event_date DESC
      LIMIT 200
    `);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/disasters error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/map/geojson', (req, res) => {
  if (!cache.geojson) {
    try {
      cache.geojson = JSON.parse(fs.readFileSync(path.join(dataDir, 'ne_110m_countries.geojson'), 'utf8'));
    } catch (err) {
      console.warn(`⚠️ geojson load failed: ${err.message}`);
      return res.status(500).json({ ok: false, error: 'geojson data unavailable' });
    }
  }
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(cache.geojson);
});

// ═══════════════════════════════════════════════════════════
//  FILTERED NEWS — endpoint unificado para el WorldMap interactivo
//  Soporta multi-topic + multi-level geo en una sola query
// ═══════════════════════════════════════════════════════════

router.get('/news/filtered', async (req, res) => {
  try {
    const level = String(req.query.level || 'world').toLowerCase();
    const value = req.query.value || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168);

    // Parse topics (comma-separated) — if empty, no topic filter
    let topics = null;
    if (req.query.topics) {
      topics = String(req.query.topics).split(',').map(t => t.trim()).filter(Boolean);
      if (!topics.length) topics = null;
    }

    // Build WHERE clauses dynamically
    const conditions = [
      `published_at >= NOW() - ($1::int * INTERVAL '1 hour')`,
    ];
    const params = [hours];
    let paramIdx = 2;

    // Full-text search
    const search = req.query.search ? String(req.query.search).trim().slice(0, 100) : null;
    if (search) {
      conditions.push(`title ILIKE '%' || $${paramIdx} || '%'`);
      params.push(search);
      paramIdx++;
    }

    // Topic filter (EXPANDED: primary_topic OR secondary_topic OR title regex match)
    // Uses single regex with trigram GIN index for fast multi-keyword matching.
    // When topic filter is active, we exclude social media feeds (Bluesky) to
    // prioritize real journalism over short noisy posts. Saves ~4x query time.
    if (topics) {
      const regex = buildTopicRegex(topics);
      conditions.push(`source_name NOT ILIKE '%bluesky%'`);
      if (regex) {
        conditions.push(`(primary_topic = ANY($${paramIdx}::text[]) OR secondary_topic = ANY($${paramIdx}::text[]) OR title ~* $${paramIdx + 1})`);
        params.push(topics);
        params.push(regex);
        paramIdx += 2;
      } else {
        conditions.push(`(primary_topic = ANY($${paramIdx}::text[]) OR secondary_topic = ANY($${paramIdx}::text[]))`);
        params.push(topics);
        paramIdx++;
      }
    }

    // Geo filter based on drill-down level
    // v_news_by_topic has: geo_scope ('country','subregion','continent','global'),
    //   geo_scope_value (ISO2 for country, name for subregion/continent),
    //   subregion, continent
    if (level === 'continent' && value) {
      conditions.push(`continent = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    } else if (level === 'subregion' && value) {
      conditions.push(`(subregion = $${paramIdx} OR continent = $${paramIdx})`);
      params.push(value);
      paramIdx++;
    } else if (level === 'country' && value) {
      const iso = String(value).toUpperCase().slice(0, 2);
      // Expanded country filter via regex (leverages trigram index):
      // 1. Feed-scoped articles (original behavior)
      // 2. OR articles mentioning country name in any major language
      const terms = getCountryTerms(iso);
      if (terms.length > 1) {
        const regex = buildCountryRegex(terms);
        const termParamIdx = paramIdx + 1;
        conditions.push(`((geo_scope = 'country' AND geo_scope_value = $${paramIdx}) OR title ~* $${termParamIdx} OR COALESCE(nlp_summary,'') ~* $${termParamIdx})`);
        params.push(iso);
        params.push(regex);
        paramIdx += 2;
      } else {
        conditions.push(`(geo_scope = 'country' AND geo_scope_value = $${paramIdx})`);
        params.push(iso);
        paramIdx++;
      }
    }
    // level === 'world' → no geo filter

    params.push(limit);
    const limitParam = `$${paramIdx}`;

    const sql = `
      SELECT article_id, title, url, published_at, relevance_score,
             source_name, lang, continent, subregion,
             geo_scope_value AS country_iso,
             primary_topic, sentiment_label, nlp_summary
      FROM v_news_by_topic
      WHERE ${conditions.join(' AND ')}
      ORDER BY relevance_score DESC, published_at DESC
      LIMIT ${limitParam}
    `;

    const rows = await db.queryAll(sql, params);

    res.json({
      ok: true,
      level,
      value: value || 'world',
      topics: topics || 'all',
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('❌ /api/wm/news/filtered error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/activity ─ Article counts per country (last N hours) ──
// Used by the WorldMap Regions tab to show live activity badges
router.get('/news/activity', async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours, 10) || 48, 168);
    const rows = await db.queryAll(`
      SELECT geo_scope_value AS country_iso,
             country_name,
             continent,
             subregion,
             count(*) AS article_count,
             count(*) FILTER (WHERE relevance_score >= 7) AS high_score,
             count(*) FILTER (WHERE sentiment_label = 'negative') AS negative,
             count(*) FILTER (WHERE sentiment_label = 'positive') AS positive,
             round(avg(relevance_score)::numeric, 1) AS avg_score
      FROM v_news_by_topic
      WHERE published_at >= NOW() - ($1::int * INTERVAL '1 hour')
        AND geo_scope = 'country'
        AND geo_scope_value IS NOT NULL
      GROUP BY geo_scope_value, country_name, continent, subregion
      ORDER BY article_count DESC
    `, [hours]);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/news/activity error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/timeline ─ Daily article volume per country (7 days) ──
// Returns sparkline data for hover cards and country detail views
router.get('/news/timeline', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 7, 14);
    const rows = await db.queryAll(`
      SELECT f.geo_scope_value AS country_iso,
             date_trunc('day', a.published_at)::date AS day,
             count(*) AS articles,
             count(*) FILTER (WHERE COALESCE(e.sentiment_label, a.sentiment_label) = 'negative') AS negative
      FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE a.published_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND f.geo_scope = 'country'
        AND f.geo_scope_value IS NOT NULL
      GROUP BY f.geo_scope_value, date_trunc('day', a.published_at)::date
      ORDER BY country_iso, day
    `, [days]);
    // Group by country for easy frontend consumption
    const byCountry = {};
    rows.forEach(r => {
      if (!byCountry[r.country_iso]) byCountry[r.country_iso] = [];
      byCountry[r.country_iso].push({ day: r.day, articles: parseInt(r.articles), negative: parseInt(r.negative) });
    });
    res.json({ ok: true, days, data: byCountry });
  } catch (err) {
    console.error('❌ /api/wm/news/timeline error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/news/pulse ─ Global real-time pulse ────────────────────────
// Returns volume counts at different time windows + top stories per continent
router.get('/news/pulse', async (req, res) => {
  try {
    const [volume, topByCont, spikes] = await Promise.all([
      db.queryOne(`
        SELECT
          count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '1 hour') AS h1,
          count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '6 hours') AS h6,
          count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '24 hours') AS h24,
          count(*) FILTER (WHERE published_at >= NOW() - INTERVAL '48 hours') AS h48
        FROM rss_articles
        WHERE published_at >= NOW() - INTERVAL '48 hours'
      `),
      db.queryAll(`
        SELECT DISTINCT ON (continent)
          continent, title, source_name, relevance_score, published_at
        FROM v_news_by_topic
        WHERE published_at >= NOW() - INTERVAL '6 hours'
          AND continent IS NOT NULL
        ORDER BY continent, relevance_score DESC, published_at DESC
      `),
      db.queryAll(`
        SELECT topic, article_count, prev_count, velocity,
               sample_titles, computed_at
        FROM wm_topic_trends
        WHERE is_spike = true
        ORDER BY velocity DESC
        LIMIT 10
      `)
    ]);
    res.json({ ok: true, volume, top_by_continent: topByCont, topic_spikes: spikes });
  } catch (err) {
    console.error('❌ /api/wm/news/pulse error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/markets/snapshot ─ Key financial data for dashboard ────────
// Returns indices, commodities, crypto, FX, energy, macro in one call
router.get('/markets/snapshot', async (req, res) => {
  try {
    const [indices, commodities, crypto, fx, energy, macro, signals, predictions, topMovers] = await Promise.all([
      db.queryAll(`
        SELECT DISTINCT ON (symbol) symbol, display, price, change_pct, category, market_state
        FROM wm_market_quotes
        WHERE category = 'index' AND symbol IN ('^GSPC','^DJI','^IXIC','^VIX','^FTSE','^N225','^HSI','^STOXX50E')
        ORDER BY symbol, observed_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (symbol) symbol, display, price, change_pct
        FROM wm_market_quotes
        WHERE category = 'commodity'
        ORDER BY symbol, observed_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (symbol) symbol, name, price_usd, change_24h_pct, change_7d_pct, market_cap_usd, btc_dominance_pct
        FROM wm_crypto_quotes
        WHERE symbol IN ('BTC','ETH','XRP','SOL','BNB','ADA','DOGE')
        ORDER BY symbol, observed_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (base, quote) base, quote, rate, change_pct
        FROM wm_fx_rates
        WHERE base = 'USD' AND quote IN ('EUR','GBP','JPY','CNY','NZD','CHF','AUD','CAD','MXN','TRY','ZAR')
        ORDER BY base, quote, fetched_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (display) display, value, unit, change_pct, period
        FROM wm_energy_inventories
        ORDER BY display, fetched_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (display) display, area, value, unit, change_pct
        FROM wm_macro_indicators
        ORDER BY display, fetched_at DESC
        LIMIT 12
      `),
      db.queryAll(`
        SELECT signal_type, title, confidence, magnitude, fired_at
        FROM wm_correlation_signals
        ORDER BY fired_at DESC
        LIMIT 8
      `),
      // Top prediction markets by volume
      db.queryAll(`
        SELECT question, probability, volume, source, category, url
        FROM wm_prediction_markets
        WHERE status = 'open' AND probability BETWEEN 0.05 AND 0.95
        ORDER BY volume DESC NULLS LAST
        LIMIT 12
      `),
      // Top market movers (biggest % changes)
      db.queryAll(`
        WITH latest AS (
          SELECT DISTINCT ON (symbol) symbol, display, price, change_pct, category
          FROM wm_market_quotes
          WHERE change_pct IS NOT NULL
          ORDER BY symbol, observed_at DESC
        )
        SELECT * FROM latest ORDER BY ABS(change_pct) DESC LIMIT 10
      `)
    ]);

    // Build KPIs
    const vix = indices.find(i => i.symbol === '^VIX');
    const spx = indices.find(i => i.symbol === '^GSPC');
    const btc = crypto.find(c => c.symbol === 'BTC');
    const gold = commodities.find(c => (c.display||'').toUpperCase().includes('GOLD') || c.symbol === 'GC=F');
    const oil = commodities.find(c => (c.display||'').toUpperCase().includes('OIL') || c.symbol === 'CL=F');
    const dxy = indices.find(i => (i.display||'').toUpperCase() === 'DXY') || null;
    const kpis = {
      vix: vix ? { value: vix.price, change: vix.change_pct } : null,
      spx: spx ? { value: spx.price, change: spx.change_pct } : null,
      btc: btc ? { value: btc.price_usd, change: btc.change_24h_pct, dominance: btc.btc_dominance_pct } : null,
      gold: gold ? { value: gold.price, change: gold.change_pct } : null,
      oil: oil ? { value: oil.price, change: oil.change_pct } : null,
      dxy: dxy ? { value: dxy.price, change: dxy.change_pct } : null,
    };

    res.json({ ok: true, data: { indices, commodities, crypto, fx, energy, macro, signals, predictions, topMovers, kpis } });
  } catch (err) {
    console.error('❌ /api/wm/markets/snapshot error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/intelligence-brief ─ Synthesized daily brief ────────
router.get('/intelligence-brief', async (req, res) => {
  try {
    const [signalSummary, focalPoints, topClusters, topicSpikes, trendingKw, gdeltAlerts, marketMovers, topPredictions] = await Promise.all([
      db.queryAll(`SELECT ai_context, top_countries, convergence_zones, by_type, observed_at FROM wm_signal_summary ORDER BY created_at DESC LIMIT 1`),
      db.queryAll(`SELECT display_name, urgency, narrative, focal_score, entity_id, news_mentions, correlation_evidence FROM wm_focal_points ORDER BY focal_score DESC LIMIT 6`),
      db.queryAll(`SELECT primary_title, source_count, threat_level, threat_category, last_seen, primary_link FROM wm_clusters WHERE source_count >= 3 ORDER BY last_seen DESC LIMIT 8`),
      db.queryAll(`SELECT topic, velocity, article_count, prev_count FROM wm_topic_trends WHERE is_spike = true ORDER BY velocity DESC LIMIT 5`),
      db.queryAll(`SELECT term, multiplier, mention_count, sample_headlines FROM wm_trending_keywords ORDER BY multiplier DESC NULLS LAST LIMIT 10`),
      db.queryAll(`SELECT country, z_score, severity, top_title, current_volume FROM wm_gdelt_volume_alerts ORDER BY z_score DESC LIMIT 5`),
      db.queryAll(`WITH latest AS (SELECT DISTINCT ON (symbol) symbol, display, price, change_pct, category FROM wm_market_quotes WHERE change_pct IS NOT NULL ORDER BY symbol, observed_at DESC) SELECT * FROM latest ORDER BY ABS(change_pct) DESC LIMIT 5`),
      db.queryAll(`SELECT question, probability, volume, source FROM wm_prediction_markets WHERE status='open' AND probability BETWEEN 0.05 AND 0.95 AND (category @> ARRAY['geopolitics'] OR category @> ARRAY['politics']) ORDER BY volume DESC NULLS LAST LIMIT 5`)
    ]);

    // Build nexus connections: match market movers to news events
    const nexus = [];
    // Keyword groups for nexus matching
    const nexusKeywords = {
      vix: ['fear','volatility','crash','panic','risk','uncertainty','war','conflict','crisis','sanctions','tariff','recession'],
      oil: ['oil','hormuz','iran','opec','strait','blockade','energy','pipeline','crude','saudi','petroleum','refinery','barrel'],
      gold: ['gold','war','conflict','crisis','sanction','nuclear','inflation','safe haven','uncertainty','geopolit'],
      spx: ['stocks','wall street','nasdaq','rally','selloff','fed','interest rate','earnings','recession','gdp','tariff'],
      tech: ['tech','ai','semiconductor','chip','nvidia','apple','google','meta','layoff','regulation'],
    };

    for (const mover of marketMovers) {
      const sym = (mover.display || mover.symbol || '').toLowerCase();
      const chg = parseFloat(mover.change_pct) || 0;

      // Determine which keyword group applies
      let matchKws = [];
      if (sym.includes('vix')) matchKws = nexusKeywords.vix;
      else if (sym.includes('oil') || sym.includes('cl=f') || sym.includes('crude')) matchKws = nexusKeywords.oil;
      else if (sym.includes('gold') || sym.includes('gc=f')) matchKws = nexusKeywords.gold;
      else if (sym.includes('spx') || sym.includes('dow') || sym.includes('nasdaq') || sym.includes('^gspc') || sym.includes('^dji') || sym.includes('^ixic')) matchKws = nexusKeywords.spx;
      else if (mover.category === 'stock') {
        // For individual stocks, match against their specific name
        const stockName = (mover.display || mover.symbol || '').toLowerCase();
        matchKws = [stockName.replace(/[^a-z]/g,'')];
      }

      // Search all top events + focal points for keyword matches
      let relatedClusters = [];
      if (matchKws.length > 0) {
        relatedClusters = topClusters.filter(c => {
          const t = (c.primary_title || '').toLowerCase();
          return matchKws.some(kw => t.includes(kw));
        }).slice(0, 2);
        // Also match threat level for broad market movers
        if (relatedClusters.length === 0 && (sym.includes('vix') || sym.includes('spx'))) {
          relatedClusters = topClusters.filter(c => c.threat_level === 'high' || c.threat_level === 'critical').slice(0, 2);
        }
      }

      if (relatedClusters.length > 0) {
        nexus.push({
          symbol: mover.display || mover.symbol,
          price: mover.price,
          change_pct: mover.change_pct,
          category: mover.category,
          likely_drivers: relatedClusters.map(c => ({
            title: c.primary_title,
            sources: c.source_count,
            link: c.primary_link
          }))
        });
      }
    }

    res.json({
      ok: true,
      data: {
        signal_context: signalSummary[0]?.ai_context || null,
        convergence_zones: signalSummary[0]?.convergence_zones || [],
        top_countries: signalSummary[0]?.top_countries || [],
        focal_points: focalPoints,
        top_events: topClusters,
        topic_spikes: topicSpikes,
        trending: trendingKw,
        gdelt_alerts: gdeltAlerts,
        nexus,
        geo_predictions: topPredictions,
        generated_at: signalSummary[0]?.observed_at || new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ /api/wm/intelligence-brief error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/markets/sparklines ─ Historical mini-charts ────────
router.get('/markets/sparklines', async (req, res) => {
  try {
    // Get 5-day hourly data for all key symbols
    const symbols = ['^GSPC', '^DJI', '^IXIC', '^VIX', 'GC=F', 'CL=F', 'SI=F', 'HG=F', 'NG=F'];
    const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'XRP'];

    const [marketData, cryptoData] = await Promise.all([
      db.queryAll(`
        SELECT symbol, price::float, observed_at
        FROM wm_market_quotes
        WHERE symbol = ANY($1) AND observed_at > NOW() - INTERVAL '5 days'
        ORDER BY symbol, observed_at
      `, [symbols]),
      db.queryAll(`
        SELECT symbol, price_usd::float as price, observed_at
        FROM wm_crypto_quotes
        WHERE symbol = ANY($1) AND observed_at > NOW() - INTERVAL '5 days'
        ORDER BY symbol, observed_at
      `, [cryptoSymbols])
    ]);

    // Group by symbol, downsample to ~50 points per symbol
    const sparklines = {};
    const allData = [...marketData, ...cryptoData];
    const bySymbol = {};
    allData.forEach(d => {
      if (!bySymbol[d.symbol]) bySymbol[d.symbol] = [];
      bySymbol[d.symbol].push({ p: d.price, t: d.observed_at });
    });

    for (const [sym, points] of Object.entries(bySymbol)) {
      const step = Math.max(1, Math.floor(points.length / 50));
      sparklines[sym] = points.filter((_, i) => i % step === 0 || i === points.length - 1)
        .map(p => p.p);
    }

    res.json({ ok: true, data: sparklines });
  } catch (err) {
    console.error('❌ /api/wm/markets/sparklines error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/search ─ Full-text article search with ranking ──
// Uses PostgreSQL ts_vector (language-agnostic "simple" config) + ts_rank
// to score matches by term frequency, proximity and density.
// Query by title OR summary OR auto_summary across all languages.
// Usage: GET /api/wm/search?q=ukraine+drone&limit=30&hours=168
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 200);
    if (q.length < 2) return res.json({ ok: true, count: 0, data: [] });
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const hours = Math.min(parseInt(req.query.hours, 10) || 168, 720);

    // Build tsquery: split on whitespace, join with & for AND
    const tokens = q.split(/\s+/).filter(t => t.length >= 2).map(t => t.replace(/[^\p{L}\p{N}]+/gu, ''));
    if (!tokens.length) return res.json({ ok: true, count: 0, data: [] });
    const tsQuery = tokens.map(t => t + ':*').join(' & ');  // prefix match with AND

    const rows = await db.queryAll(`
      SELECT a.id AS article_id, a.title, a.url, a.published_at, a.relevance_score,
             f.name AS source_name, f.lang, f.geo_scope_value AS country_iso,
             COALESCE(e.summary, a.auto_summary, a.summary) AS nlp_summary,
             COALESCE(e.sentiment_label, a.sentiment_label, 'neutral') AS sentiment_label,
             ts_rank(to_tsvector('simple', coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.auto_summary,'')),
                     to_tsquery('simple', $1)) AS rank
      FROM rss_articles a
      JOIN rss_feeds f ON f.id = a.feed_id
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE to_tsvector('simple', coalesce(a.title,'') || ' ' || coalesce(a.summary,'') || ' ' || coalesce(a.auto_summary,''))
            @@ to_tsquery('simple', $1)
        AND a.published_at >= NOW() - ($3::int * INTERVAL '1 hour')
      ORDER BY rank DESC, a.relevance_score DESC, a.published_at DESC
      LIMIT $2
    `, [tsQuery, limit, hours]);

    res.json({ ok: true, query: q, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/search error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/search/suggest ─ Autocomplete suggestions ──
// Returns top article titles + trending terms matching the prefix.
// Fast: uses trigram index for similarity matching.
router.get('/search/suggest', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 50);
    if (q.length < 2) return res.json({ ok: true, data: [] });

    const [trending, titles] = await Promise.all([
      db.queryAll(`
        SELECT term, mention_count FROM wm_trending_keywords
        WHERE term ILIKE $1 ORDER BY mention_count DESC LIMIT 5
      `, [q + '%']),
      db.queryAll(`
        SELECT title FROM rss_articles
        WHERE title ILIKE $1 AND published_at >= NOW() - INTERVAL '48 hours'
        ORDER BY relevance_score DESC, published_at DESC LIMIT 8
      `, ['%' + q + '%'])
    ]);

    const suggestions = [
      ...trending.map(t => ({ type: 'trending', value: t.term, count: parseInt(t.mention_count) })),
      ...titles.map(t => ({ type: 'title', value: t.title.slice(0, 100) })),
    ];
    res.json({ ok: true, data: suggestions });
  } catch (err) {
    console.error('❌ /api/wm/search/suggest error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/article/:id ─ Full article details for in-place reading ──
// Returns article + enrichment + cluster siblings. Used by the news reader
// in worldmap.html so users don't have to open the source URL to read.
router.get('/article/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const article = await db.queryOne(`
      SELECT a.id, a.title, a.url, a.summary, a.auto_summary, a.published_at,
             a.relevance_score, a.sentiment_label, a.sentiment_score, a.entities,
             a.event_cluster_id,
             f.name AS source_name, f.category AS source_category, f.lang,
             f.geo_scope_value AS country_iso,
             e.summary AS nlp_summary, e.classify_topics, e.enriched_at
      FROM rss_articles a
      LEFT JOIN rss_feeds f ON f.id = a.feed_id
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE a.id = $1
    `, [id]);

    if (!article) return res.status(404).json({ ok: false, error: 'article not found' });

    const text = (article.nlp_summary || article.auto_summary || article.summary || '') + ' ' + (article.title || '');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    article.reading_time_min = Math.max(1, Math.round(wordCount / 200));
    article.word_count = wordCount;

    let cluster = null;
    if (article.event_cluster_id) {
      const siblings = await db.queryAll(`
        SELECT a.id, a.title, a.url, a.published_at, f.name AS source_name
        FROM rss_articles a
        LEFT JOIN rss_feeds f ON f.id = a.feed_id
        WHERE a.event_cluster_id = $1 AND a.id != $2
        ORDER BY a.relevance_score DESC, a.published_at DESC
        LIMIT 5
      `, [article.event_cluster_id, id]);
      cluster = { id: article.event_cluster_id, sibling_count: siblings.length, siblings };
    }

    res.json({ ok: true, data: { article, cluster } });
  } catch (err) {
    console.error('❌ /api/wm/article error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/article/:id/fulltext ─ Scrape + summarize on demand ──
// Uses ultra_extract (trafilatura) to fetch article text, then optionally
// summarizes via ultra_nlp. Persists result to rss_articles_enrichment.summary.
router.get('/article/:id/fulltext', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const row = await db.queryOne(`
      SELECT a.id, a.url, a.title, e.summary AS existing_summary
      FROM rss_articles a
      LEFT JOIN rss_articles_enrichment e ON e.article_id = a.id
      WHERE a.id = $1
    `, [id]);
    if (!row) return res.status(404).json({ ok: false, error: 'article not found' });
    if (!row.url) return res.status(400).json({ ok: false, error: 'no url' });

    // 1. Extract full text via trafilatura sidecar
    let extracted = null;
    try {
      const extractRes = await fetch('http://ultra_extract:8000/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: row.url })
      });
      if (extractRes.ok) extracted = await extractRes.json();
    } catch (e) {
      console.warn('extract failed:', e.message);
    }

    const fullText = extracted?.text || '';
    if (!fullText || fullText.length < 100) {
      return res.json({ ok: true, data: { text: '', summary: row.existing_summary || '', error: 'could not extract article content' } });
    }

    // 2. Summarize via NLP sidecar (~3-5 sentences)
    let summary = '';
    try {
      const sumRes = await fetch('http://ultra_nlp:8000/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText.slice(0, 4000) })
      });
      if (sumRes.ok) {
        const sumJson = await sumRes.json();
        summary = (sumJson.summary || '').trim();
      }
    } catch (e) {
      console.warn('summarize failed:', e.message);
    }

    // 3. Persist summary if generated
    if (summary && summary.length > 30) {
      try {
        await db.queryOne(`
          INSERT INTO rss_articles_enrichment (article_id, summary, enriched_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (article_id) DO UPDATE
          SET summary = COALESCE(rss_articles_enrichment.summary, EXCLUDED.summary),
              enriched_at = EXCLUDED.enriched_at
        `, [id, summary]);
      } catch (e) { console.warn('persist summary:', e.message); }
    }

    // Split text into readable paragraphs
    const cleanText = fullText.replace(/\s+/g, ' ').trim();
    const paragraphs = cleanText.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/g)
      .reduce((acc, sent) => {
        if (!acc.length) return [sent];
        const last = acc[acc.length - 1];
        if (last.length + sent.length < 350) acc[acc.length - 1] = last + ' ' + sent;
        else acc.push(sent);
        return acc;
      }, [])
      .filter(p => p.length > 20)
      .slice(0, 30);

    res.json({
      ok: true,
      data: {
        text: cleanText.slice(0, 15000),
        paragraphs,
        summary,
        title: extracted.title || row.title,
        author: extracted.author,
        published: extracted.date,
        language: extracted.language,
        sitename: extracted.sitename,
        word_count: cleanText.split(/\s+/).length,
      }
    });
  } catch (err) {
    console.error('❌ /api/wm/article/fulltext error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/wm/translate ─ Translate arbitrary text via ultra_nlp ──
router.post('/translate', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const text = String(req.body?.text || '').slice(0, 8000);
    const target = String(req.body?.target || 'en').slice(0, 5);
    if (!text || text.length < 2) return res.status(400).json({ ok: false, error: 'no text' });

    const trRes = await fetch('http://ultra_nlp:8000/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target })
    });
    if (!trRes.ok) return res.status(502).json({ ok: false, error: 'translation service error' });
    const trJson = await trRes.json();
    res.json({ ok: true, data: { translated: trJson.translation || trJson.translated_text || '', target } });
  } catch (err) {
    console.error('❌ /api/wm/translate error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/geo-hierarchy ─ Static geo tree ─────────
router.get('/geo-hierarchy', (req, res) => {
  if (!cache['geo-hierarchy']) {
    try {
      cache['geo-hierarchy'] = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'geo-hierarchy.json'), 'utf8')
      );
    } catch (err) {
      console.warn(`⚠️ geo-hierarchy load failed: ${err.message}`);
      return res.status(500).json({ ok: false, error: 'geo-hierarchy data unavailable' });
    }
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(cache['geo-hierarchy']);
});

module.exports = router;
