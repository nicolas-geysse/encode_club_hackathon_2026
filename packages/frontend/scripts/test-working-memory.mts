
import { WorkingMemory } from '../src/lib/mastra/workingMemory';
import { initDatabase, closeDatabase } from '../src/routes/api/_db';

async function test() {
    console.log('Initializing DB...');
    // Use :memory: or real DB file
    await initDatabase();

    const profileId = 'user-test-memory-' + Date.now();
    console.log(`Testing profile: ${profileId}`);

    // 1. Ensure empty
    const initial = await WorkingMemory.get(profileId);
    console.log('Initial memory:', initial);
    if (initial.length !== 0) throw new Error('Should be empty');

    // 2. Update
    const facts1 = ['User likes jazz', 'User lives in Paris'];
    console.log('Updating with:', facts1);
    await WorkingMemory.update(profileId, facts1);

    // 3. Verify
    const verify1 = await WorkingMemory.get(profileId);
    console.log('Verified memory:', verify1);
    if (verify1.length !== 2) throw new Error('Should have 2 facts');

    // 4. Update again (merge)
    const facts2 = ['User likes jazz', 'User plays piano']; // 'jazz' is duplicate
    console.log('Updating with:', facts2);
    await WorkingMemory.update(profileId, facts2);

    // 5. Verify merge
    const verify2 = await WorkingMemory.get(profileId);
    console.log('Final memory:', verify2);

    const expected = ['User likes jazz', 'User lives in Paris', 'User plays piano'];
    // Order might allow set usage, let's check content equality
    const missing = expected.filter(e => !verify2.includes(e));
    if (missing.length > 0) throw new Error(`Missing facts: ${missing.join(', ')}`);
    if (verify2.length !== 3) throw new Error(`Expected 3 facts, got ${verify2.length}`);

    console.log('SUCCESS: Working Memory logic verified!');
    await closeDatabase();
}

test().catch(e => {
    console.error(e);
    process.exit(1);
});
