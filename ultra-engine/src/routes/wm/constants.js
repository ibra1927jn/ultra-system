// ╔══════════════════════════════════════════════════════════╗
// ║  WorldMonitor — shared constants & regex helpers         ║
// ║  COUNTRY_ALIASES (multilingual country name map)         ║
// ║  TOPIC_KEYWORDS (multilingual topic keyword map)         ║
// ║  Regex builders with word-boundary escaping              ║
// ╚══════════════════════════════════════════════════════════╝

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

module.exports = {
  COUNTRY_ALIASES,
  TOPIC_KEYWORDS,
  getCountryTerms,
  buildTopicRegex,
  buildCountryRegex,
};
