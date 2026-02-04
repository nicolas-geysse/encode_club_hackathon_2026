/**
 * VoiceInput Component
 *
 * A microphone button that records audio and transcribes it using Whisper.
 * Uses the MediaRecorder API for audio capture and the voice API for transcription.
 */

import { createSignal, onCleanup, Show } from 'solid-js';
import { transcribeAudio, blobToBase64 } from '~/lib/api';
import { Mic, Square, Loader2 } from 'lucide-solid';
import { createLogger } from '~/lib/logger';

const logger = createLogger('VoiceInput');

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
          setError('No audio recorded');
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
            setError('No speech detected. Try again!');
          }
        } catch (err) {
          logger.error('Transcription error', { error: err });
          setError(err instanceof Error ? err.message : 'Transcription error');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.onerror = (event) => {
        logger.error('MediaRecorder error', { event });
        setError('Recording error');
        setIsRecording(false);
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
    } catch (err) {
      logger.error('Failed to start recording', { error: err });
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setPermissionDenied(true);
        setError('Microphone access denied. Enable it in your browser settings.');
      } else {
        setError('Unable to access microphone');
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
                ? 'bg-muted text-muted-foreground cursor-wait'
                : 'bg-muted hover:bg-muted/80 text-foreground focus:ring-primary'
          }
          ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        title={isRecording() ? 'Stop' : isTranscribing() ? 'Transcribing...' : 'Speak'}
      >
        <Show when={!isTranscribing()} fallback={<Loader2 class="w-5 h-5 animate-spin" />}>
          <Show when={!isRecording()} fallback={<Square class="w-5 h-5 fill-current" />}>
            <Mic class="w-5 h-5" />
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
          <p class="font-medium mb-1">Microphone blocked</p>
          <p>Click the padlock icon in the address bar to allow access.</p>
        </div>
      </Show>
    </div>
  );
}

export default VoiceInput;
