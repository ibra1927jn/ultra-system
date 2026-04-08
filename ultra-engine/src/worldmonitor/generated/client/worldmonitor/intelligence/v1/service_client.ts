// WM Phase 1 stub — intelligence domain
import { makeStubServiceClient, ApiError } from '../../../_stub_helpers';

export const IntelligenceServiceClient = makeStubServiceClient('Intelligence');
export { ApiError };

// Types — declared as `any` until Phase 2 brings real proto-generated types
export type ClassifyEventResponse = any;
export type GetRiskScoresResponse = any;
export type CiiScore = any;
export type StrategicRisk = any;
export type GdeltArticle = any;
export type SearchGdeltDocumentsResponse = any;
export type GetPizzintStatusResponse = any;
export type PizzintStatus = any;
export type PizzintLocation = any;
export type GdeltTensionPair = any;
