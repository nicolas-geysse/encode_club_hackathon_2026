
import { Database } from 'duckdb-async';
import * as path from 'path';

async function check() {
    try {
        const dbPath = path.resolve(process.cwd(), '../data/stride.duckdb');
        console.log(`Opening DB at ${dbPath} in READ_ONLY mode...`);

        // specific flag for read only might need duckdb-async support or raw lib
        // Attempting standard open - if locked, it will throw
        const db = await Database.create(dbPath, { access_mode: 'READ_ONLY' });

        const count = await db.all('SELECT count(*) as c FROM conversation_memories_v2');
        console.log('Vector Count:', count[0].c);

        const last = await db.all('SELECT content, timestamp FROM conversation_memories_v2 ORDER BY timestamp DESC LIMIT 1');
        if (last.length > 0) {
            console.log('Last Memory:', last[0]);
        }

        process.exit(0);
    } catch (e) {
        console.error('Check failed (likely locked by running app):', e.message);
        process.exit(1);
    }
}
check();
