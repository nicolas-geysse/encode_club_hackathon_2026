/**
 * Student Life Navigator - MCP Tools
 *
 * Tools organized in categories:
 *
 * === LLM / Budget Coaching ===
 * - analyze_budget: Analyze income vs expenses
 * - generate_advice: Generate personalized advice
 * - validate_recommendation: Guardian Layer validation
 *
 * === DuckPGQ / Graph ===
 * - match_jobs: Find jobs compatible with skills
 * - find_optimizations: Find budget optimizations
 * - explain_recommendation: Graph traversal for explainability
 * - career_projection: Diploma → Career path
 *
 * === MindsDB / ML ===
 * - predict_graduation_balance: Will student be debt-free?
 * - predict_loan_payoff: When will loan be paid off?
 *
 * === Visualization ===
 * - create_budget_chart: Pie chart of expenses
 *
 * === Voice Input (NEW) ===
 * - transcribe_audio: Speech-to-text via Whisper
 * - voice_to_analysis: Speech-to-text + contextual analysis
 *
 * === Goal-Driven Mode (NEW) ===
 * - create_goal_plan: Create goal with milestones
 * - update_goal_progress: Track weekly progress
 * - get_goal_status: View goal status
 * - goal_risk_assessment: Analyze goal risk
 * - list_user_goals: List all goals
 *
 * === Profile Management (NEW) ===
 * - save_profile: Save profile + planData + followupData
 * - load_profile: Load by ID or active profile
 * - list_profiles: List all profiles
 * - switch_profile: Change active profile
 * - duplicate_profile_for_goal: Clone for new goal
 * - delete_profile: Delete a profile
 *
 * === Simulation (NEW) ===
 * - advance_day: Advance simulation by N days
 * - get_simulation_date: Get current simulated date
 * - reset_simulation: Reset to real date
 * - simulate_week_progress: Simulate goal progress
 *
 * === Opik Integration ===
 * - get_traces: Link to Opik dashboard
 * - log_feedback: User thumbs up/down
 */

import { query } from '../services/duckdb.js';
import { trace, getTraceUrl, logFeedback, getCurrentTraceId } from '../services/opik.js';
import { analyzeBudget, generateAdvice } from '../services/groq.js';
import { runStudentAnalysis, type StudentProfile } from '../workflows/index.js';

// Import new tool modules
import { VOICE_TOOLS, handleVoiceTool } from './voice.js';
import { GOAL_TOOLS, handleGoalTool } from './goal.js';
import { SWIPE_TOOLS, handleSwipeTool } from './swipe.js';
import { PROFILE_TOOLS, handleProfileTool } from './profile.js';
import { SIMULATION_TOOLS, handleSimulationTool } from './simulation.js';
import { RAG_TOOLS, handleRAGTool } from './rag-tools.js';
import { BROWSER_TOOLS, handleBrowserTool } from './browser.js';
import { DUCKDB_MCP_TOOLS, handleDuckDBMCPTool } from './duckdb-mcp.js';

// Types
interface IncomeSource {
  source: string;
  amount: number;
}

interface Expense {
  category: string;
  amount: number;
}

interface JobMatch {
  name: string;
  match_score: number;
  rate: number;
  benefit: string | null;
  flexibility: number;
}

interface Optimization {
  expense: string;
  solution: string;
  savings_pct: number;
  monthly_cost: number;
  potential_savings: number;
}

interface CareerPath {
  diploma: string;
  career: string;
  salary: number;
  years_after: number;
  probability: number;
}

