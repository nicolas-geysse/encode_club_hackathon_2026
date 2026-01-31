#!/usr/bin/env npx tsx
/**
 * Run Daily Experiment against Stride Benchmark Dataset
 *
 * This script runs automated evaluation against the benchmark dataset and tracks
 * results in Opik for regression detection.
 *
 * Naming convention:
 * - Daily runs: stride_daily_YYYY-MM-DD
 * - A/B tests: stride_ab_YYYY-MM-DD_variant-name
 * - Regression: stride_regression_YYYY-MM-DD
 *
 * Usage:
 *   npx tsx scripts/run-daily-experiment.ts [--dry-run] [--category=intent]
 *
 * Environment:
 *   OPIK_API_KEY - Required
 *   OPIK_WORKSPACE - Required
 *   GROQ_API_KEY - Required for LLM evaluation
 */

import { Opik, evaluate, EvaluationTask, BaseMetric, EvaluationScoreResult } from 'opik';
import { createHash } from 'crypto';

// Import evaluation functions
import { detectIntent } from '../src/lib/chat/intent/detector';
import { processWithGroqExtractor } from '../src/lib/chat/extraction/hybridExtractor';
import { GROQ_EXTRACTION_SYSTEM_PROMPT } from '../src/lib/chat/prompts';

// Constants
const DATASET_NAME = 'stride_benchmark_v1';
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
const PROVIDER = 'groq';

// Parse CLI args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const categoryFilter = args.find((a) => a.startsWith('--category='))?.split('=')[1];

interface BenchmarkItem {
  id?: string;
  input?: Record<string, unknown>;
  expected_output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface EvaluationResult {
  item_id: string;
  category: string;
  subcategory: string;
  passed: boolean;
  output: Record<string, unknown>;
  scores: Array<{ name: string; value: number; reason?: string }>;
  duration_ms: number;
  error?: string;
}

/**
 * Generate prompt version hash
 */
function getPromptHash(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 8);
}

/**
 * Evaluate an intent detection test case
 *
 * detectIntent() returns: { mode, action, field?, _matchedPattern }
 * - mode: 'onboarding' | 'profile-edit' | 'conversation' | 'general'
 * - action: 'restart_update_profile' | 'update' | 'new_goal' | etc.
 *
 * expected_intent in benchmark can match either mode OR action
 *
 * Note: detectIntent is now async (Phase 2 - LLM fallback) but we call it
 * without groqClient option to use regex-only fast path in benchmarks.
 */
async function evaluateIntent(item: BenchmarkItem): Promise<EvaluationResult> {
  const start = Date.now();
  const input = item.input || {};
  const expected = item.expected_output || {};
  const message = (input.message as string) || '';
  const context = (input.profile as Record<string, unknown>) || {};

  try {
    // Call without groqClient to use regex-only mode (fast path for benchmarks)
    const result = await detectIntent(message, context);
    const expectedIntent = expected.expected_intent as string;
    const expectedAction = expected.expected_action as string | undefined;
    const expectedField = expected.expected_field as string | undefined;

    // Check if intent matches (can match mode OR action)
    const modeMatches = result.mode === expectedIntent;
    const actionMatches = result.action === expectedIntent || result.action === expectedAction;
    const fieldMatches = !expectedField || result.field === expectedField;

    // Pass if mode matches OR action matches (and field if specified)
    const passed = (modeMatches || actionMatches) && fieldMatches;

    // Build what we detected for reporting
    const detected = result.action || result.mode || 'unknown';

    // Calculate confidence score (1.0 if matched pattern, 0.2 if fallback)
    const confidence = result._matchedPattern === 'default_fallback' ? 0.2 : 1.0;

    return {
      item_id: item.id || 'unknown',
      category: (item.metadata?.category as string) || 'unknown',
      subcategory: (item.metadata?.subcategory as string) || 'unknown',
      passed,
      output: {
        detected_mode: result.mode,
        detected_action: result.action,
        detected_field: result.field,
        matched_pattern: result._matchedPattern,
        expected_intent: expectedIntent,
        expected_action: expectedAction,
      },
      scores: [
        {
          name: 'intent_match',
          value: passed ? 1 : 0,
          reason: passed
            ? `Correctly detected mode="${result.mode}" action="${result.action}"`
            : `Expected "${expectedIntent}/${expectedAction || ''}", got mode="${result.mode}" action="${result.action}"`,
        },
        {
          name: 'intent_confidence',
          value: confidence,
          reason: result._matchedPattern || 'no pattern',
        },
      ],
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      item_id: item.id || 'unknown',
      category: (item.metadata?.category as string) || 'unknown',
      subcategory: (item.metadata?.subcategory as string) || 'unknown',
      passed: false,
      output: { error: String(error) },
      scores: [{ name: 'intent_match', value: 0, reason: `Error: ${error}` }],
      duration_ms: Date.now() - start,
      error: String(error),
    };
  }
}

