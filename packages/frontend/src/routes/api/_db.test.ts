/* eslint-disable no-console */
/**
 * DuckDB Database Test
 *
 * Simple test script for the centralized database module.
 * Run with: npx tsx packages/frontend/src/routes/api/_db.test.ts
 */

import { initDatabase, query, execute, getDatabaseInfo, escapeSQL } from './_db';

async function runTests() {
  console.log('='.repeat(50));
  console.log('  DuckDB Database Tests');
  console.log('='.repeat(50));
  console.log('');

  let passed = 0;
  let failed = 0;

  // Test helper
  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  // Test 1: Database info
  await test('getDatabaseInfo returns valid info', async () => {
    const info = getDatabaseInfo();
    if (!info.path) throw new Error('Missing path');
    if (!info.dir) throw new Error('Missing dir');
    console.log(`  Path: ${info.path}`);
    console.log(`  Dir: ${info.dir}`);
  });

  // Test 2: Initialize database
  await test('initDatabase succeeds', async () => {
    await initDatabase();
    const info = getDatabaseInfo();
    if (!info.initialized) throw new Error('Not initialized');
  });

  // Test 3: Create test table
  await test('CREATE TABLE succeeds', async () => {
    await execute(`
      CREATE TABLE IF NOT EXISTS test_table (
        id VARCHAR PRIMARY KEY,
        name VARCHAR,
        value INTEGER
      )
    `);
  });

  // Test 4: Insert data
  await test('INSERT data succeeds', async () => {
    await execute(`
      INSERT INTO test_table (id, name, value)
      VALUES ('test-1', 'Test One', 100)
      ON CONFLICT (id) DO UPDATE SET name = 'Test One', value = 100
    `);
  });

  // Test 5: Query data
  await test('SELECT data returns results', async () => {
    const results = await query<{ id: string; name: string; value: number }>(
      `SELECT * FROM test_table WHERE id = 'test-1'`
    );
    if (results.length !== 1) throw new Error(`Expected 1 row, got ${results.length}`);
    if (results[0].name !== 'Test One') throw new Error(`Wrong name: ${results[0].name}`);
    if (results[0].value !== 100) throw new Error(`Wrong value: ${results[0].value}`);
  });

  // Test 6: SQL escaping
  await test('escapeSQL handles special characters', async () => {
    const escaped = escapeSQL("O'Reilly");
    if (escaped !== "'O''Reilly'") throw new Error(`Wrong escape: ${escaped}`);

    const nullEscaped = escapeSQL(null);
    if (nullEscaped !== 'NULL') throw new Error(`Null not handled: ${nullEscaped}`);
  });

  // Test 7: Query with escape
  await test('INSERT with escaped string succeeds', async () => {
    const name = escapeSQL("Test O'Brien");
    await execute(`
      INSERT INTO test_table (id, name, value)
      VALUES ('test-2', ${name}, 200)
      ON CONFLICT (id) DO UPDATE SET name = ${name}, value = 200
    `);

    const results = await query<{ name: string }>(
      `SELECT name FROM test_table WHERE id = 'test-2'`
    );
    if (results[0].name !== "Test O'Brien") {
      throw new Error(`Wrong name: ${results[0].name}`);
    }
  });

  // Test 8: Cleanup
  await test('DROP TABLE succeeds', async () => {
    await execute(`DROP TABLE IF EXISTS test_table`);
  });

  // Summary
  console.log('');
  console.log('='.repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
