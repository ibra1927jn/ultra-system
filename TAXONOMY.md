# TAXONOMY.md — Topic + Geographic Classification System

## Overview

Two orthogonal axes classify all feeds and articles:
- **Thematic axis**: 20 fixed topics in `topic_taxonomy`
- **Geographic axis**: 4-level hierarchy in `geo_hierarchy`

Every feed has: `primary_topic`, optional `secondary_topic`, `geo_scope` + `geo_scope_value`.

---

## Topic Taxonomy (20 categories)

| topic_id | Name | Description |
|----------|------|-------------|
| conflict | Conflict & War | Armed conflicts, wars, ceasefires, peace processes |
| geopolitics | Geopolitics & Diplomacy | International relations, alliances, diplomatic crises |
| economy_finance | Economy & Finance | GDP, markets, central banks, inflation, debt |
| trade_sanctions | Trade & Sanctions | Tariffs, embargoes, trade agreements, export controls |
| energy | Energy | Oil, gas, renewables, OPEC, pipelines |
| climate_environment | Climate & Environment | Climate change, emissions, biodiversity, weather extremes |
| health_disease | Health & Disease | Pandemics, WHO, public health, outbreaks |
| cybersecurity | Cybersecurity | Cyberattacks, data breaches, APTs, CVEs |
| maritime | Maritime & Shipping | Shipping lanes, ports, naval activity, piracy |
| migration_refugees | Migration & Refugees | Displacement, asylum, border policy |
| terrorism | Terrorism & Extremism | Terrorist attacks, counter-terrorism, radicalization |
| nuclear_proliferation | Nuclear & Proliferation | Nuclear weapons, IAEA, missile programs |
| food_security | Food Security | Famine, crop failures, food prices |
| disaster_natural | Natural Disasters | Earthquakes, floods, hurricanes, wildfires |
| regulatory_policy | Regulatory & Legal | Legislation, court rulings, regulatory changes |
| technology | Technology & AI | AI policy, semiconductors, tech regulation, space |
| human_rights | Human Rights | Abuses, press freedom, political prisoners |
| elections_governance | Elections & Governance | Elections, coups, constitutional changes, protests |
| crime_organized | Organized Crime | Drug trafficking, money laundering, cartels |
| military_defense | Military & Defense | Military spending, arms deals, exercises, intelligence |

### Classification rules for new feeds

1. **Specialist feeds** (cyber blogs, defense magazines, shipping trackers): assign the obvious topic.
2. **General news feeds** (country newspapers, wire services): assign `geopolitics` — the specific topic comes from NLP classification at the article level (`rss_articles_enrichment.classify_topics`).
3. **secondary_topic**: only assign when the feed has a clear dual focus (e.g. a defense blog that also covers geopolitics).

---

## Geographic Hierarchy (4 levels)

```
Level 1: global
Level 2: Africa | Americas | Asia | Europe | Middle_East | Oceania
Level 3: Subregions (26)
Level 4: Country ISO-2 (204 entries)
```

### Subregions

| Continent | Subregions |
|-----------|------------|
| Africa | West_Africa, East_Africa, Southern_Africa, North_Africa, Central_Africa, Sahel, Horn_of_Africa |
| Americas | South_America, Central_America, Caribbean, North_America |
| Asia | South_Asia, Southeast_Asia, East_Asia, Central_Asia |
| Europe | Western_Europe, Eastern_Europe, Northern_Europe, Southern_Europe, Balkans, Caucasus, Arctic |
| Middle_East | Gulf_States, Levant, Maghreb (+ top-level Middle_East for Turkey/Iran/Yemen) |
| Oceania | Oceania (AU/NZ), Pacific_Islands |

### Feed geo_scope rules

| geo_scope | geo_scope_value | Example |
|-----------|----------------|---------|
| `country` | ISO-2 code (e.g. `PK`) | Dawn (Pakistan), Tagesschau (Germany) |
| `subregion` | subregion name (e.g. `Sahel`) | RNZ Pacific, Sahelien |
| `continent` | continent name (e.g. `Africa`) | RFI Afrique, AllAfrica |
| `global` | `global` | Reuters, BBC World, Hacker News |

### How to assign geo for new feeds

1. If the feed covers a single country → `country` + ISO code.
2. If the feed covers a region (e.g. "Pacific", "Sahel") → `subregion` + name.
3. If the feed covers a continent broadly → `continent` + name.
4. If the feed is global/thematic with no geo focus → `global`.

---

## Database Schema

### Reference tables

```sql
topic_taxonomy (topic_id PK, topic_name, description)
geo_hierarchy  (country_iso PK, country_name, subregion, continent)
```

### Columns on rss_feeds

```sql
primary_topic   VARCHAR(30) FK → topic_taxonomy
secondary_topic VARCHAR(30) FK → topic_taxonomy
geo_scope       VARCHAR(15) CHECK IN ('global','continent','subregion','country')
geo_scope_value VARCHAR(30) -- the actual value matching the scope level
```

### Materialized Views (refreshed every 2h)

| View | Purpose | Key columns |
|------|---------|-------------|
| `v_news_by_topic` | Articles by topic + geo + NLP | 72h window, dedup excluded |
| `v_news_by_region` | Articles by subregion/continent | 72h window |
| `v_news_by_country_topic` | Country x topic cross (power view) | Only country-scoped feeds |
| `v_feed_quality` | Feed health metrics | articles/day, dup%, enrich% |

### REST Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/wm/news/topic/:topic` | Top news by topic globally |
| `GET /api/wm/news/topic/:topic/region/:region` | Topic filtered by region |
| `GET /api/wm/news/region/:region` | Top news by subregion or continent |
| `GET /api/wm/news/country/:iso` | Top news per country (NLP enriched) |
| `GET /api/wm/news/country/:iso/topic/:topic` | Country x topic cross |
| `GET /api/wm/news/summary` | Executive summary: continents + topics + health |

All endpoints accept `?limit=N` (max 100). Country endpoint also accepts `?hours=N` (max 168).

---

## Quality Diagnostics (2026-04-12)

### Coverage
- 1055 active feeds, 914 producing (141 silent in 72h)
- 69,543 unique articles in 72h window (dedup excluded)
- 60 distinct languages

### Dedup
- **Mechanism**: MinHash+LSH (128 hashes, 32 bands, threshold 0.7). Batch daily at 15:30 UTC.
- **Rate**: 6.4% of articles marked as duplicates (4,884/75,829 in 72h)
- **Known issue**: 1,711 false positives from cross-language matching (~35% of marked dups). BBC Arabic/Persian/Russian incorrectly matched to unrelated articles. Root cause: MinHash on short titles in different scripts produces hash collisions.
- **Fix needed**: Add same-language guard to dedup_runner.js before similarity check.

### Enrichment
- NLP enrichment (sentiment, classify, summarize) covers only **1.5% of global** and **0.1% of country** articles.
- Root cause: enrichment triggers on `relevance_score >= 8`, which filters out most country news (avg score < 1).
- Country feeds need a separate enrichment path or lower threshold.

### Feed health
- Average: 23.5 articles/day per feed
- 23 feeds with >50% duplicate rate (mostly BBC/DW/AJ language editions — false positives)
- Top producers: Hankyoreh 438/72h, Al Jazeera Arabic 264/72h, CNN Arabic 206/72h