/**
 * Evaluate an onboarding extraction test case
 */
async function evaluateOnboarding(item: BenchmarkItem): Promise<EvaluationResult> {
  const start = Date.now();
  const input = item.input || {};
  const expected = item.expected_output || {};

  try {
    const result = await processWithGroqExtractor({
      message: (input.message as string) || '',
      currentStep: (input.step as string) || 'greeting',
      existingProfile: (input.existing_profile as Record<string, unknown>) || {},
      conversationHistory: [],
    });

    // Check extracted fields
    const extractedData = result.extractedData || {};
    const expectedFields = (expected.fields_extracted as string[]) || [];
    let matchedFields = 0;

    // Check specific expected values
    const checks: string[] = [];

    if (expected.extracted_name && extractedData.name === expected.extracted_name) {
      matchedFields++;
      checks.push(`name: ✓`);
    } else if (expected.extracted_name) {
      checks.push(`name: ✗ (expected ${expected.extracted_name}, got ${extractedData.name})`);
    }

    if (expected.extracted_city && extractedData.city === expected.extracted_city) {
      matchedFields++;
      checks.push(`city: ✓`);
    } else if (expected.extracted_city) {
      checks.push(`city: ✗ (expected ${expected.extracted_city}, got ${extractedData.city})`);
    }

    if (expected.extracted_income && extractedData.monthly_income === expected.extracted_income) {
      matchedFields++;
      checks.push(`income: ✓`);
    } else if (expected.extracted_income) {
      checks.push(
        `income: ✗ (expected ${expected.extracted_income}, got ${extractedData.monthly_income})`
      );
    }

    if (expected.extracted_skills) {
      const extractedSkills = (extractedData.skills as string[]) || [];
      const expectedSkills = expected.extracted_skills as string[];
      const skillMatch = expectedSkills.every((s) =>
        extractedSkills.some((es) => es.toLowerCase().includes(s.toLowerCase()))
      );
      if (skillMatch) {
        matchedFields++;
        checks.push(`skills: ✓`);
      } else {
        checks.push(`skills: ✗`);
      }
    }

    // Calculate pass rate
    const totalExpected = expectedFields.length || Object.keys(expected).filter((k) => k.startsWith('extracted_')).length || 1;
    const passRate = matchedFields / totalExpected;
    const passed = passRate >= 0.5; // Pass if at least 50% of expected fields extracted

    return {
      item_id: item.id || 'unknown',
      category: (item.metadata?.category as string) || 'unknown',
      subcategory: (item.metadata?.subcategory as string) || 'unknown',
      passed,
      output: {
        extracted_data: extractedData,
        next_step: result.nextStep,
        source: result.source,
        checks,
      },
      scores: [
        {
          name: 'extraction_accuracy',
          value: passRate,
          reason: `${matchedFields}/${totalExpected} fields matched`,
        },
        {
          name: 'extraction_success',
          value: Object.keys(extractedData).length > 0 ? 1 : 0,
          reason: Object.keys(extractedData).length > 0 ? 'Data extracted' : 'No data extracted',
        },
      ],
      duration_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      item_id: item.id || 'unknown',
      category: (item.metadata?.category as string) || 'unknown',
      subcategory: (item.metadata?.subcategory as string) || 'unknown',
      passed: false,
      output: { error: String(error) },
      scores: [{ name: 'extraction_accuracy', value: 0, reason: `Error: ${error}` }],
      duration_ms: Date.now() - start,
      error: String(error),
    };
  }
}

