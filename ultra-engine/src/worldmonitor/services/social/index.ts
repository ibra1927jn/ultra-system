// =============================================================================
// Social Monitoring Service — OSINTmonitor
// Manages sources, assets, messages via localStorage.
// Provides mock data for MVP (no Telegram API required).
// =============================================================================

import type {
  SocialSource,
  SocialAsset,
  AssetKeyword,
  SocialMessage,
  SocialCollectorConfig,
  SocialPanelState,
  CollectorStatusResponse,
  CollectorMessagesResponse,
} from '@/types/social';

import {
  SOCIAL_STORAGE_KEYS,
  DEFAULT_SOCIAL_COLLECTOR_CONFIG,
} from '@/types/social';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// -----------------------------------------------------------------------------
// Sources CRUD
// -----------------------------------------------------------------------------
export function getSources(): SocialSource[] {
  return loadJSON<SocialSource[]>(SOCIAL_STORAGE_KEYS.SOURCES, []);
}

export function saveSource(source: SocialSource): void {
  const sources = getSources();
  const idx = sources.findIndex((s) => s.id === source.id);
  if (idx >= 0) sources[idx] = source;
  else sources.push(source);
  saveJSON(SOCIAL_STORAGE_KEYS.SOURCES, sources);
}

export function deleteSource(id: string): void {
  const sources = getSources().filter((s) => s.id !== id);
  saveJSON(SOCIAL_STORAGE_KEYS.SOURCES, sources);
}

export function createSource(channelId: string, displayName: string, description?: string): SocialSource {
  const source: SocialSource = {
    id: generateId(),
    platform: 'telegram',
    channelId,
    displayName,
    description,
    status: 'active',
    messageCount: 0,
    addedAt: new Date(),
  };
  saveSource(source);
  return source;
}

// -----------------------------------------------------------------------------
// Assets CRUD
// -----------------------------------------------------------------------------
export function getAssets(): SocialAsset[] {
  return loadJSON<SocialAsset[]>(SOCIAL_STORAGE_KEYS.ASSETS, []);
}

export function saveAsset(asset: SocialAsset): void {
  const assets = getAssets();
  const idx = assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) assets[idx] = asset;
  else assets.push(asset);
  saveJSON(SOCIAL_STORAGE_KEYS.ASSETS, assets);
}

export function deleteAsset(id: string): void {
  const assets = getAssets().filter((a) => a.id !== id);
  saveJSON(SOCIAL_STORAGE_KEYS.ASSETS, assets);
}

export function createAsset(
  name: string,
  color: string,
  keywords: Array<{ value: string; exclude: boolean }>,
  matchMode: 'any' | 'all' = 'any',
): SocialAsset {
  const asset: SocialAsset = {
    id: generateId(),
    name,
    color,
    keywords: keywords.map((k) => ({ id: generateId(), ...k })),
    matchMode,
    sourceIds: [],
    enabled: true,
    createdAt: new Date(),
  };
  saveAsset(asset);
  return asset;
}

// -----------------------------------------------------------------------------
// Messages storage
// -----------------------------------------------------------------------------
export function getMessages(): SocialMessage[] {
  return loadJSON<SocialMessage[]>(SOCIAL_STORAGE_KEYS.MESSAGES, []);
}

export function saveMessages(messages: SocialMessage[]): void {
  const config = getConfig();
  const trimmed = messages.slice(0, config.maxMessages);
  saveJSON(SOCIAL_STORAGE_KEYS.MESSAGES, trimmed);
}

export function addMessages(newMsgs: SocialMessage[]): SocialMessage[] {
  const existing = getMessages();
  const existingIds = new Set(existing.map((m) => m.id));
  const unique = newMsgs.filter((m) => !existingIds.has(m.id));
  const merged = [...unique, ...existing];
  merged.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  saveMessages(merged);
  return merged;
}

export function clearMessages(): void {
  saveJSON(SOCIAL_STORAGE_KEYS.MESSAGES, []);
}

// -----------------------------------------------------------------------------
// Keyword matching engine
// -----------------------------------------------------------------------------
export function matchesKeyword(text: string, keyword: AssetKeyword): boolean {
  const lowerText = text.toLowerCase();
  const lowerValue = keyword.value.toLowerCase();
  // Phrase match (exact string)
  return lowerText.includes(lowerValue);
}

export function matchesAsset(text: string, asset: SocialAsset): boolean {
  if (!asset.enabled || asset.keywords.length === 0) return false;

  const includes = asset.keywords.filter((k) => !k.exclude);
  const excludes = asset.keywords.filter((k) => k.exclude);

  // If any exclude keyword matches, reject
  if (excludes.some((k) => matchesKeyword(text, k))) return false;

  // If no include keywords, match all (only excludes defined)
  if (includes.length === 0) return true;

  // Apply match mode
  if (asset.matchMode === 'all') {
    return includes.every((k) => matchesKeyword(text, k));
  }
  return includes.some((k) => matchesKeyword(text, k));
}

export function tagMessageWithAssets(message: SocialMessage): SocialMessage {
  const assets = getAssets();
  const matched = assets
    .filter((a) => {
      if (a.sourceIds.length > 0 && !a.sourceIds.includes(message.sourceId)) return false;
      return matchesAsset(message.text, a);
    })
    .map((a) => a.id);
  return { ...message, matchedAssetIds: matched };
}

