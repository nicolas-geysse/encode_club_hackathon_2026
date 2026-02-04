import { createSignal, createEffect, Show, onCleanup } from 'solid-js';
import { Button } from '~/components/ui/Button';
import { Textarea } from '~/components/ui/Textarea';
import { Mic, Square, Loader2, Send } from 'lucide-solid';
import { cn } from '~/lib/cn';
import { createLogger } from '~/lib/logger';

const logger = createLogger('ChatInput');

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
      // Reset height
      if (textareaRef) {
        textareaRef.style.height = 'auto';
      }
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
      logger.error('Microphone error', { error: err });
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
      logger.error('STT error', { error: err });
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
    <form class="w-full bg-transparent" onSubmit={handleSubmit}>
      <div class="relative flex items-end gap-2 p-1.5 rounded-3xl bg-secondary/30 border border-white/10 shadow-sm transition-all focus-within:bg-secondary/50 focus-within:shadow-md">
        {/* Microphone button */}
        <Button
          type="button"
          onClick={toggleRecording}
          disabled={isDisabled()}
          size="icon"
          variant="ghost"
          class={cn(
            'rounded-full h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground hover:bg-background/50',
            isRecording() &&
              'text-red-500 hover:text-red-600 bg-red-100/10 hover:bg-red-100/20 animate-pulse'
          )}
          title={
            isRecording() ? 'Stop recording' : isProcessing() ? 'Processing...' : 'Voice input'
          }
        >
          {/* Audio level ring */}
          <Show when={isRecording()}>
            <div
              class="absolute inset-0 rounded-full border-2 border-red-500/50"
              style={{
                transform: `scale(${1 + audioLevel() * 0.3})`,
                opacity: 0.5,
                transition: 'transform 50ms ease-out',
              }}
            />
          </Show>

          <Show when={!isProcessing()} fallback={<Loader2 class="h-5 w-5 animate-spin" />}>
            <Show when={!isRecording()} fallback={<Square class="h-4 w-4 fill-current" />}>
              <Mic class="h-5 w-5" />
            </Show>
          </Show>
        </Button>

        {/* Text input */}
        <Textarea
          ref={(el: HTMLTextAreaElement) => (textareaRef = el)}
          class="flex-1 bg-transparent border-none shadow-none resize-none min-h-[44px] max-h-32 py-3 px-2 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none text-base"
          placeholder={props.placeholder || 'Type a message...'}
          value={text()}
          onInput={(e: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
            setText(e.currentTarget.value);
            // Auto-grow
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
          }}
          onKeyDown={handleKeyDown}
          disabled={isDisabled()}
          rows={1}
          autofocus
        />

        {/* Send button */}
        <Button
          type="submit"
          size="icon"
          class={cn(
            'rounded-full h-10 w-10 shrink-0 transition-all duration-200',
            canSend()
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md scale-100'
              : 'bg-transparent text-muted-foreground hover:bg-background/50 scale-90 opacity-70'
          )}
          disabled={!canSend()}
        >
          <Send class="h-5 w-5" />
        </Button>
      </div>

      {/* Recording indicator */}
      <Show when={isRecording()}>
        <div class="text-center mt-2">
          <span class="text-xs text-red-500 font-medium flex items-center justify-center gap-1.5 bg-red-500/10 py-1 px-3 rounded-full inline-flex mx-auto">
            <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Recording...
          </span>
        </div>
      </Show>
    </form>
  );
}
