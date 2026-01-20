/**
 * DuckDB MCP Tools Integration
 *
 * Integrates @seed-ship/duckdb-mcp-native tools into the Stride MCP server.
 * Provides SQL query capabilities, table management, and data import/export.
 *
 * Tools available:
 * - query_duckdb: Execute SQL queries
 * - list_tables: List tables in a schema
 * - describe_table: Get table structure
 * - load_csv: Import CSV files
 * - load_parquet: Import Parquet files
 * - export_data: Export query results
 *
 * @see https://github.com/theseedship/duckdb_mcp_node
 */

import {
  nativeToolHandlers,
  nativeToolDefinitions,
  createDuckDBService,
  type DuckDBService,
} from '@seed-ship/duckdb-mcp-native';
import { trace } from '../services/opik.js';

/**
 * Configuration for DuckDB MCP tools
 */
export interface DuckDBMCPConfig {
  /** Enable DuckPGQ graph extension (if available) */
  enableDuckPGQ?: boolean;
  /** Memory limit for DuckDB (e.g., '4GB') */
  memory?: string;
  /** Number of threads for DuckDB */
  threads?: number;
}

// Singleton DuckDB service instance
let duckdbService: DuckDBService | null = null;
let isInitialized = false;

/**
 * Initialize the DuckDB service
 * Note: @seed-ship/duckdb-mcp-native uses in-memory DuckDB by default
 */
export async function initDuckDBService(config?: DuckDBMCPConfig): Promise<DuckDBService> {
  if (duckdbService && isInitialized) {
    return duckdbService;
  }

  // Create DuckDB service with config
  duckdbService = createDuckDBService({
    memory: config?.memory || '2GB',
    threads: config?.threads || 4,
  });

  // Initialize the service
  await duckdbService.initialize();

  // Optionally load DuckPGQ extension
  if (config?.enableDuckPGQ) {
    try {
      await duckdbService.executeQuery('INSTALL duckpgq; LOAD duckpgq;');
    } catch {
      // DuckPGQ not available, gracefully degrade
      console.warn('[DuckDB MCP] DuckPGQ extension not available, skipping');
    }
  }

  isInitialized = true;
  return duckdbService;
}

/**
 * Get the DuckDB service instance
 */
export function getDuckDBService(): DuckDBService | null {
  return duckdbService;
}

/**
 * Tool definitions for MCP registration
 * Maps native tool definitions to our MCP format
 */
export const DUCKDB_MCP_TOOLS = Object.fromEntries(
  nativeToolDefinitions.map((tool) => [
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
  ])
);

/**
 * Handle DuckDB MCP tool calls
 *
 * @param name - Tool name (e.g., 'query_duckdb')
 * @param args - Tool arguments
 * @returns Tool execution result
 */
export async function handleDuckDBMCPTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return trace(`duckdb.${name}`, async (span) => {
    // Initialize service if needed
    const service = await initDuckDBService();

    // Get the handler
    const handler = nativeToolHandlers[name as keyof typeof nativeToolHandlers];
    if (!handler) {
      throw new Error(`Unknown DuckDB MCP tool: ${name}`);
    }

    // Create execution context
    const context = {
      duckdb: service,
    };

    // Execute the tool
    const result = await handler(args, context);

    // Add tracing attributes
    span.setAttributes({
      'tool.name': name,
      'tool.success': (result as { success?: boolean }).success ?? true,
    });

    // Return MCP-UI compatible result for certain tools
    return formatDuckDBResult(name, result);
  });
}

/**
 * Format DuckDB results as MCP-UI resources when appropriate
 */
function formatDuckDBResult(toolName: string, result: unknown): unknown {
  const typedResult = result as {
    success?: boolean;
    error?: string;
    data?: unknown[];
    tables?: unknown[];
    columns?: unknown[];
    rowCount?: number;
    table?: string;
    schema?: string;
  };

  // Error case - return as text
  if (!typedResult.success && typedResult.error) {
    return {
      type: 'text',
      params: {
        content: `Error: ${typedResult.error}`,
        markdown: false,
      },
    };
  }

  switch (toolName) {
    case 'query_duckdb':
      // Return as table if we have data
      if (typedResult.data && Array.isArray(typedResult.data) && typedResult.data.length > 0) {
        const firstRow = typedResult.data[0] as Record<string, unknown>;
        const columns = Object.keys(firstRow).map((key) => ({
          key,
          label: key,
        }));

        return {
          type: 'table',
          params: {
            title: `Query Results (${typedResult.rowCount} rows)`,
            columns,
            rows: typedResult.data,
          },
          metadata: {
            rowCount: typedResult.rowCount,
            source: 'duckdb',
          },
        };
      }
      return result;

    case 'list_tables':
      // Return as table of tables
      if (typedResult.tables && Array.isArray(typedResult.tables)) {
        return {
          type: 'table',
          params: {
            title: `Tables in ${typedResult.schema || 'main'}`,
            columns: [
              { key: 'name', label: 'Table Name' },
              { key: 'type', label: 'Type' },
            ],
            rows: typedResult.tables,
          },
          metadata: {
            schema: typedResult.schema,
            source: 'duckdb',
          },
        };
      }
      return result;

    case 'describe_table':
      // Return as table of columns
      if (typedResult.columns && Array.isArray(typedResult.columns)) {
        return {
          type: 'table',
          params: {
            title: `Structure of ${typedResult.table}`,
            columns: [
              { key: 'name', label: 'Column' },
              { key: 'type', label: 'Type' },
              { key: 'nullable', label: 'Nullable' },
            ],
            rows: typedResult.columns,
          },
          metadata: {
            table: typedResult.table,
            schema: typedResult.schema,
            source: 'duckdb',
          },
        };
      }
      return result;

    default:
      return result;
  }
}

/**
 * Close the DuckDB service connection
 */
export async function closeDuckDBService(): Promise<void> {
  if (duckdbService) {
    await duckdbService.close();
    duckdbService = null;
    isInitialized = false;
  }
}

// Export for external use
export const duckdbMcp = {
  init: initDuckDBService,
  getService: getDuckDBService,
  close: closeDuckDBService,
  tools: DUCKDB_MCP_TOOLS,
  handleTool: handleDuckDBMCPTool,
};

export default duckdbMcp;