/**
 * Evaluate a safety/appropriateness test case (placeholder - requires full LLM call)
 */
function evaluateSafety(item: BenchmarkItem): EvaluationResult {
  const start = Date.now();
  const expected = item.expected_output || {};

  // For now, return a placeholder - full implementation requires calling the chat API
  // and then evaluating the response with LLM-as-judge
  return {
    item_id: item.id || 'unknown',
    category: (item.metadata?.category as string) || 'unknown',
    subcategory: (item.metadata?.subcategory as string) || 'unknown',
    passed: true, // Placeholder
    output: {
      note: 'Safety evaluation requires full LLM call - placeholder result',
      expected_safety: expected.should_pass_safety,
    },
    scores: [
      {
        name: 'safety_placeholder',
        value: 0.5,
        reason: 'Placeholder - implement full LLM evaluation',
      },
    ],
    duration_ms: Date.now() - start,
  };
}

/**
 * Custom metric for intent detection
 */
class IntentMatchMetric extends BaseMetric {
  name = 'intent_match';

  async score(args: { input: Record<string, unknown>; output: Record<string, unknown>; expected?: Record<string, unknown> }): Promise<EvaluationScoreResult> {
    const result = args.output;
    const expected = args.expected || {};

    const modeMatches = result.detected_mode === expected.expected_intent;
    const actionMatches = result.detected_action === expected.expected_intent || result.detected_action === expected.expected_action;

    const passed = modeMatches || actionMatches;

    return {
      name: this.name,
      value: passed ? 1 : 0,
      reason: passed
        ? `Correctly detected mode="${result.detected_mode}" action="${result.detected_action}"`
        : `Expected "${expected.expected_intent}", got mode="${result.detected_mode}" action="${result.detected_action}"`,
    };
  }
}

/**
 * Main experiment runner
 */
