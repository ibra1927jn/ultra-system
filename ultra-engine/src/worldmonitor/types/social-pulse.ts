// Social Pulse Types
export type SentimentLabel = 'negative' | 'neutral' | 'positive';
export type EmotionLabel = 'anger' | 'fear' | 'joy' | 'sadness' | 'surprise' | 'disgust' | 'neutral';
export type SignalSeverity = 'low' | 'med' | 'high';
export type SocialSignalType = 'volume_spike' | 'sentiment_shift';
export type PulseTimeframe = '1h' | '6h' | '24h' | '7d';
export type PulseBucket = '5m' | '15m' | '60m';

export interface PulseBucketData {
  timestamp: string;
  pulseValue: number;
  volume: number;
  negShare: number;
  emotionTop: EmotionLabel;
  avgPolarity: number;
}

export interface SocialSignal {
  id: string;
  type: SocialSignalType;
  severity: SignalSeverity;
  assetId: string;
  assetName: string;
  message: string;
  triggerValue: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
}

export interface PulseTimeseriesResponse {
  assetId: string;
  assetName: string;
  timeframe: PulseTimeframe;
  bucket: PulseBucket;
  buckets: PulseBucketData[];
  summary: {
    totalVolume: number;
    avgPulse: number;
    maxZScore: number;
    negShareAvg: number;
    dominantEmotion: EmotionLabel;
  };
  lastUpdate: string;
}

export interface SocialPulseState {
  selectedAssetId: string | null;
  timeframe: PulseTimeframe;
  bucket: PulseBucket;
  lastUpdate: string | null;
}

export const DEFAULT_PULSE_STATE: SocialPulseState = {
  selectedAssetId: null,
  timeframe: '24h',
  bucket: '15m',
  lastUpdate: null,
};

export const SOCIAL_PULSE_STORAGE_KEYS = {
  STATE: 'osint-social-pulse-state',
  SIGNALS: 'osint-social-pulse-signals',
  CACHE: 'osint-social-pulse-cache',
} as const;
