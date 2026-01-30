import { execute, query, escapeSQL, escapeJSON } from '../../routes/api/_db';

export interface WorkingMemoryItem {
  fact: string;
  timestamp: string;
}

export class WorkingMemory {
  private static tableName = 'agent_working_memory';

  /**
   * Ensure the working memory table exists
   */
  static async ensureTable(): Promise<void> {
    await execute(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                profile_id TEXT PRIMARY KEY,
                memory JSON,
                updated_at TIMESTAMP
            )
        `);
  }

  /**
   * Get the current working memory for a profile
   * Returns a list of facts (strings)
   */
  static async get(profileId: string): Promise<string[]> {
    await this.ensureTable();

    const result = await query(`
            SELECT memory 
            FROM ${this.tableName} 
            WHERE profile_id = ${escapeSQL(profileId)}
        `);

    if (result.length === 0 || !result[0].memory) {
      return [];
    }

    try {
      // DuckDB JSON can be returned as string or already parsed object
      // The stored structure is { facts: ["fact1", "fact2"] }
      const memory = result[0].memory;
      let parsed: { facts?: string[] };
      if (typeof memory === 'string') {
        parsed = JSON.parse(memory);
      } else {
        parsed = memory as { facts?: string[] };
      }
      return Array.isArray(parsed.facts) ? parsed.facts : [];
    } catch (e) {
      console.error('[WorkingMemory] Failed to parse memory:', e);
      return [];
    }
  }

  /**
   * Update working memory with new facts
   * Appends new facts to existing ones
   */
  static async update(profileId: string, newFacts: string[]): Promise<void> {
    if (!newFacts || newFacts.length === 0) return;

    await this.ensureTable();

    // 1. Get existing
    const existingFacts = await this.get(profileId);

    // 2. Merge (simple dedupe by string match)
    const mergedFacts = [...new Set([...existingFacts, ...newFacts])];

    // 3. Save
    const memoryJson = JSON.stringify({ facts: mergedFacts });
    const now = new Date().toISOString();

    // Upsert
    await execute(`
            INSERT INTO ${this.tableName} (profile_id, memory, updated_at)
            VALUES (${escapeSQL(profileId)}, ${escapeJSON(memoryJson)}, ${escapeSQL(now)})
            ON CONFLICT (profile_id) DO UPDATE SET
                memory = excluded.memory,
                updated_at = excluded.updated_at
        `);
  }

  /**
   * Clear memory (mostly for testing/reset)
   */
  static async clear(profileId: string): Promise<void> {
    await execute(`DELETE FROM ${this.tableName} WHERE profile_id = ${escapeSQL(profileId)}`);
  }
}
