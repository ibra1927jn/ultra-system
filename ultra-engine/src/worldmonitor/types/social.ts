// =============================================================================
// Social Monitoring Types — OSINTmonitor
// Modular types for Telegram (and future social) channel monitoring.
// =============================================================================

/** Platform identifier — extensible for future sources */
export type SocialPlatform = 'telegram' | 'rss';

/** Status of a social source connection */
export type SocialSourceStatus = 'active' | 'paused' | 'error' | 'pending';

/** Matching logic for keywords within an asset */
export type KeywordMatchMode = 'any' | 'all';

// -----------------------------------------------------------------------------
// Social Source (e.g. a Telegram channel)
// -----------------------------------------------------------------------------
export interface SocialSource {
  id: string;
  platform: SocialPlatform;
  /** Channel identifier: @username or t.me/channelname */
  channelId: string;
  /** Human-readable display name */
  displayName: string;
  /** Optional description / notes */
  description?: string;
  status: SocialSourceStatus;
  /** Last time the collector fetched messages from this source */
  lastFetched?: Date;
  /** Number of messages collected total */
  messageCount: number;
  /** When this source was added */
  addedAt: Date;
}

// -----------------------------------------------------------------------------
// Asset / Keyword group
// User-defined "watch" items with OR/NOT logic and phrase support.
// -----------------------------------------------------------------------------
export interface AssetKeyword {
  id: string;
  /** The keyword or phrase (quoted phrases = exact match) */
  value: string;
  /** Whether this keyword is a NOT exclusion */
  exclude: boolean;
}

export interface SocialAsset {
  id: string;
  /** Human-readable label, e.g. "Ukraine Conflict" */
  name: string;
  /** Color for UI badges (hex) */
  color: string;
  /** Keywords with OR logic (any match) or ALL logic */
  keywords: AssetKeyword[];
  matchMode: KeywordMatchMode;
  /** Which sources to monitor (empty = all) */
  sourceIds: string[];
  /** Is this asset currently active? */
  enabled: boolean;
  createdAt: Date;
}

// -----------------------------------------------------------------------------
// Social Message — a single message collected from a source
// -----------------------------------------------------------------------------
export interface SocialMessage {
  id: string;
  sourceId: string;
  platform: SocialPlatform;
  /** Channel name for display */
  channelName: string;
  /** Raw text content */
  text: string;
  /** When the message was posted on the platform */
  postedAt: Date;
  /** When the collector ingested this message */
  collectedAt: Date;
  /** URL to original message (if available) */
  url?: string;
  /** Message author (if available) */
  author?: string;
  /** View count (Telegram channels show this) */
  views?: number;
  /** IDs of matching assets (computed at ingest time) */
  matchedAssetIds: string[];
}

// -----------------------------------------------------------------------------
// Social Panel state
// -----------------------------------------------------------------------------
export type SocialPanelView = 'feed' | 'sources' | 'assets';

export interface SocialPanelState {
  /** Active sub-view inside the panel */
  view: SocialPanelView;
  /** Currently selected asset filter (null = show all) */
  activeAssetId: string | null;
  /** Currently selected source filter (null = show all) */
  activeSourceId: string | null;
  /** Search text within messages */
  searchQuery: string;
  /** Is the collector running? */
  collectorStatus: 'idle' | 'running' | 'error';
  /** Last refresh timestamp */
  lastRefresh: Date | null;
  /** Total messages loaded */
  totalMessages: number;
}

// -----------------------------------------------------------------------------
// Collector configuration (persisted in localStorage)
// -----------------------------------------------------------------------------
export interface SocialCollectorConfig {
  /** Collector server URL (e.g. http://localhost:3001) */
  collectorUrl: string;
  /** Polling interval in seconds */
  refreshInterval: number;
  /** Maximum messages to keep in memory */
  maxMessages: number;
  /** Auto-start collector on page load */
  autoStart: boolean;
}

export const DEFAULT_SOCIAL_COLLECTOR_CONFIG: SocialCollectorConfig = {
  collectorUrl: 'http://localhost:3001',
  refreshInterval: 60,
  maxMessages: 500,
  autoStart: false,
};

// -----------------------------------------------------------------------------
// Collector API response types
// -----------------------------------------------------------------------------
export interface CollectorStatusResponse {
  status: 'ok' | 'error';
  channelCount: number;
  messageCount: number;
  lastPoll: string | null;
  uptime: number;
}

export interface CollectorMessagesResponse {
  messages: SocialMessage[];
  total: number;
  hasMore: boolean;
}

// -----------------------------------------------------------------------------
// localStorage keys
// -----------------------------------------------------------------------------
export const SOCIAL_STORAGE_KEYS = {
  SOURCES: 'osint-social-sources',
  ASSETS: 'osint-social-assets',
  MESSAGES: 'osint-social-messages',
  CONFIG: 'osint-social-config',
  PANEL_STATE: 'osint-social-panel-state',
} as const;
