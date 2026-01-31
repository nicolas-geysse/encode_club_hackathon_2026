
const duckdb = require('duckdb');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../../data/stride.duckdb');
console.log(`Open DB: ${dbPath}`);

// Attempt READ_ONLY check
// Note: duckdb.OPEN_READONLY is 1
try {
    const db = new duckdb.Database(dbPath, 1, (err) => {
        if (err) {
            console.error('Failed to open DB:', err.message);
            process.exit(1);
        }
        console.log('DB Opened (Read Only)');

        db.all('SELECT count(*) as count FROM conversation_memories_v2', (err, res) => {
            if (err) {
                console.error('Query Failed:', err.message);
                process.exit(1);
            }
            console.log('Vector Count:', res[0].count);

            db.all('SELECT content, timestamp, id FROM conversation_memories_v2 ORDER BY timestamp DESC LIMIT 3', (err, rows) => {
                if (err) {
                    console.error('Query Failed:', err.message);
                } else {
                    console.log('Recent Memories:', rows);
                }
                process.exit(0);
            });
        });
    });
} catch (e) {
    console.error('Exception:', e);
}
