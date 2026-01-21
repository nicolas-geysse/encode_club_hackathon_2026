/**
 * Voice Bruno Bar Component
 *
 * Expandable voice interface for the Suivi page.
 * Allows voice commands to update missions, log energy, and get progress summaries.
 *
 * Features:
 * - Mic button using VoiceInput component
 * - Text display for transcript and response
 * - Text-to-speech for Bruno's responses
 * - Processes extractedData to update missions/energy
 */

import { createSignal, Show, onCleanup } from 'solid-js';
import { VoiceInput } from '~/components/VoiceInput';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Mic, X, MessageSquare, Volume2, VolumeX, Loader2 } from 'lucide-solid';
import type { Mission } from './MissionCard';
import { cn } from '~/lib/cn';

interface VoiceBrunoBarProps {
  profileId: string;
  missions: Mission[];
  currentEnergy: number;
  onMissionUpdate: (id: string, updates: Partial<Mission>) => void;
  onEnergyUpdate: (week: number, level: number) => void;
  onDataChanged?: () => void;
}

// Bruno avatar (using emoji for simplicity)
const BRUNO_AVATAR = '🧑‍💼';

export function VoiceBrunoBar(props: VoiceBrunoBarProps) {
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [isProcessing, setIsProcessing] = createSignal(false);
  const [transcript, setTranscript] = createSignal<string | null>(null);
  const [response, setResponse] = createSignal<string | null>(null);
  const [isSpeaking, setIsSpeaking] = createSignal(false);
  const [ttsEnabled, setTtsEnabled] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Track audio playback
  let currentAudio: HTMLAudioElement | null = null;

  onCleanup(() => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  });

  // Text-to-speech using Groq TTS API
  const speak = async (text: string) => {
    if (!ttsEnabled()) return;

    // Stop any current playback
    stopSpeaking();

    setIsSpeaking(true);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.error('[TTS] API error:', response.status);
        setIsSpeaking(false);
        return;
      }

      // Get audio blob and create URL
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play audio
      currentAudio = new Audio(audioUrl);
      currentAudio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
      };
      currentAudio.onerror = () => {
        console.error('[TTS] Audio playback error');
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
      };

      await currentAudio.play();
    } catch (err) {
      console.error('[TTS] Error:', err);
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    setIsSpeaking(false);
  };

  // Process voice transcript through chat API
  const handleTranscript = async (text: string) => {
    setTranscript(text);
    setError(null);
    setIsProcessing(true);

    try {
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          step: 'complete', // Required by API, but conversation mode ignores it
          profileId: props.profileId,
          mode: 'conversation',
          // Include context about current state
          context: {
            currentEnergy: props.currentEnergy,
            activeMissions: props.missions
              .filter((m) => m.status === 'active')
              .map((m) => ({
                id: m.id,
                title: m.title,
                progress: m.progress,
                hoursCompleted: m.hoursCompleted,
                weeklyHours: m.weeklyHours,
              })),
          },
        }),
      });

      if (!chatResponse.ok) {
        const errorData = await chatResponse.json().catch(() => ({}));
        console.error('[VoiceBruno] Chat API error:', chatResponse.status, errorData);
        throw new Error('Erreur de communication avec Bruno');
      }

      const data = await chatResponse.json();

      // Set Bruno's response (API returns 'response', not 'message')
      const brunoResponse = data.response || "Je n'ai pas compris, pouvez-vous reformuler?";
      setResponse(brunoResponse);

      // Speak the response
      if (brunoResponse) {
        speak(brunoResponse);
      }

      // Process extracted data (mission updates, energy updates, etc.)
      if (data.extractedData) {
        processExtractedData(data.extractedData);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMsg);
      setResponse(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Process extracted data from chat response
  const processExtractedData = (
    data: Record<string, unknown> & {
      missionUpdate?: { id: string; status?: string; hoursCompleted?: number };
      energyUpdate?: { level: number; week?: number };
      completeActiveMission?: string; // mission title partial match
    }
  ) => {
    // Handle mission completion by title (voice command: "J'ai termine la mission X")
    if (data.completeActiveMission) {
      const titleMatch = data.completeActiveMission.toLowerCase();
      const mission = props.missions.find(
        (m) => m.status === 'active' && m.title.toLowerCase().includes(titleMatch)
      );
      if (mission) {
        props.onMissionUpdate(mission.id, {
          status: 'completed',
          progress: 100,
          hoursCompleted: mission.weeklyHours,
          earningsCollected: mission.weeklyEarnings,
        });
        props.onDataChanged?.();
      }
    }

    // Handle mission status update
    if (data.missionUpdate) {
      const { id, ...updates } = data.missionUpdate;
      props.onMissionUpdate(id, updates as Partial<Mission>);
      props.onDataChanged?.();
    }

    // Handle energy update (voice command: "Mon energie est a X" or "Je suis fatigue")
    if (data.energyUpdate) {
      const week = data.energyUpdate.week || 1; // Default to current week
      props.onEnergyUpdate(week, data.energyUpdate.level);
      props.onDataChanged?.();
    }
  };

  const handleClose = () => {
    stopSpeaking();
    setIsExpanded(false);
    setTranscript(null);
    setResponse(null);
    setError(null);
  };

  // Use Show for conditional rendering (SolidJS best practice)
  return (
    <Show
      when={isExpanded()}
      fallback={
        <Card class="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent class="p-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-2xl">
                {BRUNO_AVATAR}
              </div>
              <div>
                <h4 class="font-semibold text-foreground">Besoin d'aide?</h4>
                <p class="text-sm text-muted-foreground">Parlez a Bruno pour gerer vos missions</p>
              </div>
            </div>
            <Button onClick={() => setIsExpanded(true)} class="gap-2">
              <Mic class="h-4 w-4" />
              Parler
            </Button>
          </CardContent>
        </Card>
      }
    >
      <Card class="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent class="p-4">
          {/* Header */}
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div
                class={cn(
                  'h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-2xl',
                  isSpeaking() && 'animate-pulse'
                )}
              >
                {BRUNO_AVATAR}
              </div>
              <div>
                <h4 class="font-semibold text-foreground">Bruno</h4>
                <p class="text-xs text-muted-foreground">Assistant vocal</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              {/* TTS Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (isSpeaking()) stopSpeaking();
                  setTtsEnabled(!ttsEnabled());
                }}
                title={ttsEnabled() ? 'Desactiver la voix' : 'Activer la voix'}
              >
                {ttsEnabled() ? (
                  <Volume2 class="h-4 w-4 text-primary" />
                ) : (
                  <VolumeX class="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                <X class="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Voice Input Area */}
          <div class="flex items-center gap-4 mb-4">
            <VoiceInput onTranscript={handleTranscript} disabled={isProcessing()} />
            <div class="flex-1 min-h-[48px] bg-background/50 rounded-lg p-3 flex items-center">
              <Show when={isProcessing()}>
                <div class="flex items-center gap-2 text-muted-foreground">
                  <Loader2 class="h-4 w-4 animate-spin" />
                  <span class="text-sm">Bruno reflechit...</span>
                </div>
              </Show>
              <Show when={!isProcessing() && transcript()}>
                <div class="text-sm">
                  <span class="text-muted-foreground">Vous: </span>
                  <span class="text-foreground">{transcript()}</span>
                </div>
              </Show>
              <Show when={!isProcessing() && !transcript()}>
                <span class="text-sm text-muted-foreground">Cliquez sur le micro et parlez...</span>
              </Show>
            </div>
          </div>

          {/* Response Area */}
          <Show when={response() || error()}>
            <div
              class={cn(
                'p-3 rounded-lg',
                error()
                  ? 'bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
                  : 'bg-primary/10 border border-primary/20'
              )}
            >
              <div class="flex items-start gap-2">
                <MessageSquare
                  class={cn('h-4 w-4 mt-0.5', error() ? 'text-red-500' : 'text-primary')}
                />
                <p
                  class={cn(
                    'text-sm',
                    error() ? 'text-red-700 dark:text-red-300' : 'text-foreground'
                  )}
                >
                  {error() || response()}
                </p>
              </div>
            </div>
          </Show>

          {/* Quick Commands Hint */}
          <div class="mt-4 pt-3 border-t border-border/50">
            <p class="text-xs text-muted-foreground mb-2">Exemples de commandes:</p>
            <div class="flex flex-wrap gap-2">
              <span class="text-xs bg-muted px-2 py-1 rounded">"J'ai termine le tutorat"</span>
              <span class="text-xs bg-muted px-2 py-1 rounded">"Je suis fatigue"</span>
              <span class="text-xs bg-muted px-2 py-1 rounded">"Comment ca avance?"</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Show>
  );
}
