# Technology Stack

**Analysis Date:** 2026-01-31

## Languages

**Primary:**
- TypeScript 5.7.3 - All source code (frontend and backend)
- JavaScript (ESM) - Build outputs and configuration

**Secondary:**
- Bash - Scripts (postbuild, testing)

## Runtime

**Environment:**
- Node.js 20.x (specified in Dockerfile, .nvmrc indicates v20)

**Package Manager:**
- pnpm 10.x (specified in Dockerfile and package.json scripts)
- Lockfile: pnpm-lock.yaml (present)

## Frameworks

**Frontend UI:**
- SolidStart 1.1.0 - SSR meta-framework for SolidJS
- SolidJS 1.9.11 - Reactive frontend framework
- Vinxi 0.5.11 - Build system for SolidStart

**Backend/Server:**
- Mastra 1.0.4 - Agent orchestration framework
- @modelcontextprotocol/sdk 1.25.3 - MCP server implementation (stdio transport)

**Styling:**
- TailwindCSS 4.1.18 - Utility-first CSS framework
- @tailwindcss/postcss 4.1.18 - PostCSS plugin for TailwindCSS
- PostCSS 8.5.1 - CSS transformation pipeline

**LLM Integration:**
- @ai-sdk/groq 3.0.15 - Groq provider adapter
- @ai-sdk/provider 3.0.5 - AI SDK base provider interface
- @ai-sdk/provider-utils 4.0.9 - Provider utilities
- Groq SDK 0.37.0 - Native Groq API client
- @google/generative-ai 0.24.1 - Google Gemini API client (optional)

**Testing:**
- Vitest 4.0.18 - Unit/component test runner (both packages)
- Happy DOM 20.3.7 - Lightweight DOM implementation for testing

**Build/Dev:**
- tsx 4.21.0 - TypeScript executor for scripts
- tsc - TypeScript compiler (from typescript package)
- sharp 0.34.5 - Image processing (frontend postbuild)

## Key Dependencies

**Critical:**
- duckdb 1.4.1 (frontend), 1.0.0 (native module) - Single-file SQL database for offline data
- opik 1.9.98 - Observability/tracing client for Opik (LLM call monitoring)
- groq-sdk 0.37.0 - Primary LLM provider (Llama 3.1 70B)

**Infrastructure:**
- @seed-ship/mcp-ui-solid 2.1.1 - MCP UI components for SolidJS
- @seed-ship/duckdb-mcp-native 0.11.2 - DuckDB MCP server implementation
- @ark-ui/solid 5.30.0 - Headless UI primitives
- @kobalte/core 0.13.11 - Unstyled accessible components

**Utilities:**
- dayjs 1.11.19 - Date/time formatting and manipulation
- dinero.js 1.9.1 - Decimal-safe money calculations
- uuid 13.0.0 - UUID generation (both packages)
- compromise 14.14.5 - Natural language processing (NLP for intent detection)
- @xenova/transformers 2.17.2 - ONNX-based ML models (embeddings, transformers)
- clsx 2.1.1 - Conditional className utility
- tailwind-merge 3.4.0 - TailwindCSS class conflict resolver
- lucide-solid 0.562.0 - Icon library for SolidJS
- canvas-confetti 1.9.4 - Celebration/confetti animation library
- solid-chartjs 1.3.11 - Chart.js bindings for SolidJS
- chart.js 4.5.1 - Charting library
- solid-motionone 1.0.4 - Animation library for SolidJS
- zod 4.3.6 - Schema validation and TypeScript inference
- zod-from-json-schema 0.5.2 - Convert JSON Schema to Zod schemas
- js-yaml 4.1.0 - YAML parser for configuration
- @solidjs/router 0.15.3 - SPA routing for SolidJS

**Development:**
- ESLint 9.39.2 with @typescript-eslint plugins - Code linting
- Prettier 3.8.1 - Code formatter
- Husky 9.1.0 - Git hooks (pre-commit linting)
- lint-staged 16.2.7 - Run linters on staged files

## Configuration

**Environment:**
- `.env` - Runtime configuration (API keys, feature flags, database path)
- `.env.example` - Template for required environment variables
- Read from process.env at runtime (lazy loading to avoid race conditions with SSR)

**Key configs required:**
- `GROQ_API_KEY` - Groq LLM API authentication
- `OPIK_API_KEY` + `OPIK_WORKSPACE` - Optional but recommended for observability
- `DUCKDB_PATH` - Database file location (default: `./data/stride.duckdb`)
- `GOOGLE_MAPS_API_KEY` - Optional, for Prospection tab (Places + Distance Matrix APIs)
- `GEMINI_API_KEY` - Optional, for Google Gemini fallback LLM
- `SERP_API_KEY` - Optional, for job market research

**Build:**
- `packages/frontend/app.config.ts` - SolidStart build config (Vite SSR, external modules)
- `packages/frontend/tsconfig.json` - Frontend TypeScript config (target: ESNext, jsx: preserve)
- `packages/mcp-server/tsconfig.json` - Backend TypeScript config (target: ES2022, declaration: true)
- `.prettierrc` - Prettier formatting rules (semi: true, singleQuote: true, printWidth: 100)
- `.lintstagedrc.json` - Lint-staged configuration for pre-commit hooks
- `pnpm-workspace.yaml` - Monorepo workspace configuration

## Platform Requirements

**Development:**
- Node.js >= 18 (engines in package.json)
- pnpm 10+
- Python 3, make, g++ - For building DuckDB native module (Dockerfile installs)
- For DuckDB native compilation: C++ build tools required

**Production:**
- Node.js 20 (Debian Slim base in Docker)
- DuckDB database file persisted to `/app/data/stride.duckdb`
- Port 3000 exposed (Dockerfile)
- Environment variables for GROQ_API_KEY and optional OPIK credentials

## Native Module Handling

**DuckDB (Native):**
- Single-file SQL database with native C++ bindings
- Frontend uses v1.4.1, SSR requires special handling via `createRequire` in `src/lib/nativeModule.ts`
- Backend uses v1.0.0 for compatibility
- External to Vite bundling: configured in `app.config.ts`
- Requires compilation on install: `pnpm install --ignore-scripts=false`

**Sharp (Native):**
- Image processing library, used in frontend postbuild script
- External to pnpm onlyBuiltDependencies list

---

*Stack analysis: 2026-01-31*
