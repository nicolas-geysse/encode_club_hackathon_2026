/* eslint-disable no-console */
/**
 * Health Check API Route
 *
 * Debug endpoint to verify server is working and check DuckDB status.
 */

import * as path from 'path';
import * as fs from 'fs';

export async function GET() {
  const status: Record<string, unknown> = {
    ok: true,
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    nodeVersion: process.version,
  };

  // Check data directory
  const dataDir = path.resolve(process.cwd(), 'data');
  status.dataDir = dataDir;
  status.dataDirExists = fs.existsSync(dataDir);

  // Try to import and init DuckDB
  try {
    const { initDatabase, getDatabaseInfo } = await import('./_db');
    await initDatabase();
    status.db = getDatabaseInfo();
    status.dbConnected = true;
  } catch (error) {
    status.dbConnected = false;
    status.dbError = error instanceof Error ? error.message : String(error);
    status.dbStack = error instanceof Error ? error.stack : undefined;
  }

  return new Response(JSON.stringify(status, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
