/**
 * Services Index
 *
 * Exports all Stride services.
 */

// Opik tracing
export {
  trace,
  createSpan,
  initOpik,
  logFeedback,
  getTraceUrl,
  getCurrentTraceId,
  getCurrentTraceHandle,
  getCurrentThreadId,
  setThreadId,
  generateThreadId,
  opik,
} from './opik.js';
export type {
  Span,
  TokenUsage,
  TraceOptions,
  SpanType,
  SpanOptions,
  TraceContext,
} from './opik.js';

// Unified LLM (provider-agnostic via OpenAI SDK)
export {
  initLLM,
  chat,
  chatWithJsonMode,
  analyzeBudget,
  generateAdvice,
  llm,
  detectProvider,
  getModel,
  getProvider,
  safeParseJson,
} from './llm.js';
export type { ChatMessage } from './llm.js';

// Speech-to-Text (provider-agnostic)
export { transcribeAudio, transcribeAndAnalyze, initSTT } from './whisper.js';
export type { TranscriptionResult } from './whisper.js';

// Backward compatibility aliases
export { initLLM as initGroq } from './llm.js';
export { chat as llmChat, chatWithJsonMode as llmChatWithJsonMode } from './llm.js';

// Gemini LLM (alternative provider)
export { initGemini, gemini } from './gemini.js';
export { chat as geminiChat, chatWithJsonMode as geminiChatWithJsonMode } from './gemini.js';

// LLM Provider abstraction
export type { LLMOptions, LLMProvider } from './llm-provider.js';

// Prompts
export {
  getPrompt,
  getPromptWithVars,
  getMaxTokens,
  getEvaluationCriteria,
  loadPrompts,
} from './prompts.js';

// DuckDB
export {
  initDatabase,
  query,
  execute,
  queryWrite,
  closeDatabase,
  getSimulatedDate,
  getSimulationState,
  escapeSQL,
  getDatabaseInfo,
  database,
  DATABASE_PATH,
  DATABASE_DIR,
} from './duckdb.js';

// Vector Store (RAG)
export {
  initVectorStore,
  embedProfile,
  findSimilarProfiles,
  storeAdvice,
  findSimilarAdvice,
  embedGoal,
  findSimilarGoals,
  updateAdviceOutcome,
  closeVectorStore,
  getVectorStoreInfo,
  vectorstore,
} from './vectorstore.js';

// Embeddings
export {
  generateEmbedding,
  generateEmbeddings,
  embedStudentProfile,
  isModelLoaded,
  getModelInfo,
  embeddings,
} from './embeddings.js';

// RAG (from tools)
export {
  getRAGContext,
  formatRAGContextForPrompt,
  indexStudentProfile,
  indexAdvice,
  indexGoal,
} from '../tools/rag.js';
export type { RAGContext, RAGQueryParams } from '../tools/rag.js';

// Local Discovery
export {
  discoverLocalOpportunities,
  getRegionalResources,
  adjustSavingsGoal,
  localDiscovery,
  PROFILE_TO_PLACES,
  REGIONAL_RESOURCES,
  FALLBACK_SUGGESTIONS,
} from './local-discovery.js';
export type {
  Location,
  LocalJob,
  LocalPlace,
  LocalDiscoveryResult,
  DiscoveryContext,
} from './local-discovery.js';

// Google Maps
export {
  initGoogleMaps,
  isGoogleMapsAvailable,
  findNearbyPlaces,
  textSearchPlaces,
  getDistanceMatrix,
  calculateDistance,
  formatDistance,
  formatDuration,
  googleMaps,
} from './google-maps.js';
export type { Coordinates, Place, DistanceResult, PlaceType, TravelMode } from './google-maps.js';

// Tab Context Service
export { loadTabContext, mergeContext } from './tab-context.js';

// Tip Cache Service
export {
  tipCache,
  getCachedTip,
  setCachedTip,
  hasCachedTip,
  clearCache,
  hashContext,
  getCacheKey,
  getPredictedTabs,
  getTabsToPreFetch,
  getWarmupTabs,
  getCacheMetrics,
  resetCacheMetrics,
  logCacheMetrics,
} from './tip-cache.js';
export type {} from './tip-cache.js';

// Logger
export { createLogger } from './logger.js';
