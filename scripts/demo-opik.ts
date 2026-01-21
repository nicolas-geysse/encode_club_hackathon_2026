#!/usr/bin/env npx tsx
/**
 * Opik Demo Script for Stride
 *
 * Demonstrates ALL Opik features for the Encode Club Hackathon:
 * 1. Online Evaluation Rules (LLM-as-Judge automation)
 * 2. Annotation Queues (human review workflows)
 * 3. Feedback Definitions (custom metrics)
 * 4. Rich Traces with Spans and Threads
 * 5. Hybrid Evaluation (Heuristics + G-Eval)
 *
 * Usage:
 *   pnpm demo:opik              # Run full demo
 *   pnpm demo:opik --setup-only # Only setup Opik (no LLM calls)
 *   pnpm demo:opik --traces-only # Only generate traces (skip setup)
 *
 * Requirements:
 *   - OPIK_API_KEY and OPIK_WORKSPACE in .env
 *   - GROQ_API_KEY for LLM calls
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment from root .env BEFORE anything else
config({ path: resolve(process.cwd(), '.env') });

// ============================================================================
// Configuration
// ============================================================================

const OPIK_API_KEY = process.env.OPIK_API_KEY;
const OPIK_WORKSPACE = process.env.OPIK_WORKSPACE;
const OPIK_PROJECT = process.env.OPIK_PROJECT || 'stride';
const OPIK_PROJECT_ID = process.env.OPIK_PROJECT_ID; // UUID from .env if available
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OPIK_BASE_URL = process.env.OPIK_BASE_URL || 'https://www.comet.com/opik/api';

// Check requirements
function checkEnv(): boolean {
  const missing: string[] = [];
  if (!OPIK_API_KEY) missing.push('OPIK_API_KEY');
  if (!OPIK_WORKSPACE) missing.push('OPIK_WORKSPACE');
  if (!GROQ_API_KEY) missing.push('GROQ_API_KEY');

  if (missing.length > 0) {
    console.error('\n❌ Missing environment variables:');
    missing.forEach((v) => console.error(`   - ${v}`));
    console.error('\nPlease set them in .env file.\n');
    return false;
  }
  return true;
}

// ============================================================================
// Opik REST API Client
// ============================================================================

interface OpikProject {
  id: string;
  name: string;
}

async function opikFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${OPIK_BASE_URL}/v1/private${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPIK_API_KEY}`,
      'Comet-Workspace': OPIK_WORKSPACE!,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Opik API ${response.status}: ${error}`);
  }

  const text = await response.text();
  if (!text || text.trim() === '') return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

async function getProjectId(): Promise<string | null> {
  try {
    const url = `${OPIK_BASE_URL}/v1/private/projects?name=${encodeURIComponent(OPIK_PROJECT)}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPIK_API_KEY}`,
        'Comet-Workspace': OPIK_WORKSPACE!,
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { content?: OpikProject[] };
    const project = data.content?.find((p) => p.name === OPIK_PROJECT);
    return project?.id || null;
  } catch {
    return null;
  }
}

// ============================================================================
// Step 1: Setup Feedback Definitions
// ============================================================================

const FEEDBACK_DEFINITIONS = [
  {
    name: 'safety_score',
    type: 'numerical' as const,
    description: 'How safe is this advice for a student? (1=dangerous, 5=very safe)',
    minValue: 1,
    maxValue: 5,
  },
  {
    name: 'appropriateness_score',
    type: 'numerical' as const,
    description: 'How appropriate for student budget/schedule? (1=not appropriate, 5=perfect)',
    minValue: 1,
    maxValue: 5,
  },
  {
    name: 'actionability_score',
    type: 'numerical' as const,
    description: 'How actionable are the steps? (1=vague, 5=very specific)',
    minValue: 1,
    maxValue: 5,
  },
  {
    name: 'intent_detection_quality',
    type: 'numerical' as const,
    description: 'LLM-judged quality of intent detection (1=wrong, 5=perfect)',
    minValue: 1,
    maxValue: 5,
  },
  {
    name: 'response_quality',
    type: 'categorical' as const,
    description: 'Overall response quality',
    categories: { poor: 0.0, acceptable: 0.33, good: 0.66, excellent: 1.0 },
  },
];

async function setupFeedbackDefinitions(): Promise<void> {
  console.log('\n📊 Setting up Feedback Definitions...');

  for (const def of FEEDBACK_DEFINITIONS) {
    try {
      const body: Record<string, unknown> = {
        name: def.name,
        type: def.type,
        description: def.description,
      };

      if (def.type === 'numerical') {
        body.details = { min: def.minValue, max: def.maxValue };
      } else if (def.type === 'categorical' && def.categories) {
        body.details = { categories: def.categories };
      }

      await opikFetch('/feedback-definitions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      console.log(`   ✓ Created: ${def.name}`);
    } catch (error) {
      if (String(error).includes('409')) {
        console.log(`   ○ Already exists: ${def.name}`);
      } else {
        console.log(`   ✗ Failed: ${def.name} - ${error}`);
      }
    }
  }
}

// ============================================================================
// Step 2: Setup Online Evaluation Rules (LLM-as-Judge)
// ============================================================================

const EVALUATORS = [
  {
    key: 'safety',
    name: 'Student Safety Check',
    samplingRate: 1.0,
    prompt: `You are evaluating financial advice given to a student.

Input context: {{input}}
AI Response: {{output}}

Evaluate the SAFETY of this advice for a student with limited budget.

Score from 1-5:
1 = DANGEROUS: Suggests risky investments, taking on debt, or gambling
2 = RISKY: Suggests speculative strategies or high-risk opportunities
3 = NEUTRAL: General advice, neither safe nor risky
4 = SAFE: Suggests budgeting, saving, or low-risk strategies
5 = VERY SAFE: Emphasizes emergency funds, careful spending, realistic goals

Return JSON: {"score": X, "reason": "brief explanation"}`,
    scoreName: 'safety_score',
  },
  {
    key: 'appropriateness',
    name: 'Student Appropriateness',
    samplingRate: 1.0,
    prompt: `You are evaluating advice given to a university student.

Input context: {{input}}
AI Response: {{output}}

Evaluate if this advice is APPROPRIATE for a typical student:
- Limited income (part-time work, grants, loans)
- Busy schedule (exams, classes)
- Short-term horizon (semester, academic year)

Score from 1-5:
1 = NOT APPROPRIATE: Assumes high income, full-time availability
2 = SOMEWHAT INAPPROPRIATE: Some assumptions don't match student reality
3 = NEUTRAL: Generic advice
4 = APPROPRIATE: Considers student constraints
5 = VERY APPROPRIATE: Perfectly tailored to student life

Return JSON: {"score": X, "reason": "brief explanation"}`,
    scoreName: 'appropriateness_score',
  },
  {
    key: 'actionability',
    name: 'Advice Actionability',
    samplingRate: 0.5,
    prompt: `You are evaluating the actionability of financial advice.

AI Response: {{output}}

Evaluate how ACTIONABLE this advice is:

Score from 1-5:
1 = VAGUE: No concrete steps, just platitudes
2 = SOMEWHAT ACTIONABLE: Some ideas but unclear execution
3 = NEUTRAL: General suggestions
4 = ACTIONABLE: Clear steps the student can take
5 = VERY ACTIONABLE: Specific, numbered steps with timeframes

Return JSON: {"score": X, "reason": "brief explanation"}`,
    scoreName: 'actionability_score',
  },
];

async function setupEvaluators(projectId: string): Promise<void> {
  console.log('\n🤖 Setting up Online Evaluation Rules (LLM-as-Judge)...');

  for (const evaluator of EVALUATORS) {
    try {
      // Opik API structure: model object, messages array, variables, schema
      const body = {
        name: evaluator.name,
        type: 'llm_as_judge',
        action: 'evaluator',
        sampling_rate: evaluator.samplingRate,
        enabled: true,
        project_ids: [projectId],
        code: {
          model: {
            name: 'opik-free-model', // Opik's free evaluation model
            temperature: 0.0,
            custom_parameters: null,
          },
          messages: [
            {
              role: 'USER',
              content: evaluator.prompt,
              structured_content: false,
              string_content: true,
            },
          ],
          variables: {
            input: 'input',
            output: 'output',
          },
          schema: [
            {
              name: evaluator.scoreName,
              type: 'INTEGER', // 1-5 scale
              description: `${evaluator.name} score (1-5)`,
            },
          ],
        },
      };

      await opikFetch('/automations/evaluators', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      console.log(`   ✓ Created: ${evaluator.name} (sampling: ${evaluator.samplingRate * 100}%)`);
    } catch (error) {
      if (String(error).includes('409')) {
        console.log(`   ○ Already exists: ${evaluator.name}`);
      } else {
        console.log(`   ✗ Failed: ${evaluator.name} - ${error}`);
      }
    }
  }

  console.log('\n   💡 Evaluators will automatically score new traces!');
}

// ============================================================================
// Step 3: Setup Annotation Queue
// ============================================================================

async function setupAnnotationQueue(projectId: string): Promise<string | null> {
  console.log('\n📝 Setting up Annotation Queue...');

  // First check for existing queue
  try {
    const queues = await opikFetch<{ content?: Array<{ id: string; name: string }> }>(
      `/annotation-queues?project_id=${projectId}`
    );
    const existingQueue = queues.content?.find((q) => q.name === 'Stride Advice Review');
    if (existingQueue) {
      console.log(`   ○ Using existing: Stride Advice Review`);
      console.log(`   📋 Queue ID: ${existingQueue.id}`);
      return existingQueue.id;
    }
  } catch {
    // Continue to create
  }

  try {
    const body = {
      name: 'Stride Advice Review',
      project_id: projectId,
      scope: 'trace',
      description: 'Review AI-generated financial advice for students',
      instructions: `Review each trace and score:
1. Safety: Is this advice safe for a student?
2. Appropriateness: Does it match student constraints?
3. Actionability: Are the steps clear?

Flag any concerning advice for team review.`,
      comments_enabled: true,
      feedback_definition_names: ['safety_score', 'appropriateness_score', 'actionability_score'],
    };

    await opikFetch('/annotation-queues', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    console.log(`   ✓ Created: Stride Advice Review`);

    // Fetch to get the ID
    const queues = await opikFetch<{ content?: Array<{ id: string; name: string }> }>(
      `/annotation-queues?project_id=${projectId}`
    );
    const queue = queues.content?.find((q) => q.name === 'Stride Advice Review');
    if (queue) {
      console.log(`   📋 Queue ID: ${queue.id}`);
      return queue.id;
    }
    return null;
  } catch (error) {
    console.log(`   ✗ Failed: ${error}`);
    return null;
  }
}

// ============================================================================
// Step 4: Generate Demo Traces with LLM Calls (using Opik SDK)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let opikClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let flushAll: (() => Promise<void>) | null = null;

async function initOpikClient(): Promise<boolean> {
  try {
    // Ensure environment variables are set
    process.env.OPIK_API_KEY = OPIK_API_KEY;
    process.env.OPIK_WORKSPACE = OPIK_WORKSPACE;
    process.env.OPIK_PROJECT_NAME = OPIK_PROJECT;

    const opikModule = await import('opik');
    const { Opik, flushAll: flush } = opikModule;

    flushAll = flush;

    // Initialize with explicit config including custom headers for auth
    // The SDK may have a bug where it doesn't pass apiKey to requests
    opikClient = new Opik({
      apiKey: OPIK_API_KEY,
      projectName: OPIK_PROJECT,
      workspaceName: OPIK_WORKSPACE,
      headers: {
        Authorization: `Bearer ${OPIK_API_KEY}`,
        'Comet-Workspace': OPIK_WORKSPACE!,
      },
    });

    console.log('   ✓ Opik SDK initialized');
    return true;
  } catch (error) {
    console.log(`   ✗ Failed to initialize Opik SDK: ${error}`);
    return false;
  }
}

async function generateDemoTraces(): Promise<string[]> {
  console.log('\n🔄 Generating Demo Traces with LLM (via Opik SDK)...\n');
  console.log(`   Using model: ${GROQ_MODEL}`);
  console.log(`   Opik project: ${OPIK_PROJECT}`);

  // Initialize Opik SDK
  if (!opikClient) {
    const initialized = await initOpikClient();
    if (!initialized) {
      console.log('   ⚠ Cannot generate traces without Opik SDK');
      return [];
    }
  }

  // Import Groq for LLM calls
  const Groq = (await import('groq-sdk')).default;
  const groq = new Groq({ apiKey: GROQ_API_KEY });

  const traceIds: string[] = [];

  // Demo scenarios
  const scenarios = [
    {
      name: 'Budget Analysis - Student in Deficit',
      input: {
        type: 'budget_analysis',
        incomes: [
          { source: 'Bourse CROUS', amount: 450 },
          { source: 'Aide parents', amount: 200 },
        ],
        expenses: [
          { source: 'Loyer', amount: 500 },
          { source: 'Alimentation', amount: 250 },
          { source: 'Transport', amount: 50 },
        ],
      },
      userMessage: `Analyse mon budget étudiant:
Revenus: Bourse 450€ + Aide parents 200€ = 650€/mois
Dépenses: Loyer 500€ + Alimentation 250€ + Transport 50€ = 800€/mois
Déficit: -150€/mois

Que me conseilles-tu pour équilibrer mon budget?`,
    },
    {
      name: 'Job Matching - Dev Skills',
      input: {
        type: 'job_matching',
        skills: ['Python', 'JavaScript', 'React'],
        availability: '15h/semaine',
        diploma: 'L3 Informatique',
      },
      userMessage: `Je suis en L3 Info avec des compétences en Python, JavaScript et React.
Je cherche un job étudiant 15h/semaine maximum.
Quels types de jobs me conseillerais-tu qui valorisent mes compétences?`,
    },
    {
      name: 'Goal Planning - Summer Vacation',
      input: {
        type: 'goal_planning',
        goalAmount: 800,
        deadline: '3 mois',
        currentMargin: 50,
      },
      userMessage: `J'aimerais partir en vacances cet été (dans 3 mois) avec un budget de 800€.
Actuellement j'ai une marge de 50€/mois.
Comment puis-je atteindre cet objectif?`,
    },
    {
      name: 'Onboarding - New Student',
      input: {
        type: 'onboarding',
        step: 'initial',
        profile: { name: 'Lucas', city: 'Lyon' },
      },
      userMessage: `Salut! Je m'appelle Lucas, je suis nouveau à Lyon pour mes études.
C'est ma première fois loin de chez mes parents et je ne sais pas trop comment gérer mon argent.
Tu peux m'aider à démarrer?`,
    },
    {
      name: 'Energy Debt Detection',
      input: {
        type: 'comeback_mode',
        energyHistory: [30, 25, 35, 28, 45, 60, 85],
        context: 'Post-exams recovery',
      },
      userMessage: `Mes dernières semaines ont été difficiles avec les examens.
Mon énergie était au plus bas (30%) mais là ça va mieux (85%).
Comment je peux profiter de ce regain pour rattraper mes objectifs financiers?`,
    },
  ];

  for (const scenario of scenarios) {
    console.log(`   📍 ${scenario.name}...`);

    try {
      const startTime = new Date();

      // Create trace via Opik SDK
      const traceHandle = opikClient.trace({
        name: `demo.${scenario.input.type}`,
        projectName: OPIK_PROJECT,
        startTime,
        input: scenario.input,
        metadata: {
          demo: true,
          scenario: scenario.name,
        },
        tags: ['demo', `type:${scenario.input.type}`, 'hackathon'],
      });

      const traceId = traceHandle.data?.id || traceHandle.id || `trace_${Date.now()}`;
      traceIds.push(traceId);

      // Create LLM span under the trace
      const spanHandle = traceHandle.span({
        name: 'groq.chat',
        type: 'llm',
        startTime,
        input: { message: scenario.userMessage },
        model: GROQ_MODEL,
        provider: 'groq',
      });

      // Actually call the LLM
      const response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: `Tu es Bruno, un assistant financier bienveillant pour étudiants français.
Tu donnes des conseils pratiques, encourageants et adaptés à la réalité étudiante.
Tu ne recommandes jamais de solutions risquées (crypto, paris, dettes).
Réponds de manière concise et actionnable.`,
          },
          { role: 'user', content: scenario.userMessage },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const output = response.choices[0]?.message?.content || 'No response';

      // Update and end the span
      spanHandle.update({
        output: { response: output },
        usage: {
          prompt_tokens: response.usage?.prompt_tokens || 0,
          completion_tokens: response.usage?.completion_tokens || 0,
          total_tokens: response.usage?.total_tokens || 0,
        },
      });
      spanHandle.end();

      // Update and end the trace
      traceHandle.update({
        output: { response: output.substring(0, 500) + (output.length > 500 ? '...' : '') },
        metadata: { status: 'success' },
      });
      traceHandle.end();

      console.log(`      ✓ Trace: ${traceId.substring(0, 8)}... (${output.length} chars)`);
    } catch (error) {
      console.log(`      ✗ Error: ${error}`);
    }
  }

  // Flush all traces to Opik
  console.log('\n   Flushing traces to Opik...');
  if (flushAll) {
    try {
      await flushAll();
      console.log('   ✓ All traces sent to Opik!');
    } catch (error) {
      console.log(`   ⚠ Flush warning: ${error}`);
    }
  }

  return traceIds;
}

// ============================================================================
// Step 5: Add Traces to Annotation Queue
// ============================================================================

async function addTracesToQueue(queueId: string, traceIds: string[]): Promise<void> {
  if (!queueId || traceIds.length === 0) {
    console.log('\n📋 Skipping annotation queue (no queue ID or traces)');
    return;
  }

  console.log(`\n📋 Adding ${traceIds.length} traces to Annotation Queue...`);

  try {
    await opikFetch(`/annotation-queues/${queueId}/items`, {
      method: 'POST',
      body: JSON.stringify({ trace_ids: traceIds }),
    });
    console.log(`   ✓ Added ${traceIds.length} traces for human review`);
  } catch (error) {
    // This often fails because SDK trace IDs are internal format
    // Traces can still be manually added via Opik dashboard
    console.log(`   ⚠ Could not auto-add traces (add manually via dashboard)`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           🚀 STRIDE OPIK DEMO - Hackathon 2026             ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Demonstrating ALL Opik observability features:            ║');
  console.log('║  • Online Evaluation Rules (LLM-as-Judge automation)       ║');
  console.log('║  • Annotation Queues (human review workflows)              ║');
  console.log('║  • Feedback Definitions (custom metrics)                   ║');
  console.log('║  • Rich Traces with Spans and Token Usage                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Check environment
  if (!checkEnv()) {
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const setupOnly = args.includes('--setup-only');
  const tracesOnly = args.includes('--traces-only');

  // Get project ID (needed for evaluators and queues)
  console.log(`\n🔍 Looking up project "${OPIK_PROJECT}"...`);

  // Use project ID from env if available (faster, more reliable)
  let projectId = OPIK_PROJECT_ID || (await getProjectId());

  if (OPIK_PROJECT_ID) {
    console.log(`   ✓ Using project ID from env: ${projectId}`);
  }

  if (!projectId && !tracesOnly) {
    console.log('   ⚠ Project not found. Generating a trace first to create it...');

    // Initialize Opik SDK and create init trace
    try {
      await initOpikClient();
      if (opikClient) {
        const traceHandle = opikClient.trace({
          name: 'demo.init',
          projectName: OPIK_PROJECT,
          startTime: new Date(),
          input: { action: 'project_initialization' },
          metadata: { demo: true },
          tags: ['init'],
        });
        traceHandle.update({ output: { status: 'initialized' } });
        traceHandle.end();

        if (flushAll) {
          await flushAll();
        }
        console.log('   ✓ Init trace created via SDK');
      }
    } catch (e) {
      console.log(`   ⚠ Could not create init trace: ${e}`);
    }

    // Wait a bit and retry
    await new Promise((r) => setTimeout(r, 2000));
    projectId = await getProjectId();
  }

  if (projectId) {
    console.log(`   ✓ Project ID: ${projectId}`);
  } else {
    console.log('   ⚠ Could not get project ID. Some features may not work.');
  }

  // Step 1: Setup Feedback Definitions
  if (!tracesOnly) {
    await setupFeedbackDefinitions();
  }

  // Step 2: Setup Online Evaluators
  let queueId: string | null = null;
  if (!tracesOnly && projectId) {
    await setupEvaluators(projectId);

    // Step 3: Setup Annotation Queue
    queueId = await setupAnnotationQueue(projectId);
  }

  // Step 4: Generate Traces
  let traceIds: string[] = [];
  if (!setupOnly) {
    traceIds = await generateDemoTraces();
  }

  // Step 5: Add to Annotation Queue
  if (!setupOnly && queueId && traceIds.length > 0) {
    // Wait for traces to be indexed
    await new Promise((r) => setTimeout(r, 2000));
    await addTracesToQueue(queueId, traceIds);
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    ✅ DEMO COMPLETE                        ║');
  console.log('╠════════════════════════════════════════════════════════════╣');

  if (!setupOnly) {
    console.log(`║  📊 Traces generated: ${traceIds.length.toString().padEnd(35)}║`);
  }
  if (!tracesOnly) {
    console.log(`║  🤖 Evaluators configured: ${EVALUATORS.length.toString().padEnd(30)}║`);
    console.log(`║  📝 Feedback definitions: ${FEEDBACK_DEFINITIONS.length.toString().padEnd(31)}║`);
    if (queueId) {
      console.log(`║  📋 Annotation queue: Ready for human review             ║`);
    }
  }

  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  View your traces at:                                      ║');
  const dashboardUrl = projectId
    ? `https://www.comet.com/opik/${OPIK_WORKSPACE}/projects/${projectId}/traces`
    : `https://www.comet.com/opik/${OPIK_WORKSPACE}`;
  console.log(`║  ${dashboardUrl}`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

main().catch((error) => {
  console.error('\n❌ Demo failed:', error);
  process.exit(1);
});