// Tool definitions
export const TOOLS = {
  // === LLM Tools ===
  analyze_budget: {
    description:
      'Analyze student budget: income sources vs expenses. Returns KPIs and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        income_sources: {
          type: 'array',
          description: 'List of income sources with amounts',
          items: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'Income source name (e.g., APL, Parents, Job)',
              },
              amount: { type: 'number', description: 'Monthly amount in euros' },
            },
            required: ['source', 'amount'],
          },
        },
        expenses: {
          type: 'array',
          description: 'List of expenses by category',
          items: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description: 'Expense category (e.g., rent, food, transport)',
              },
              amount: { type: 'number', description: 'Monthly amount in euros' },
            },
            required: ['category', 'amount'],
          },
        },
      },
      required: ['income_sources', 'expenses'],
    },
  },

  generate_advice: {
    description: 'Generate personalized financial advice based on student profile',
    inputSchema: {
      type: 'object',
      properties: {
        diploma: { type: 'string', description: 'Current diploma (e.g., L2 Info, Master Dev)' },
        skills: { type: 'array', items: { type: 'string' }, description: 'List of skills' },
        margin: { type: 'number', description: 'Current monthly margin in euros' },
        has_loan: { type: 'boolean', description: 'Whether student has a loan' },
        loan_amount: { type: 'number', description: 'Total loan amount if applicable' },
        context: { type: 'string', description: 'Additional context for advice' },
      },
    },
  },

  // === Graph Tools ===
  match_jobs: {
    description:
      'Find jobs compatible with student skills using knowledge graph. Returns ranked jobs with co-benefits.',
    inputSchema: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of skills (e.g., python, sql, english)',
        },
        max_hours_weekly: { type: 'number', description: 'Maximum hours per week available' },
        min_hourly_rate: { type: 'number', description: 'Minimum acceptable hourly rate' },
      },
      required: ['skills'],
    },
  },

  find_optimizations: {
    description: 'Find budget optimizations using knowledge graph. Suggests cost-saving solutions.',
    inputSchema: {
      type: 'object',
      properties: {
        expense_categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Expense categories to optimize (e.g., rent, food, transport)',
        },
        current_expenses: {
          type: 'object',
          description: 'Current expense amounts by category',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['expense_categories'],
    },
  },

  career_projection: {
    description: 'Project career paths from current diploma using knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        diploma: { type: 'string', description: 'Current diploma ID (e.g., l2_info, master_dev)' },
      },
      required: ['diploma'],
    },
  },

  explain_recommendation: {
    description: 'Explain a job or optimization recommendation by showing the graph path',
    inputSchema: {
      type: 'object',
      properties: {
        recommendation_type: { type: 'string', enum: ['job', 'optimization'] },
        source_id: { type: 'string', description: 'Source node ID (skill or expense)' },
        target_id: { type: 'string', description: 'Target node ID (job or solution)' },
      },
      required: ['recommendation_type', 'source_id', 'target_id'],
    },
  },

  // === ML Tools ===
  predict_graduation_balance: {
    description: 'Predict financial balance at graduation using projections',
    inputSchema: {
      type: 'object',
      properties: {
        monthly_income: { type: 'number', description: 'Total monthly income' },
        monthly_expenses: { type: 'number', description: 'Total monthly expenses' },
        years_remaining: { type: 'number', description: 'Years until graduation' },
        job_hours_weekly: { type: 'number', description: 'Additional job hours per week' },
        job_hourly_rate: { type: 'number', description: 'Hourly rate for additional job' },
        optimizations_applied: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of optimizations applied',
        },
      },
      required: ['monthly_income', 'monthly_expenses', 'years_remaining'],
    },
  },

  predict_loan_payoff: {
    description: 'Predict when student loan will be paid off',
    inputSchema: {
      type: 'object',
      properties: {
        loan_amount: { type: 'number', description: 'Total loan amount' },
        interest_rate: { type: 'number', description: 'Annual interest rate (e.g., 0.02 for 2%)' },
        monthly_payment: {
          type: 'number',
          description: 'Expected monthly payment after graduation',
        },
        starting_salary: { type: 'number', description: 'Expected starting annual salary' },
      },
      required: ['loan_amount', 'monthly_payment'],
    },
  },

  // === Visualization Tools ===
  create_budget_chart: {
    description: 'Create a pie/doughnut chart visualization of budget breakdown',
    inputSchema: {
      type: 'object',
      properties: {
        expenses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              amount: { type: 'number' },
            },
          },
        },
        chart_type: { type: 'string', enum: ['pie', 'doughnut'], default: 'doughnut' },
      },
      required: ['expenses'],
    },
  },

  // === Smart Suggestion Tool ===
  suggest_related_jobs: {
    description:
      'Suggest personalized jobs based on field of study with networking opportunities. Uses LLM to find creative job matches.',
    inputSchema: {
      type: 'object',
      properties: {
        diploma: {
          type: 'string',
          description: 'Current diploma (e.g., L2 Info, Master Psychologie)',
        },
        field: {
          type: 'string',
          description: 'Field of study (e.g., informatique, langues, droit, psychologie)',
        },
        skills: { type: 'array', items: { type: 'string' }, description: 'Current skills' },
        interests: {
          type: 'array',
          items: { type: 'string' },
          description: 'Personal interests and hobbies',
        },
        networking_priority: {
          type: 'boolean',
          description: 'Prioritize jobs that help build professional network',
        },
      },
      required: ['diploma', 'field'],
    },
  },

  // === Opik Tools ===
  get_traces: {
    description: 'Get link to Opik dashboard to view analysis traces',
    inputSchema: {
      type: 'object',
      properties: {
        trace_id: { type: 'string', description: 'Specific trace ID (optional)' },
      },
    },
  },

  log_feedback: {
    description: 'Log user feedback (thumbs up/down) for a recommendation',
    inputSchema: {
      type: 'object',
      properties: {
        feedback: { type: 'string', enum: ['thumbs_up', 'thumbs_down'] },
        trace_id: { type: 'string', description: 'Trace ID to attach feedback to' },
        comment: { type: 'string', description: 'Optional comment' },
      },
      required: ['feedback'],
    },
  },

  // === Workflow Tool (Mastra Multi-Agent) ===
  analyze_student_profile: {
    description:
      'Complete student analysis workflow using Mastra agents. Combines budget analysis, job matching, optimizations, and graduation projection in one call. Traces are automatically sent to Opik.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Student name' },
        diploma: { type: 'string', description: 'Current diploma (e.g., L2, M1)' },
        field: { type: 'string', description: 'Field of study' },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of skills',
        },
        years_remaining: { type: 'number', description: 'Years until graduation' },
        incomes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              amount: { type: 'number' },
            },
            required: ['source', 'amount'],
          },
          description: 'Income sources',
        },
        expenses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              amount: { type: 'number' },
            },
            required: ['category', 'amount'],
          },
          description: 'Expense categories',
        },
        max_work_hours: { type: 'number', description: 'Max work hours per week' },
        min_hourly_rate: { type: 'number', description: 'Minimum hourly rate' },
        has_loan: { type: 'boolean', description: 'Has student loan' },
        loan_amount: { type: 'number', description: 'Loan amount if applicable' },
      },
      required: [
        'skills',
        'years_remaining',
        'incomes',
        'expenses',
        'max_work_hours',
        'min_hourly_rate',
      ],
    },
  },

  // === Voice Input Tools (NEW) ===
  ...VOICE_TOOLS,

  // === Goal-Driven Mode Tools (NEW) ===
  ...GOAL_TOOLS,

  // === Swipe Scenarios Tools (NEW) ===
  ...SWIPE_TOOLS,

  // === Profile Management Tools (NEW) ===
  ...PROFILE_TOOLS,

  // === Simulation Tools (NEW) ===
  ...SIMULATION_TOOLS,

  // === RAG Tools (NEW) ===
  ...RAG_TOOLS,

  // === Browser Tools (NEW) ===
  ...BROWSER_TOOLS,

  // === DuckDB MCP Tools (NEW) ===
  ...DUCKDB_MCP_TOOLS,
};

