
// No change needed in file if I use env var
// Just strict checking
import { VectorStore } from '../src/lib/mastra/vector';
import { initDatabase, closeDatabase } from '../src/routes/api/_db';
import { generateEmbedding } from '../src/lib/mastra/embeddings';

async function main() {
    try {
        console.log('Initializing DB...');
        await initDatabase();
        console.log('DB Initialized');

        console.log('Ensuring table (1024d)...');
        // Ensure table matches m2v 1024 dimension
        await VectorStore.ensureTable(1024);
        console.log('Table ensured');

        const text = 'I love coding and hackathons';
        console.log(`Generating embedding for: "${text}"...`);
        const embedding = await generateEmbedding(text);
        console.log(`Generated embedding (dim: ${embedding.length})`);

        if (embedding.length === 0) {
            console.error('Failed to generate embedding (service might be down or model missing)');
            process.exit(1);
        }

        if (embedding.length !== 1024) {
            console.error(`Dimension mismatch! Expected 1024, got ${embedding.length}`);
            // If we get 768, it means it fell back to mock or wrong model
        }

        console.log('Upserting memory...');
        await VectorStore.upsertMemory({
            id: '00000000-0000-0000-0000-000000000002',
            profileId: 'user-test-real',
            role: 'user',
            content: text,
            embedding: embedding,
            metadata: { source: 'integration-test' }
        });
        console.log('Memory inserted');

        console.log('Searching memories...');
        const searchEmbedding = await generateEmbedding('programming competition');
        const results = await VectorStore.searchMemories('user-test-real', searchEmbedding, 5, 1024);
        console.log('Search results:', results.map(r => ({ content: r.content, similarity: r.similarity })));

        if (results.length > 0 && results[0].similarity > 0.4) {
            console.log('SUCCESS: Vector Store & Embedding Service Verified!');
        } else {
            console.log('WARNING: Search results weak or empty');
        }
    } catch (e) {
        console.error('Test Failed:', e);
    } finally {
        await closeDatabase();
        process.exit(0);
    }
}

main();
