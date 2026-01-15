/**
 * VoiceInput Component
 *
 * A microphone button that records audio and transcribes it using Whisper.
 * Uses the MediaRecorder API for audio capture and the voice API for transcription.
 */

import { createSignal, onCleanup, Show } from 'solid-js';
import { transcribeAudio, blobToBase64 } from '~/lib/api';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInput(props: VoiceInputProps) {
  const [isRecording, setIsRecording] = createSignal(false);
  const [isTranscribing, setIsTranscribing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [permissionDenied, setPermissionDenied] = createSignal(false);

  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: BlobPart[] = [];

  // Cleanup on unmount
  onCleanup(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
  });

  async function startRecording() {
    setError(null);
    setPermissionDenied(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      // Determine best supported format
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());

        if (audioChunks.length === 0) {
          setError('Aucun audio enregistre');
          return;
        }

        setIsTranscribing(true);
        try {
          const audioBlob = new Blob(audioChunks, { type: mimeType });
          const base64 = await blobToBase64(audioBlob);

          const result = await transcribeAudio(base64, 'webm', 'fr');
          if (result.text && result.text.trim()) {
            props.onTranscript(result.text.trim());
          } else {
            setError("Pas de parole detectee. Reessaie !");
          }
        } catch (err) {
          console.error('Transcription error:', err);
          setError(err instanceof Error ? err.message : 'Erreur de transcription');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError("Erreur d'enregistrement");
        setIsRecording(false);
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPermissionDenied(true);
        setError("Acces au micro refuse. Active-le dans les parametres du navigateur.");
      } else {
        setError("Impossible d'acceder au microphone");
      }
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setIsRecording(false);
  }

  function handleClick() {
    if (props.disabled || isTranscribing()) return;

    if (isRecording()) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  return (
    <div class="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={props.disabled || isTranscribing()}
        class={`
          flex items-center justify-center
          w-12 h-12 rounded-full
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2
          ${
            isRecording()
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse focus:ring-red-500'
              : isTranscribing()
                ? 'bg-slate-300 text-slate-500 cursor-wait'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600 focus:ring-primary-500'
          }
          ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        title={isRecording() ? 'Arreter' : isTranscribing() ? 'Transcription...' : 'Parler'}
      >
        <Show
          when={!isTranscribing()}
          fallback={
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          }
        >
          <Show
            when={!isRecording()}
            fallback={
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            }
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </Show>
        </Show>
      </button>

      {/* Recording indicator */}
      <Show when={isRecording()}>
        <span class="absolute -top-1 -right-1 flex h-3 w-3">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
      </Show>

      {/* Error message */}
      <Show when={error()}>
        <div class="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1 bg-red-100 text-red-700 text-xs rounded-lg whitespace-nowrap shadow-sm">
          {error()}
        </div>
      </Show>

      {/* Permission denied help */}
      <Show when={permissionDenied()}>
        <div class="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg max-w-xs shadow-sm">
          <p class="font-medium mb-1">Micro bloque</p>
          <p>Clique sur l'icone de cadenas dans la barre d'adresse pour autoriser l'acces.</p>
        </div>
      </Show>
    </div>
  );
}

export default VoiceInput;