// -----------------------------------------------------------------------------
// Collector config
// -----------------------------------------------------------------------------
export function getConfig(): SocialCollectorConfig {
  return loadJSON<SocialCollectorConfig>(
    SOCIAL_STORAGE_KEYS.CONFIG,
    DEFAULT_SOCIAL_COLLECTOR_CONFIG,
  );
}

export function saveConfig(config: SocialCollectorConfig): void {
  saveJSON(SOCIAL_STORAGE_KEYS.CONFIG, config);
}

// -----------------------------------------------------------------------------
// Panel state
// -----------------------------------------------------------------------------
const DEFAULT_PANEL_STATE: SocialPanelState = {
  view: 'feed',
  activeAssetId: null,
  activeSourceId: null,
  searchQuery: '',
  collectorStatus: 'idle',
  lastRefresh: null,
  totalMessages: 0,
};

export function getPanelState(): SocialPanelState {
  return loadJSON<SocialPanelState>(
    SOCIAL_STORAGE_KEYS.PANEL_STATE,
    DEFAULT_PANEL_STATE,
  );
}

export function savePanelState(state: Partial<SocialPanelState>): void {
  const current = getPanelState();
  saveJSON(SOCIAL_STORAGE_KEYS.PANEL_STATE, { ...current, ...state });
}

// -----------------------------------------------------------------------------
// Collector client (polls external collector server)
// -----------------------------------------------------------------------------
export async function fetchCollectorStatus(
  signal?: AbortSignal,
): Promise<CollectorStatusResponse | null> {
  const config = getConfig();
  try {
    const res = await fetch(`${config.collectorUrl}/api/status`, { signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchCollectorMessages(
  since?: string,
  signal?: AbortSignal,
): Promise<CollectorMessagesResponse | null> {
  const config = getConfig();
  try {
    const url = since
      ? `${config.collectorUrl}/api/messages?since=${encodeURIComponent(since)}`
      : `${config.collectorUrl}/api/messages`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Mock data generator (for MVP without Telegram API)
// -----------------------------------------------------------------------------
const MOCK_CHANNELS = [
  { id: 'mock-ch1', channelId: '@ukraine_news', displayName: 'Ukraine News' },
  { id: 'mock-ch2', channelId: '@world_crisis', displayName: 'World Crisis Monitor' },
  { id: 'mock-ch3', channelId: '@cyber_alerts', displayName: 'Cyber Alerts' },
  { id: 'mock-ch4', channelId: '@geopolitics_daily', displayName: 'Geopolitics Daily' },
];

const MOCK_TEXTS = [
  'Breaking: New developments in Eastern Europe as tensions escalate along the border regions.',
  'Cyber attack reported on major infrastructure provider. Multiple services affected.',
  'Diplomatic talks resumed between key stakeholders. Progress described as cautious.',
  'Military exercises announced in the Pacific region by multiple nations.',
  'Energy crisis deepens as pipeline disruption affects supply chains across Europe.',
  'NATO allies discuss collective defense measures in emergency session.',
  'Critical vulnerability discovered in widely-used communication platform.',
  'Humanitarian corridor established for civilian evacuation from conflict zone.',
  'Sanctions package targets financial networks linked to state-sponsored activities.',
  'Intelligence report warns of increased drone activity near strategic installations.',
  'UN Security Council emergency meeting called to address regional instability.',
  'Supply chain disruption impacts semiconductor availability for defense systems.',
];

export function generateMockMessages(count = 10): SocialMessage[] {
  const messages: SocialMessage[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const channel = MOCK_CHANNELS[Math.floor(Math.random() * MOCK_CHANNELS.length)];
    const text = MOCK_TEXTS[Math.floor(Math.random() * MOCK_TEXTS.length)];
        if (!channel || !text) continue;
    const minutesAgo = Math.floor(Math.random() * 120);
    messages.push({
      id: generateId(),
      sourceId: channel.id,
      platform: 'telegram',
      channelName: channel.displayName,
      text,
      postedAt: new Date(now - minutesAgo * 60 * 1000),
      collectedAt: new Date(),
      url: `https://t.me/${channel.channelId.replace('@', '')}`,
      matchedAssetIds: [],
    });
  }
  // Tag with assets
  return messages.map(tagMessageWithAssets);
}

export function initMockSources(): void {
  const existing = getSources();
  if (existing.length > 0) return;
  for (const ch of MOCK_CHANNELS) {
    saveSource({
      id: ch.id,
      platform: 'telegram',
      channelId: ch.channelId,
      displayName: ch.displayName,
      status: 'active',
      messageCount: 0,
      addedAt: new Date(),
    });
  }
}

// -----------------------------------------------------------------------------
// Filtered messages helper
// -----------------------------------------------------------------------------
export function getFilteredMessages(
  assetId?: string | null,
  sourceId?: string | null,
  searchQuery?: string,
): SocialMessage[] {
  let messages = getMessages();

  if (assetId) {
    messages = messages.filter((m) => m.matchedAssetIds.includes(assetId));
  }
  if (sourceId) {
    messages = messages.filter((m) => m.sourceId === sourceId);
  }
  if (searchQuery && searchQuery.trim().length > 0) {
    const q = searchQuery.toLowerCase();
    messages = messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        m.channelName.toLowerCase().includes(q),
    );
  }
  return messages;
}
