/**
 * Chat Input Component
 *
 * Text input with send button and optional voice input.
 * Uses Groq Whisper for speech-to-text.
 */

import { createSignal, createEffect, Show, onCleanup } from 'solid-js';

interface ChatInputProps {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Ref to expose focus method */
  ref?: (el: { focus: () => void }) => void;
}

export function ChatInput(props: ChatInputProps) {
  const [text, setText] = createSignal('');
  const [isRecording, setIsRecording] = createSignal(false);
  const [isProcessing, setIsProcessing] = createSignal(false);
  const [audioLevel, setAudioLevel] = createSignal(0);

  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let animationFrame: number | null = null;
  let textareaRef: HTMLTextAreaElement | null = null;

  // Expose focus method to parent via ref
  createEffect(() => {
    const refCallback = props.ref;
    if (refCallback) {
      refCallback({
        focus: () => {
          textareaRef?.focus();
        },
      });
    }
  });

  // Cleanup on unmount
  onCleanup(() => {
    stopRecording();
    if (audioContext) {
      audioContext.close();
    }
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const message = text().trim();
    if (message && !props.disabled && !isProcessing()) {
      props.onSend(message);
      setText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const updateAudioLevel = () => {
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    setAudioLevel(average / 255);

    if (isRecording()) {
      animationFrame = requestAnimationFrame(updateAudioLevel);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Setup audio analysis for visualization
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      // Setup MediaRecorder
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      }

      mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        await sendToSTT(audioBlob);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      updateAudioLevel();
    } catch (err) {
      console.error('[ChatInput] Microphone error:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setIsRecording(false);
    setAudioLevel(0);

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  const sendToSTT = async (audioBlob: Blob) => {
    setIsProcessing(true);

    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transcribe',
          audio_base64: base64,
          format: 'webm',
          language: 'en',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Transcription failed');
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.message || 'Transcription failed');
      }

      const transcribedText = data.text || '';

      if (transcribedText.trim()) {
        // Append to existing text or replace
        const currentText = text().trim();
        if (currentText) {
          setText(currentText + ' ' + transcribedText);
        } else {
          setText(transcribedText);
        }
      }
    } catch (err) {
      console.error('[ChatInput] STT error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording()) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const isDisabled = () => props.disabled || isProcessing();
  const canSend = () => text().trim() && !isDisabled();

  return (
    <form
      class="border-t border-slate-200 dark:border-slate-700 bg-[#FAFBFC] dark:bg-slate-800 p-4"
      onSubmit={handleSubmit}
    >
      <div class="flex gap-2 items-end max-w-5xl mx-auto">
        {/* Microphone button */}
        <button
          type="button"
          onClick={toggleRecording}
          disabled={isDisabled()}
          class={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all relative ${
            isRecording()
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : isProcessing()
                ? 'bg-amber-500 text-white cursor-wait'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
          } ${isDisabled() && !isProcessing() ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={
            isRecording() ? 'Stop recording' : isProcessing() ? 'Processing...' : 'Voice input'
          }
        >
          {/* Audio level ring */}
          <Show when={isRecording()}>
            <div
              class="absolute inset-0 rounded-full border-2 border-red-300"
              style={{
                transform: `scale(${1 + audioLevel() * 0.3})`,
                opacity: 0.5,
                transition: 'transform 50ms ease-out',
              }}
            />
          </Show>

          <Show
            when={isProcessing()}
            fallback={
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <Show
                  when={isRecording()}
                  fallback={
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  }
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                  />
                </Show>
              </svg>
            }
          >
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
          </Show>
        </button>

        {/* Text input */}
        <div class="flex-1 relative">
          <textarea
            ref={(el) => (textareaRef = el)}
            class="input-field resize-none min-h-[44px] max-h-32 py-3 pr-4 w-full"
            placeholder={props.placeholder || 'Type a message...'}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled()}
            rows={1}
            autofocus
          />
        </div>

        {/* Send button */}
        <button
          type="submit"
          class={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            canSend()
              ? 'bg-primary-600 hover:bg-primary-700 text-white'
              : 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
          disabled={!canSend()}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>

      {/* Recording indicator */}
      <Show when={isRecording()}>
        <div class="text-center mt-2">
          <span class="text-xs text-red-500 flex items-center justify-center gap-1">
            <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Recording... Click mic to stop
          </span>
        </div>
      </Show>
    </form>
  );
}
