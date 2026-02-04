/**
 * Voice Input Tools
 *
 * MCP tools for speech-to-text transcription using Groq Whisper API.
 * Enables voice-based interaction with the Student Life Navigator.
 */

import { trace, getCurrentTraceId } from '../services/opik.js';
import { transcribeAudio, transcribeAndAnalyze } from '../services/groq.js';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const VOICE_TOOLS = {
  transcribe_audio: {
    description: 'Transcribe audio to text using Whisper AI. Supports French and English.',
    inputSchema: {
      type: 'object',
      properties: {
        audio_base64: {
          type: 'string',
          description: 'Base64 encoded audio data',
        },
        audio_format: {
          type: 'string',
          enum: ['wav', 'webm', 'mp3', 'ogg', 'm4a'],
          description: 'Audio file format',
          default: 'webm',
        },
        language: {
          type: 'string',
          description: 'Language code (fr, en, etc.)',
          default: 'fr',
        },
      },
      required: ['audio_base64'],
    },
  },

  voice_to_analysis: {
    description: 'Transcribe audio and analyze content for budget, goal, or general questions.',
    inputSchema: {
      type: 'object',
      properties: {
        audio_base64: {
          type: 'string',
          description: 'Base64 encoded audio data',
        },
        audio_format: {
          type: 'string',
          enum: ['wav', 'webm', 'mp3', 'ogg', 'm4a'],
          description: 'Audio file format',
          default: 'webm',
        },
        context: {
          type: 'string',
          enum: ['budget', 'goal', 'question'],
          description:
            'Analysis context: budget (extract income/expenses), goal (extract financial goal), question (general Q&A)',
          default: 'question',
        },
      },
      required: ['audio_base64'],
    },
  },
};

// ============================================
// TOOL HANDLERS
// ============================================

/**
 * Handle transcribe_audio tool
 */
export async function handleTranscribeAudio(args: Record<string, unknown>) {
  return trace('tool_transcribe_audio', async (span) => {
    const audioBase64 = args.audio_base64 as string;
    const format = (args.audio_format as string) || 'webm';
    const language = (args.language as string) || 'fr';

    span.setAttributes({
      'voice.format': format,
      'voice.language': language,
      'voice.audio_size_base64': audioBase64.length,
    });

    // Decode base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Call Whisper transcription
    const result = await transcribeAudio(audioBuffer, {
      language,
      filename: `recording.${format}`,
    });

    span.setAttributes({
      'voice.transcript_length': result.text.length,
      'voice.detected_language': result.language,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'transcript',
          type: 'text',
          params: {
            content: result.text,
            markdown: false,
          },
        },
        {
          id: 'metadata',
          type: 'text',
          params: {
            content: `*Langue: ${result.language}${result.duration ? ` | Durée: ${result.duration.toFixed(1)}s` : ''}*`,
            markdown: true,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        model: 'whisper-large-v3-turbo',
        language: result.language,
        duration: result.duration,
      },
    };
  });
}

/**
 * Handle voice_to_analysis tool
 */
export async function handleVoiceToAnalysis(args: Record<string, unknown>) {
  return trace('tool_voice_to_analysis', async (span) => {
    const audioBase64 = args.audio_base64 as string;
    const format = (args.audio_format as string) || 'webm';
    const context = (args.context as 'budget' | 'goal' | 'question') || 'question';

    span.setAttributes({
      'voice.format': format,
      'voice.context': context,
    });

    // Decode base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Transcribe and analyze
    const result = await transcribeAndAnalyze(audioBuffer, context);

    span.setAttributes({
      'voice.transcript_length': result.transcript.length,
      'voice.has_extracted_data': !!result.extractedData,
    });

    // Build response based on context
    const components: unknown[] = [
      {
        id: 'transcript',
        type: 'text',
        params: {
          content: `**Ce que j'ai compris:**\n\n> ${result.transcript}`,
          markdown: true,
        },
      },
    ];

    // Add analysis
    components.push({
      id: 'analysis',
      type: 'text',
      params: {
        content: `**Analyse:**\n\n${result.analysis}`,
        markdown: true,
      },
    });

    // If we extracted structured data, show it
    if (result.extractedData) {
      if (context === 'goal' && result.extractedData.goalAmount) {
        components.push({
          id: 'extracted-goal',
          type: 'grid',
          params: {
            columns: 2,
            gap: '1rem',
            children: [
              {
                id: 'goal-amount',
                type: 'metric',
                params: {
                  title: 'Goal',
                  value: result.extractedData.goalAmount,
                  unit: '€',
                },
              },
              {
                id: 'goal-deadline',
                type: 'metric',
                params: {
                  title: 'Deadline',
                  value: result.extractedData.deadline || 'Not specified',
                },
              },
            ],
          },
        });
      }

      if (context === 'budget' && (result.extractedData.incomes || result.extractedData.expenses)) {
        components.push({
          id: 'extracted-budget',
          type: 'text',
          params: {
            content: `**Extracted data:**\n\`\`\`json\n${JSON.stringify(result.extractedData, null, 2)}\n\`\`\``,
            markdown: true,
          },
        });
      }
    }

    // Add action button based on context
    if (context === 'goal' && result.extractedData?.goalAmount) {
      components.push({
        id: 'action-create-goal',
        type: 'action',
        params: {
          type: 'button',
          variant: 'primary',
          label: 'Create this goal',
          action: 'tool-call',
          toolName: 'create_goal_plan',
          params: {
            goalAmount: result.extractedData.goalAmount,
            goalName: result.extractedData.goalName || 'My goal',
            goalDeadline: result.extractedData.deadline,
          },
        },
      });
    }

    return {
      type: 'composite',
      components,
      metadata: {
        traceId: getCurrentTraceId(),
        context,
        extractedData: result.extractedData,
      },
    };
  });
}

/**
 * Handle voice tool by name
 */
export async function handleVoiceTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'transcribe_audio':
      return handleTranscribeAudio(args);
    case 'voice_to_analysis':
      return handleVoiceToAnalysis(args);
    default:
      throw new Error(`Unknown voice tool: ${name}`);
  }
}
