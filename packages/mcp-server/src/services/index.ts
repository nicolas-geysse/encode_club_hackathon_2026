/**
 * Services Index
 *
 * Exports all Stride services.
 */

// Opik tracing
export { trace, initOpik, logFeedback, getTraceUrl, getCurrentTraceId, opik } from './opik.js';
export type { Span } from './opik.js';

// Groq LLM
export { initGroq, chat, analyzeBudget, generateAdvice, transcribeAudio, groq } from './groq.js';
export type { ChatMessage, TranscriptionResult } from './groq.js';

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
