import { execute, query, escapeSQL, escapeJSON } from '../../routes/api/_db';

export interface Memory {
  id: string;
  profileId: string;
  role: 'user' | 'assistant';
  content: string;
  embedding: number[];
  timestamp?: string;
  metadata?: Record<string, any>;
}

export class VectorStore {
  // V2 table to match Qwen3 1024 dimension
  // Reverting from V3 (Gemma) back to V2
  private static tableName = 'conversation_memories_v2';

  /**
   * Ensure the memories table exists
   */
  static async ensureTable(dimension: number = 1024): Promise<void> {
    // Create table with vector column support
    // VSS requires fixed size arrays (e.g. FLOAT[1024]) for indexing
    const sql = `
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                id UUID PRIMARY KEY,
                profile_id TEXT,
                role TEXT,
                content TEXT,
                embedding FLOAT[${dimension}], 
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata JSON
            );
        `;

    await execute(sql);
  }

  /**
   * Store a memory
   */
  static async upsertMemory(memory: Memory): Promise<void> {
    // Warning: ensureTable should be called at app startup with correct dimension
    // Here we assume table exists or created with default

    const { id, profileId, role, content, embedding, metadata } = memory;

    const sql = `
            INSERT INTO ${this.tableName} (id, profile_id, role, content, embedding, metadata)
            VALUES (
                ${escapeSQL(id)},
                ${escapeSQL(profileId)},
                ${escapeSQL(role)},
                ${escapeSQL(content)},
                [${embedding.join(',')}],
                ${escapeJSON(metadata || {})}
            )
            ON CONFLICT (id) DO UPDATE SET
                content = EXCLUDED.content,
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata;
        `;

    await execute(sql);
  }

  /**
   * Search similar memories
   */
  static async searchMemories(
    profileId: string,
    queryEmbedding: number[],
    limit: number = 5,
    dimension: number = 1024
  ): Promise<(Memory & { similarity: number })[]> {
    // Use array_cosine_similarity from VSS extension
    // Cast the query vector to FLOAT[N] to match the column type
    const sql = `
            SELECT 
                id, 
                profile_id as "profileId", 
                role, 
                content, 
                metadata,
                timestamp,
                array_cosine_similarity(embedding, [${queryEmbedding.join(',')}]::FLOAT[${dimension}]) as similarity
            FROM ${this.tableName}
            WHERE profile_id = ${escapeSQL(profileId)}
            ORDER BY similarity DESC
            LIMIT ${limit};
        `;

    const results = await query<any>(sql);

    return results.map((r) => ({
      ...r,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    }));
  }
}