// Tool handlers
export async function handleTool(name: string, args: unknown): Promise<unknown> {
  const typedArgs = args as Record<string, unknown>;

  // Check if it's a voice tool
  if (name in VOICE_TOOLS) {
    return handleVoiceTool(name, typedArgs);
  }

  // Check if it's a goal tool
  if (name in GOAL_TOOLS) {
    return handleGoalTool(name, typedArgs);
  }

  // Check if it's a swipe tool
  if (name in SWIPE_TOOLS) {
    return handleSwipeTool(name, typedArgs);
  }

  // Check if it's a profile tool
  if (name in PROFILE_TOOLS) {
    return handleProfileTool(name, typedArgs);
  }

  // Check if it's a simulation tool
  if (name in SIMULATION_TOOLS) {
    return handleSimulationTool(name, typedArgs);
  }

  // Check if it's a RAG tool
  if (name in RAG_TOOLS) {
    return handleRAGTool(name, typedArgs);
  }

  // Check if it's a browser tool
  if (name in BROWSER_TOOLS) {
    return handleBrowserTool(name, typedArgs);
  }

  // Check if it's a DuckDB MCP tool
  if (name in DUCKDB_MCP_TOOLS) {
    return handleDuckDBMCPTool(name, typedArgs);
  }

  switch (name) {
    case 'analyze_budget':
      return handleAnalyzeBudget(typedArgs);
    case 'generate_advice':
      return handleGenerateAdvice(typedArgs);
    case 'match_jobs':
      return handleMatchJobs(typedArgs);
    case 'find_optimizations':
      return handleFindOptimizations(typedArgs);
    case 'career_projection':
      return handleCareerProjection(typedArgs);
    case 'explain_recommendation':
      return handleExplainRecommendation(typedArgs);
    case 'predict_graduation_balance':
      return handlePredictGraduationBalance(typedArgs);
    case 'predict_loan_payoff':
      return handlePredictLoanPayoff(typedArgs);
    case 'create_budget_chart':
      return handleCreateBudgetChart(typedArgs);
    case 'suggest_related_jobs':
      return handleSuggestRelatedJobs(typedArgs);
    case 'get_traces':
      return handleGetTraces(typedArgs);
    case 'log_feedback':
      return handleLogFeedback(typedArgs);
    case 'analyze_student_profile':
      return handleAnalyzeStudentProfile(typedArgs);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// === Tool Handler Implementations ===

async function handleAnalyzeBudget(args: Record<string, unknown>) {
  return trace('budget_analysis', async (span) => {
    const incomes = args.income_sources as IncomeSource[];
    const expenses = args.expenses as Expense[];

    span.setAttributes({
      income_count: incomes.length,
      expense_count: expenses.length,
    });

    const analysis = await analyzeBudget(incomes, expenses);

    span.setAttributes({
      total_income: analysis.totalIncome,
      total_expenses: analysis.totalExpenses,
      margin: analysis.margin,
    });

    // Return UI-compatible format
    return {
      type: 'composite',
      components: [
        {
          id: 'metrics',
          type: 'grid',
          params: {
            columns: 3,
            gap: '1rem',
            children: [
              {
                id: 'income',
                type: 'metric',
                params: {
                  title: 'Revenus',
                  value: analysis.totalIncome,
                  unit: '€/mois',
                  trend: { direction: analysis.margin >= 0 ? 'up' : 'neutral', value: 0 },
                },
              },
              {
                id: 'expenses',
                type: 'metric',
                params: {
                  title: 'Dépenses',
                  value: analysis.totalExpenses,
                  unit: '€/mois',
                },
              },
              {
                id: 'margin',
                type: 'metric',
                params: {
                  title: 'Marge',
                  value: analysis.margin,
                  unit: '€/mois',
                  trend: {
                    direction: analysis.margin >= 0 ? 'up' : 'down',
                    value: Math.abs(analysis.margin),
                  },
                },
              },
            ],
          },
        },
        {
          id: 'summary',
          type: 'text',
          params: {
            content: `## Analyse\n\n${analysis.summary}\n\n## Recommandations\n\n${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleGenerateAdvice(args: Record<string, unknown>) {
  return trace('generate_advice', async (span) => {
    const profile = {
      diploma: args.diploma as string | undefined,
      skills: args.skills as string[] | undefined,
      margin: args.margin as number | undefined,
      hasLoan: args.has_loan as boolean | undefined,
      loanAmount: args.loan_amount as number | undefined,
    };

    span.setAttributes({
      diploma: profile.diploma || 'unknown',
      skills_count: profile.skills?.length || 0,
      has_loan: profile.hasLoan || false,
    });

    const advice = await generateAdvice(profile, args.context as string | undefined);

    return {
      type: 'text',
      params: {
        content: advice,
        markdown: true,
      },
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleMatchJobs(args: Record<string, unknown>) {
  return trace('graph_job_matching', async (span) => {
    const skills = args.skills as string[];
    const minRate = args.min_hourly_rate as number | undefined;

    span.setAttributes({
      skills,
      min_hourly_rate: minRate || 0,
    });

    // Query knowledge graph for job matches
    const skillsIn = skills.map((s) => `'${s.toLowerCase()}'`).join(',');
    const sql = `
      SELECT
        j.name,
        e.weight as match_score,
        CAST(json_extract(j.properties, '$.hourly_rate') AS FLOAT) as rate,
        json_extract(e.properties, '$.co_benefit') as benefit,
        CAST(json_extract(j.properties, '$.flexibility') AS FLOAT) as flexibility
      FROM student_edges e
      JOIN student_nodes s ON e.source_id = s.id
      JOIN student_nodes j ON e.target_id = j.id
      WHERE s.id IN (${skillsIn})
        AND e.relation_type = 'enables'
        ${minRate ? `AND CAST(json_extract(j.properties, '$.hourly_rate') AS FLOAT) >= ${minRate}` : ''}
      ORDER BY CAST(json_extract(j.properties, '$.hourly_rate') AS FLOAT) * e.weight DESC
      LIMIT 5
    `;

    let jobs: JobMatch[] = [];
    try {
      jobs = await query<JobMatch>(sql);
    } catch (error) {
      // Fallback to mock data if graph not initialized
      console.error('Graph query failed, using mock data:', error);
      jobs = [
        {
          name: 'Dev Freelance Malt',
          match_score: 0.9,
          rate: 25,
          benefit: 'CV++',
          flexibility: 0.9,
        },
        {
          name: 'Cours particuliers',
          match_score: 0.7,
          rate: 20,
          benefit: 'Renforce apprentissage',
          flexibility: 0.8,
        },
        {
          name: 'Data Entry',
          match_score: 0.6,
          rate: 12,
          benefit: 'Automatisation',
          flexibility: 0.7,
        },
      ];
    }

    span.setAttributes({
      jobs_found: jobs.length,
    });

    return {
      type: 'table',
      params: {
        title: 'Jobs Recommandés',
        columns: [
          { key: 'name', label: 'Job' },
          { key: 'rate', label: '€/h' },
          { key: 'match_score', label: 'Match' },
          { key: 'benefit', label: 'Co-bénéfice' },
        ],
        rows: jobs.map((j) => ({
          name: j.name,
          rate: j.rate,
          match_score: `${Math.round(j.match_score * 100)}%`,
          benefit: j.benefit || '-',
        })),
      },
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleFindOptimizations(args: Record<string, unknown>) {
  return trace('graph_find_optimizations', async (span) => {
    const categories = args.expense_categories as string[];

    span.setAttributes({
      categories,
    });

    // Query knowledge graph for optimizations
    const categoriesIn = categories.map((c) => `'${c.toLowerCase()}'`).join(',');
    const sql = `
      SELECT
        exp.name as expense,
        sol.name as solution,
        e.weight as savings_pct,
        CAST(json_extract(exp.properties, '$.avg_student') AS FLOAT) as monthly_cost
      FROM student_edges e
      JOIN student_nodes sol ON e.source_id = sol.id
      JOIN student_nodes exp ON e.target_id = exp.id
      WHERE e.relation_type = 'reduces'
        AND exp.id IN (${categoriesIn})
      ORDER BY e.weight DESC
    `;

    let optimizations: Optimization[] = [];
    try {
      const results = await query<{
        expense: string;
        solution: string;
        savings_pct: number;
        monthly_cost: number;
      }>(sql);
      optimizations = results.map((r) => ({
        ...r,
        potential_savings: Math.round(r.monthly_cost * r.savings_pct),
      }));
    } catch (error) {
      console.error('Graph query failed, using mock data:', error);
      optimizations = [
        {
          expense: 'Loyer',
          solution: 'Colocation',
          savings_pct: 0.3,
          monthly_cost: 500,
          potential_savings: 150,
        },
        {
          expense: 'Alimentation',
          solution: 'Resto U CROUS',
          savings_pct: 0.5,
          monthly_cost: 200,
          potential_savings: 100,
        },
        {
          expense: 'Transport',
          solution: 'Vélo/Marche',
          savings_pct: 0.8,
          monthly_cost: 50,
          potential_savings: 40,
        },
      ];
    }

    span.setAttributes({
      optimizations_found: optimizations.length,
      total_potential_savings: optimizations.reduce((sum, o) => sum + o.potential_savings, 0),
    });

    return {
      type: 'table',
      params: {
        title: 'Optimisations Budget',
        columns: [
          { key: 'expense', label: 'Dépense' },
          { key: 'solution', label: 'Solution' },
          { key: 'savings_pct', label: 'Économie' },
          { key: 'potential_savings', label: 'Gain/mois' },
        ],
        rows: optimizations.map((o) => ({
          expense: o.expense,
          solution: o.solution,
          savings_pct: `${Math.round(o.savings_pct * 100)}%`,
          potential_savings: `${o.potential_savings}€`,
        })),
      },
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleCareerProjection(args: Record<string, unknown>) {
  return trace('graph_career_projection', async (span) => {
    const diploma = args.diploma as string;

    span.setAttributes({ diploma });

    const sql = `
      SELECT
        d.name as diploma,
        c.name as career,
        CAST(json_extract(c.properties, '$.starting_salary') AS INTEGER) as salary,
        CAST(json_extract(e.properties, '$.years_after') AS INTEGER) as years_after,
        e.weight as probability
      FROM student_edges e
      JOIN student_nodes d ON e.source_id = d.id
      JOIN student_nodes c ON e.target_id = c.id
      WHERE d.id = '${diploma}'
        AND e.relation_type = 'leads_to'
        AND c.domain = 'career'
      ORDER BY e.weight DESC
    `;

    let careers: CareerPath[] = [];
    try {
      careers = await query<CareerPath>(sql);
    } catch (error) {
      console.error('Graph query failed, using mock data:', error);
      careers = [
        {
          diploma: 'L2 Informatique',
          career: 'Développeur Junior',
          salary: 35000,
          years_after: 3,
          probability: 0.7,
        },
        {
          diploma: 'L2 Informatique',
          career: 'Data Analyst',
          salary: 38000,
          years_after: 4,
          probability: 0.5,
        },
      ];
    }

    span.setAttributes({
      careers_found: careers.length,
    });

    return {
      type: 'table',
      params: {
        title: 'Projections de Carrière',
        columns: [
          { key: 'career', label: 'Métier' },
          { key: 'salary', label: 'Salaire départ' },
          { key: 'years_after', label: 'Années' },
          { key: 'probability', label: 'Probabilité' },
        ],
        rows: careers.map((c) => ({
          career: c.career,
          salary: `${c.salary.toLocaleString('fr-FR')}€`,
          years_after: `+${c.years_after} ans`,
          probability: `${Math.round(c.probability * 100)}%`,
        })),
      },
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleExplainRecommendation(args: Record<string, unknown>) {
  return trace('graph_explain_recommendation', async (span) => {
    const type = args.recommendation_type as string;
    const sourceId = args.source_id as string;
    const targetId = args.target_id as string;

    span.setAttributes({ type, sourceId, targetId });

    // Build explanation path
    const sql = `
      SELECT
        s.name as source_name,
        s.domain as source_domain,
        e.relation_type,
        e.weight,
        json_extract(e.properties, '$.co_benefit') as co_benefit,
        t.name as target_name,
        t.domain as target_domain
      FROM student_edges e
      JOIN student_nodes s ON e.source_id = s.id
      JOIN student_nodes t ON e.target_id = t.id
      WHERE s.id = '${sourceId}'
        AND t.id = '${targetId}'
    `;

    let path: Record<string, unknown>[] = [];
    try {
      path = await query(sql);
    } catch (error) {
      console.error('Graph query failed:', error);
    }

    const explanation =
      path.length > 0
        ? `${path[0].source_name} → ${path[0].relation_type} (${Math.round((path[0].weight as number) * 100)}%) → ${path[0].target_name}${path[0].co_benefit ? ` | Bonus: ${path[0].co_benefit}` : ''}`
        : `Relation ${sourceId} → ${targetId} non trouvée`;

    return {
      type: 'text',
      params: {
        content: `## Explication\n\n${explanation}`,
        markdown: true,
      },
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handlePredictGraduationBalance(args: Record<string, unknown>) {
  return trace('ml_graduation_projection', async (span) => {
    const monthlyIncome = args.monthly_income as number;
    const monthlyExpenses = args.monthly_expenses as number;
    const yearsRemaining = args.years_remaining as number;
    const jobHours = args.job_hours_weekly as number | undefined;
    const jobRate = args.job_hourly_rate as number | undefined;

    // Calculate projections
    const currentMargin = monthlyIncome - monthlyExpenses;
    const additionalJobIncome = jobHours && jobRate ? jobHours * jobRate * 4 : 0;
    const projectedMonthlyMargin = currentMargin + additionalJobIncome;
    const months = yearsRemaining * 12;
    const finalBalance = projectedMonthlyMargin * months;

    // Simple probability model based on margin
    const probabilityDebtFree = Math.min(
      0.99,
      Math.max(0.01, 0.5 + (projectedMonthlyMargin / 500) * 0.3)
    );

    // Confidence interval (±20%)
    const confidenceLow = Math.round(finalBalance * 0.8);
    const confidenceHigh = Math.round(finalBalance * 1.2);

    span.setAttributes({
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
      years_remaining: yearsRemaining,
      additional_job_income: additionalJobIncome,
      final_balance: finalBalance,
      probability_debt_free: probabilityDebtFree,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'probability',
          type: 'metric',
          params: {
            title: 'Probabilité sans dette',
            value: `${Math.round(probabilityDebtFree * 100)}%`,
            trend: {
              direction: probabilityDebtFree >= 0.6 ? 'up' : 'down',
              value: Math.round(probabilityDebtFree * 100),
            },
          },
        },
        {
          id: 'balance',
          type: 'metric',
          params: {
            title: 'Balance projetée',
            value: finalBalance.toLocaleString('fr-FR'),
            unit: '€',
            subtitle: `Intervalle: ${confidenceLow.toLocaleString('fr-FR')}€ - ${confidenceHigh.toLocaleString('fr-FR')}€`,
          },
        },
        {
          id: 'details',
          type: 'text',
          params: {
            content: `**Détails projection:**\n- Marge mensuelle: ${projectedMonthlyMargin}€\n- Revenu job additionnel: ${additionalJobIncome}€/mois\n- Durée: ${months} mois`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        modelVersion: '1.0.0-formula',
      },
    };
  });
}

async function handlePredictLoanPayoff(args: Record<string, unknown>) {
  return trace('ml_loan_payoff', async (span) => {
    const loanAmount = args.loan_amount as number;
    const interestRate = (args.interest_rate as number) || 0.02;
    const monthlyPayment = args.monthly_payment as number;

    // Simple loan payoff calculation
    const monthlyRate = interestRate / 12;
    let balance = loanAmount;
    let months = 0;

    while (balance > 0 && months < 360) {
      const interest = balance * monthlyRate;
      const principal = monthlyPayment - interest;
      balance -= principal;
      months++;
    }

    span.setAttributes({
      loan_amount: loanAmount,
      interest_rate: interestRate,
      monthly_payment: monthlyPayment,
      months_to_payoff: months,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'months',
          type: 'metric',
          params: {
            title: 'Temps de remboursement',
            value: months,
            unit: 'mois',
            subtitle: `${Math.floor(months / 12)} ans et ${months % 12} mois`,
          },
        },
        {
          id: 'total_paid',
          type: 'metric',
          params: {
            title: 'Total remboursé',
            value: (months * monthlyPayment).toLocaleString('fr-FR'),
            unit: '€',
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleCreateBudgetChart(args: Record<string, unknown>) {
  return trace('create_budget_chart', async (span) => {
    const expenses = args.expenses as Expense[];
    const chartType = (args.chart_type as string) || 'doughnut';

    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

    span.setAttributes({
      chart_type: chartType,
      categories_count: expenses.length,
    });

    return {
      type: 'chart',
      params: {
        title: 'Répartition Budget',
        type: chartType,
        data: {
          labels: expenses.map((e) => e.category),
          datasets: [
            {
              data: expenses.map((e) => e.amount),
              backgroundColor: expenses.map((_, i) => colors[i % colors.length]),
            },
          ],
        },
        options: {
          plugins: {
            legend: { position: 'right' },
          },
        },
      },
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleSuggestRelatedJobs(args: Record<string, unknown>) {
  return trace('smart_job_suggestions', async (span) => {
    const diploma = args.diploma as string;
    const field = args.field as string;
    const skills = args.skills as string[] | undefined;
    const interests = args.interests as string[] | undefined;
    const networkingPriority = args.networking_priority as boolean | undefined;

    span.setAttributes({
      diploma,
      field,
      skills_count: skills?.length || 0,
      networking_priority: networkingPriority || false,
    });

    // Smart prompt engineering to get personalized job suggestions
    const systemPrompt = `Tu es un conseiller d'orientation spécialisé pour les étudiants français.

Ton rôle est de suggérer des jobs étudiants qui:
1. Sont en LIEN DIRECT avec le domaine d'études (pas juste "job alimentaire")
2. Permettent de RÉSEAUTER et construire des contacts professionnels
3. Apportent une VALEUR CV significative
4. Sont RÉALISTES pour un étudiant (temps partiel, flexible)

Pour chaque suggestion, explique:
- Pourquoi ce job est pertinent pour ce profil
- Comment il aide à réseauter dans le domaine
- Quel avantage concret pour le CV/carrière

Sois créatif mais réaliste. Évite les suggestions génériques comme "caissier" ou "serveur" sauf si vraiment pertinentes.`;

    const userPrompt = `Profil étudiant:
- Diplôme: ${diploma}
- Domaine: ${field}
${skills ? `- Compétences: ${skills.join(', ')}` : ''}
${interests ? `- Centres d'intérêt: ${interests.join(', ')}` : ''}
${networkingPriority ? '- PRIORITÉ: jobs qui permettent de réseauter!' : ''}

Propose 4 jobs étudiants adaptés à ce profil.
Pour chaque job, donne:
1. Nom du job
2. Pourquoi c'est pertinent (1-2 phrases)
3. Potentiel de networking (faible/moyen/fort)
4. Impact CV (faible/moyen/fort)
5. Taux horaire estimé

Format ta réponse en JSON comme ceci:
{
  "suggestions": [
    {
      "job": "Nom du job",
      "relevance": "Explication",
      "networking": "fort",
      "cv_impact": "moyen",
      "hourly_rate": 20,
      "platform": "Où trouver ce job"
    }
  ],
  "conseil_networking": "Un conseil personnalisé pour maximiser le networking"
}`;

    try {
      const { chat } = await import('../services/groq.js');
      const response = await chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.8 }
      );

      // Parse JSON response
      let suggestions: {
        suggestions: Array<{
          job: string;
          relevance: string;
          networking: string;
          cv_impact: string;
          hourly_rate: number;
          platform: string;
        }>;
        conseil_networking: string;
      };

      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch {
        // Fallback to structured suggestions based on field
        suggestions = generateFallbackSuggestions(field, diploma);
      }

      span.setAttributes({
        suggestions_count: suggestions.suggestions.length,
      });

      return {
        type: 'composite',
        components: [
          {
            id: 'jobs-table',
            type: 'table',
            params: {
              title: `Jobs adaptés à ${field}`,
              columns: [
                { key: 'job', label: 'Job' },
                { key: 'hourly_rate', label: '€/h' },
                { key: 'networking', label: 'Networking' },
                { key: 'cv_impact', label: 'Impact CV' },
                { key: 'platform', label: 'Où chercher' },
              ],
              rows: suggestions.suggestions.map((s) => ({
                job: s.job,
                hourly_rate: `${s.hourly_rate}€`,
                networking:
                  s.networking === 'fort' ? '🌟🌟🌟' : s.networking === 'moyen' ? '🌟🌟' : '🌟',
                cv_impact:
                  s.cv_impact === 'fort' ? '💼💼💼' : s.cv_impact === 'moyen' ? '💼💼' : '💼',
                platform: s.platform,
              })),
            },
          },
          {
            id: 'details',
            type: 'text',
            params: {
              content: `## Détails\n\n${suggestions.suggestions.map((s) => `### ${s.job}\n${s.relevance}`).join('\n\n')}\n\n---\n\n**💡 Conseil networking:** ${suggestions.conseil_networking}`,
              markdown: true,
            },
          },
          {
            id: 'action-explore',
            type: 'action',
            params: {
              type: 'button',
              variant: 'outline',
              label: "Explorer d'autres pistes",
              action: 'tool-call',
              toolName: 'suggest_related_jobs',
              params: { ...args, interests: [...(interests || []), 'autre piste'] },
            },
          },
        ],
        metadata: {
          traceId: getCurrentTraceId(),
          field,
          diploma,
        },
      };
    } catch (error) {
      console.error('LLM suggestion failed:', error);
      // Return fallback suggestions
      const fallback = generateFallbackSuggestions(field, diploma);
      return {
        type: 'table',
        params: {
          title: `Jobs suggérés pour ${field}`,
          columns: [
            { key: 'job', label: 'Job' },
            { key: 'hourly_rate', label: '€/h' },
            { key: 'networking', label: 'Networking' },
            { key: 'relevance', label: 'Pertinence' },
          ],
          rows: fallback.suggestions,
        },
        metadata: {
          traceId: getCurrentTraceId(),
          fallback: true,
        },
      };
    }
  });
}

// Fallback suggestions based on common fields
function generateFallbackSuggestions(field: string, _diploma: string) {
  const fieldLower = field.toLowerCase();

  const fieldSuggestions: Record<
    string,
    Array<{
      job: string;
      relevance: string;
      networking: string;
      cv_impact: string;
      hourly_rate: number;
      platform: string;
    }>
  > = {
    informatique: [
      {
        job: 'Dev freelance (Malt/Fiverr)',
        relevance: 'Pratique directe des compétences, portfolio',
        networking: 'moyen',
        cv_impact: 'fort',
        hourly_rate: 25,
        platform: 'Malt, Fiverr',
      },
      {
        job: 'Tuteur en programmation',
        relevance: 'Renforce tes acquis, contacts avec enseignants',
        networking: 'fort',
        cv_impact: 'moyen',
        hourly_rate: 20,
        platform: 'Superprof, Kelprof',
      },
      {
        job: 'Stage startup (temps partiel)',
        relevance: 'Réseau entrepreneurial, expérience concrète',
        networking: 'fort',
        cv_impact: 'fort',
        hourly_rate: 15,
        platform: 'Welcome to the Jungle',
      },
      {
        job: 'Community manager tech',
        relevance: 'Connaissance écosystème, veille techno',
        networking: 'moyen',
        cv_impact: 'moyen',
        hourly_rate: 15,
        platform: 'LinkedIn',
      },
    ],
    langues: [
      {
        job: 'Traducteur freelance',
        relevance: 'Pratique professionnelle, clients internationaux',
        networking: 'moyen',
        cv_impact: 'fort',
        hourly_rate: 18,
        platform: 'Upwork, Fiverr',
      },
      {
        job: 'Prof de langues en ligne',
        relevance: 'Contacts internationaux, pédagogie',
        networking: 'fort',
        cv_impact: 'moyen',
        hourly_rate: 20,
        platform: 'Preply, iTalki',
      },
      {
        job: 'Assistant événementiel international',
        relevance: 'Networking pro, pratique orale',
        networking: 'fort',
        cv_impact: 'moyen',
        hourly_rate: 12,
        platform: 'Agences événementielles',
      },
      {
        job: 'Guide touristique bilingue',
        relevance: 'Communication, culture, rencontres',
        networking: 'moyen',
        cv_impact: 'faible',
        hourly_rate: 15,
        platform: 'Offices tourisme',
      },
    ],
    droit: [
      {
        job: 'Assistant juridique cabinet',
        relevance: 'Expérience cabinet, réseau avocats',
        networking: 'fort',
        cv_impact: 'fort',
        hourly_rate: 15,
        platform: 'Barreau local, Indeed',
      },
      {
        job: 'Rédacteur juridique web',
        relevance: 'Vulgarisation, portfolio, visibilité',
        networking: 'moyen',
        cv_impact: 'moyen',
        hourly_rate: 18,
        platform: 'Malt, TextBroker',
      },
      {
        job: 'Permanence aide juridique',
        relevance: 'Expérience client, réseau associatif',
        networking: 'fort',
        cv_impact: 'moyen',
        hourly_rate: 0,
        platform: 'Associations, mairies',
      },
      {
        job: 'Tuteur en droit',
        relevance: 'Révision active, contacts étudiants',
        networking: 'moyen',
        cv_impact: 'faible',
        hourly_rate: 20,
        platform: 'Superprof',
      },
    ],
    psychologie: [
      {
        job: 'Assistant recherche labo',
        relevance: 'Méthodologie, réseau chercheurs',
        networking: 'fort',
        cv_impact: 'fort',
        hourly_rate: 12,
        platform: 'Universités',
      },
      {
        job: 'Animateur prévention santé',
        relevance: 'Terrain, réseau associatif santé',
        networking: 'fort',
        cv_impact: 'moyen',
        hourly_rate: 13,
        platform: 'Associations santé',
      },
      {
        job: 'Rédacteur articles psy',
        relevance: 'Veille scientifique, portfolio',
        networking: 'moyen',
        cv_impact: 'moyen',
        hourly_rate: 15,
        platform: 'Malt, médias santé',
      },
      {
        job: 'Soutien scolaire adapté',
        relevance: 'Approche individuelle, contacts parents/écoles',
        networking: 'moyen',
        cv_impact: 'moyen',
        hourly_rate: 18,
        platform: 'Complétude, Acadomia',
      },
    ],
  };

  // Find matching field or return generic suggestions
  const matchingField = Object.keys(fieldSuggestions).find(
    (f) => fieldLower.includes(f) || f.includes(fieldLower)
  );

  const suggestions = matchingField
    ? fieldSuggestions[matchingField]
    : [
        {
          job: 'Tuteur dans ta spécialité',
          relevance: 'Renforce tes acquis, réseau enseignants',
          networking: 'fort',
          cv_impact: 'moyen',
          hourly_rate: 18,
          platform: 'Superprof',
        },
        {
          job: 'Stage temps partiel',
          relevance: 'Expérience terrain, réseau pro',
          networking: 'fort',
          cv_impact: 'fort',
          hourly_rate: 12,
          platform: 'Welcome to the Jungle',
        },
        {
          job: 'Freelance dans ton domaine',
          relevance: 'Pratique concrète, portfolio',
          networking: 'moyen',
          cv_impact: 'fort',
          hourly_rate: 20,
          platform: 'Malt, Fiverr',
        },
        {
          job: 'Assistant de recherche',
          relevance: 'Méthodologie, réseau académique',
          networking: 'fort',
          cv_impact: 'fort',
          hourly_rate: 12,
          platform: 'Universités',
        },
      ];

  return {
    suggestions,
    conseil_networking: `Pour ${field}, privilégie les jobs qui te mettent en contact avec des professionnels du secteur. Les stages, même courts, et le tutorat sont excellents pour ça.`,
  };
}

async function handleGetTraces(args: Record<string, unknown>) {
  const traceId = args.trace_id as string | undefined;
  const url = getTraceUrl(traceId);

  return {
    type: 'link',
    params: {
      label: 'Voir traces Opik',
      url,
      description: 'Visualiser les traces de traitement dans Opik',
    },
  };
}

async function handleLogFeedback(args: Record<string, unknown>) {
  const feedback = args.feedback as 'thumbs_up' | 'thumbs_down';
  const traceId = (args.trace_id as string) || getCurrentTraceId() || '';
  const comment = args.comment as string | undefined;

  await logFeedback(traceId, feedback, comment);

  return {
    type: 'text',
    params: {
      content: `Merci pour votre feedback! ${feedback === 'thumbs_up' ? '👍' : '👎'}`,
      markdown: false,
    },
  };
}

/**
 * Handle analyze_student_profile - Mastra multi-agent workflow
 */
async function handleAnalyzeStudentProfile(args: Record<string, unknown>) {
  return trace('student_full_analysis_workflow', async (span) => {
    // Convert MCP args to StudentProfile format
    const profile: StudentProfile = {
      name: args.name as string | undefined,
      diploma: args.diploma as string | undefined,
      field: args.field as string | undefined,
      skills: (args.skills as string[]) || [],
      yearsRemaining: (args.years_remaining as number) || 3,
      incomes: (args.incomes as Array<{ source: string; amount: number }>) || [],
      expenses: (args.expenses as Array<{ category: string; amount: number }>) || [],
      maxWorkHours: (args.max_work_hours as number) || 15,
      minHourlyRate: (args.min_hourly_rate as number) || 11.65,
      hasLoan: (args.has_loan as boolean) || false,
      loanAmount: args.loan_amount as number | undefined,
    };

    span.setAttributes({
      student_name: profile.name || 'anonymous',
      skills_count: profile.skills.length,
      years_remaining: profile.yearsRemaining,
      has_loan: profile.hasLoan,
    });

    // Run the multi-agent workflow
    const result = await runStudentAnalysis(profile);

    span.setAttributes({
      budget_margin: result.budget.margin,
      jobs_found: result.jobs.length,
      optimizations_found: result.optimizations.length,
      projection_probability: result.projection.probabilityDebtFree,
      validation_passed: result.validation.passed,
    });

    // Return UI-compatible format
    return {
      type: 'composite',
      components: [
        // Budget metrics
        {
          id: 'budget-metrics',
          type: 'grid',
          params: {
            columns: 3,
            gap: '1rem',
            children: [
              {
                id: 'income',
                type: 'metric',
                params: {
                  title: 'Revenus',
                  value: result.budget.totalIncome,
                  unit: 'euro/mois',
                },
              },
              {
                id: 'expenses',
                type: 'metric',
                params: {
                  title: 'Depenses',
                  value: result.budget.totalExpenses,
                  unit: 'euro/mois',
                },
              },
              {
                id: 'margin',
                type: 'metric',
                params: {
                  title: 'Marge',
                  value: result.budget.margin,
                  unit: 'euro/mois',
                  trend: {
                    direction: result.budget.margin >= 0 ? 'up' : 'down',
                    value: Math.abs(result.budget.margin),
                  },
                },
              },
            ],
          },
        },
        // Jobs table
        {
          id: 'jobs-table',
          type: 'table',
          params: {
            title: 'Jobs Recommandes (Mastra JobMatcher)',
            columns: [
              { key: 'name', label: 'Job' },
              { key: 'hourlyRate', label: 'euro/h' },
              { key: 'matchScore', label: 'Match' },
              { key: 'coBenefit', label: 'Co-benefice' },
            ],
            rows: result.jobs.map((j) => ({
              name: j.name,
              hourlyRate: j.hourlyRate,
              matchScore: `${Math.round(j.matchScore * 100)}%`,
              coBenefit: j.coBenefit || '-',
            })),
          },
        },
        // Optimizations table
        {
          id: 'optimizations-table',
          type: 'table',
          params: {
            title: 'Optimisations Budget',
            columns: [
              { key: 'expense', label: 'Depense' },
              { key: 'solution', label: 'Solution' },
              { key: 'savingsPct', label: 'Economie' },
              { key: 'potentialSavings', label: 'Gain/mois' },
            ],
            rows: result.optimizations.map((o) => ({
              expense: o.expense,
              solution: o.solution,
              savingsPct: `${Math.round(o.savingsPct * 100)}%`,
              potentialSavings: `${o.potentialSavings}euro`,
            })),
          },
        },
        // Projection metrics
        {
          id: 'projection-metrics',
          type: 'grid',
          params: {
            columns: 2,
            gap: '1rem',
            children: [
              {
                id: 'probability',
                type: 'metric',
                params: {
                  title: 'Probabilite sans dette',
                  value: `${result.projection.probabilityDebtFree}%`,
                  trend: {
                    direction: result.projection.probabilityDebtFree >= 60 ? 'up' : 'down',
                    value: result.projection.probabilityDebtFree,
                  },
                },
              },
              {
                id: 'balance',
                type: 'metric',
                params: {
                  title: 'Balance projetee',
                  value: result.projection.finalBalance.toLocaleString('fr-FR'),
                  unit: 'euro',
                  subtitle: `Intervalle: ${result.projection.confidenceInterval.low.toLocaleString('fr-FR')}euro - ${result.projection.confidenceInterval.high.toLocaleString('fr-FR')}euro`,
                },
              },
            ],
          },
        },
        // Synthesis
        {
          id: 'synthesis',
          type: 'text',
          params: {
            content: result.synthesis,
            markdown: true,
          },
        },
        // Validation status
        {
          id: 'validation',
          type: 'text',
          params: {
            content: result.validation.passed
              ? `**Guardian Validation**: Passe (confiance: ${Math.round(result.validation.confidence * 100)}%)`
              : `**Guardian Validation**: Echec - ${result.validation.issues.join(', ')}`,
            markdown: true,
          },
        },
        // Opik link
        {
          id: 'opik-link',
          type: 'link',
          params: {
            label: 'Voir traces Opik',
            url: getTraceUrl(),
            description: 'Visualiser le workflow multi-agent dans Opik',
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        workflowVersion: '1.0.0-mastra',
        agentsUsed: ['budget-coach', 'job-matcher', 'projection-ml', 'guardian'],
        validationPassed: result.validation.passed,
      },
    };
  });
}
