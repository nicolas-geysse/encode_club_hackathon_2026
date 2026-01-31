
import { execute, initDatabase, closeDatabase } from '../src/routes/api/_db';
import { loadNativeModule } from '../src/lib/nativeModule'; // Required for init

async function reset() {
    try {
        console.log('Initializing DB...');
        await initDatabase();

        console.log('Dropping table conversation_memories...');
        await execute('DROP TABLE IF EXISTS conversation_memories');

        console.log('Done!');
        await closeDatabase();
        process.exit(0);
    } catch (e) {
        console.error('Failed:', e);
        process.exit(1);
    }
}
reset();
