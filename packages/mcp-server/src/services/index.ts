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

// Groq LLM
export { initGroq, chat, analyzeBudget, generateAdvice, transcribeAudio, groq } from './groq.js';
export type { TranscriptionResult } from './groq.js';

// Gemini LLM
export { initGemini, gemini } from './gemini.js';
export { chat as geminiChat, chatWithJsonMode as geminiChatWithJsonMode } from './gemini.js';

// LLM Provider abstraction
export type { ChatMessage, LLMOptions, LLMProvider } from './llm-provider.js';

// LLM Provider switching

/**
 * Get the configured LLM provider
 * Set LLM_PROVIDER environment variable to 'groq' or 'gemini'
 */
export function getLLMProvider(): import('./llm-provider.js').LLMProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { groq } = require('./groq.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gemini } = require('./gemini.js');

  switch (process.env.LLM_PROVIDER || 'groq') {
    case 'gemini':
      return gemini;
    case 'groq':
    default:
      return groq;
  }
}

/**
 * Initialize the configured LLM provider
 */
export async function initLLM(): Promise<void> {
  const provider = getLLMProvider();
  await provider.init();
  console.error(`[LLM] Using provider: ${provider.providerName}`);
}

/**
 * Chat with the configured LLM provider
 */
export async function llmChat(
  messages: import('./llm-provider.js').ChatMessage[],
  options?: import('./llm-provider.js').LLMOptions
): Promise<string> {
  const provider = getLLMProvider();
  return provider.chat(messages, options);
}

/**
 * Chat with JSON mode using the configured LLM provider
 */
export async function llmChatWithJsonMode<T>(
  messages: import('./llm-provider.js').ChatMessage[],
  options?: import('./llm-provider.js').LLMOptions
): Promise<T> {
  const provider = getLLMProvider();
  return provider.chatWithJsonMode<T>(messages, options);
}

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