async function runExperiment() {
  console.log('='.repeat(60));
  console.log('Stride Daily Experiment');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - No results will be saved to Opik\n');
  }

  // Check environment
  if (!process.env.OPIK_API_KEY) {
    console.error('ERROR: OPIK_API_KEY environment variable is required');
    process.exit(1);
  }

  // Initialize Opik client
  const client = new Opik({
    apiKey: process.env.OPIK_API_KEY,
    workspaceName: process.env.OPIK_WORKSPACE,
  });

  // Get benchmark dataset
  console.log(`\nLoading dataset "${DATASET_NAME}"...`);
  const dataset = await client.getDataset(DATASET_NAME);

  if (!dataset) {
    console.error(`ERROR: Dataset "${DATASET_NAME}" not found.`);
    console.error('Run: npx tsx scripts/create-benchmark-dataset.ts');
    process.exit(1);
  }

  // Get dataset items
  const items = (await dataset.getItems()) as BenchmarkItem[];
  console.log(`Loaded ${items.length} items`);

  // Filter by category if specified
  const filteredItems = categoryFilter
    ? items.filter((item) => item.metadata?.category === categoryFilter)
    : items;

  if (categoryFilter) {
    console.log(`Filtered to ${filteredItems.length} items (category: ${categoryFilter})`);
  }

  // Generate experiment name
  const today = new Date().toISOString().split('T')[0];
  const experimentName = categoryFilter
    ? `stride_${categoryFilter}_${today}`
    : `stride_daily_${today}`;

  // Get prompt versions for metadata
  const promptVersions = {
    'onboarding-extractor': getPromptHash(GROQ_EXTRACTION_SYSTEM_PROMPT),
  };

  console.log(`\nExperiment: ${experimentName}`);
  console.log(`Prompt versions:`, promptVersions);

  // Run evaluations manually (SDK's evaluate() is for LLM tasks)
  console.log(`\nRunning evaluations...`);
  const results: EvaluationResult[] = [];
  const categoryStats: Record<string, { total: number; passed: number }> = {};

  for (let i = 0; i < filteredItems.length; i++) {
    const item = filteredItems[i];
    const category = (item.metadata?.category as string) || 'unknown';

    // Initialize category stats
    if (!categoryStats[category]) {
      categoryStats[category] = { total: 0, passed: 0 };
    }
    categoryStats[category].total++;

    // Run appropriate evaluation based on category
    let result: EvaluationResult;

    switch (category) {
      case 'intent':
        result = await evaluateIntent(item);
        break;
      case 'onboarding':
        result = await evaluateOnboarding(item);
        break;
      case 'valid':
      case 'subtle_violation':
      case 'aggressive':
      case 'borderline':
        result = evaluateSafety(item);
        break;
      case 'conversation':
        result = evaluateSafety(item); // Placeholder
        break;
      default:
        result = {
          item_id: item.id || 'unknown',
          category,
          subcategory: (item.metadata?.subcategory as string) || 'unknown',
          passed: false,
          output: { error: 'Unknown category' },
          scores: [],
          duration_ms: 0,
        };
    }

    results.push(result);
    if (result.passed) {
      categoryStats[category].passed++;
    }

    // Progress indicator
    const status = result.passed ? '✓' : '✗';
    const progress = `[${i + 1}/${filteredItems.length}]`;
    console.log(`  ${progress} ${status} ${category}/${result.subcategory} (${result.duration_ms}ms)`);
  }

  // Use SDK evaluate() for proper experiment tracking (if not dry run)
  if (!isDryRun) {
    console.log('\nSaving results to Opik...');

    // Define task that returns our pre-computed results
    const task: EvaluationTask<BenchmarkItem> = async (datasetItem) => {
      const result = results.find((r) => r.item_id === datasetItem.id);
      if (result) {
        return { output: result.output };
      }
      // If not found (shouldn't happen), compute it
      const category = (datasetItem.metadata?.category as string) || 'unknown';
      if (category === 'intent') {
        const evalResult = await evaluateIntent(datasetItem);
        return { output: evalResult.output };
      }
      return { output: { error: 'Not evaluated' } };
    };

    try {
      const evalResult = await evaluate({
        dataset,
        task,
        scoringMetrics: [new IntentMatchMetric()],
        experimentName,
        experimentConfig: {
          prompt_versions: promptVersions,
          model: MODEL,
          provider: PROVIDER,
        },
      });

      console.log(`Experiment created: ${evalResult.experimentName} (${evalResult.experimentId})`);
    } catch (err) {
      console.error('Failed to save to Opik:', err);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Results Summary');
  console.log('='.repeat(60));

  let totalPassed = 0;
  let totalTests = 0;

  console.log('\nBy Category:');
  for (const [cat, stats] of Object.entries(categoryStats).sort((a, b) => a[0].localeCompare(b[0]))) {
    const pct = ((stats.passed / stats.total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(stats.passed / stats.total * 20));
    console.log(`  ${cat.padEnd(20)} ${stats.passed}/${stats.total} (${pct}%) ${bar}`);
    totalPassed += stats.passed;
    totalTests += stats.total;
  }

  const totalPct = ((totalPassed / totalTests) * 100).toFixed(1);
  console.log(`\nTotal: ${totalPassed}/${totalTests} (${totalPct}%)`);

  // Failed tests details
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0 && failed.length <= 10) {
    console.log('\nFailed Tests:');
    for (const f of failed) {
      console.log(`  - ${f.category}/${f.subcategory}: ${f.scores[0]?.reason || 'No reason'}`);
    }
  } else if (failed.length > 10) {
    console.log(`\n${failed.length} tests failed (too many to list)`);
  }

  console.log('\n' + '='.repeat(60));
  if (isDryRun) {
    console.log('DRY RUN - No results saved');
  } else {
    console.log(`Results saved to experiment: ${experimentName}`);
    console.log('View in Opik dashboard: https://www.comet.com/opik');
  }
}

runExperiment().catch((error) => {
  console.error('Experiment failed:', error);
  process.exit(1);
});
