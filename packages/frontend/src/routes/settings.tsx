/**
 * Settings Page
 *
 * Allows users to configure API keys for LLM and observability services.
 * Keys are stored in localStorage and passed to API routes via headers.
 */

import { createSignal, onMount, For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/Card';
import { toast } from '~/lib/notificationStore';
import { ArrowLeft, Eye, EyeOff, Check, X, ExternalLink } from 'lucide-solid';

// API key configuration
const API_KEYS = [
  {
    id: 'LLM_API_KEY',
    name: 'LLM API Key',
    description: 'Required for AI chat (supports Mistral, Groq, OpenAI)',
    required: true,
    placeholder: 'your-api-key...',
    link: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'GROQ_API_KEY',
    name: 'Groq API Key (Whisper)',
    description: 'Optional - for voice transcription via Groq Whisper',
    required: false,
    placeholder: 'gsk_...',
    link: 'https://console.groq.com/keys',
  },
  {
    id: 'OPIK_API_KEY',
    name: 'Opik API Key',
    description: 'Required for AI observability and feedback tracking',
    required: true,
    placeholder: 'op_...',
    link: 'https://www.comet.com/opik',
  },
  {
    id: 'OPIK_WORKSPACE',
    name: 'Opik Workspace',
    description: 'Your Opik workspace name',
    required: true,
    placeholder: 'my-workspace',
    link: 'https://www.comet.com/opik',
  },
  {
    id: 'GOOGLE_MAPS_API_KEY',
    name: 'Google Maps API Key',
    description: 'Optional - enables job location features',
    required: false,
    placeholder: 'AIza...',
    link: 'https://console.cloud.google.com/apis/credentials',
  },
] as const;

const STORAGE_KEY = 'stride_api_keys';

interface StoredKeys {
  [key: string]: string;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = createSignal<StoredKeys>({});
  const [showKeys, setShowKeys] = createSignal<Record<string, boolean>>({});
  const [envStatus, setEnvStatus] = createSignal<Record<string, boolean>>({});

  // Load saved keys and check env status on mount
  onMount(async () => {
    // Load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setKeys(JSON.parse(saved));
      } catch {
        // Ignore parse errors
      }
    }

    // Check which keys are configured via .env (server-side)
    try {
      const response = await fetch('/api/settings/status');
      if (response.ok) {
        const data = await response.json();
        setEnvStatus(data.configured || {});
      }
    } catch {
      // API not available yet, ignore
    }
  });

  const handleSave = (keyId: string, value: string) => {
    const newKeys = { ...keys(), [keyId]: value };
    setKeys(newKeys);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newKeys));
  };

  const handleSaveAll = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys()));
    toast.success('Settings saved', 'API keys have been saved locally.');
  };

  const handleClearKey = (keyId: string) => {
    const newKeys = { ...keys() };
    delete newKeys[keyId];
    setKeys(newKeys);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newKeys));
  };

  const toggleShowKey = (keyId: string) => {
    setShowKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const isConfigured = (keyId: string) => {
    return !!keys()[keyId] || envStatus()[keyId];
  };

  const getConfigSource = (keyId: string) => {
    if (keys()[keyId]) return 'localStorage';
    if (envStatus()[keyId]) return '.env';
    return null;
  };

  return (
    <div class="container max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div class="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft class="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 class="text-2xl font-bold">Settings</h1>
          <p class="text-muted-foreground">Configure API keys for AI features</p>
        </div>
      </div>

      {/* Info Card */}
      <Card class="mb-6 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
        <CardContent class="pt-4">
          <p class="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> Keys configured here are stored in your browser's localStorage.
            They override any keys set in the server's{' '}
            <code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">.env</code> file. Keys are sent
            securely with each API request.
          </p>
        </CardContent>
      </Card>

      {/* API Keys */}
      <div class="space-y-4">
        <For each={API_KEYS}>
          {(keyConfig) => (
            <Card>
              <CardHeader class="pb-3">
                <div class="flex items-center justify-between">
                  <div>
                    <CardTitle class="text-base flex items-center gap-2">
                      {keyConfig.name}
                      <Show when={keyConfig.required}>
                        <span class="text-xs text-destructive">*required</span>
                      </Show>
                    </CardTitle>
                    <CardDescription class="text-sm">{keyConfig.description}</CardDescription>
                  </div>
                  <div class="flex items-center gap-2">
                    <Show
                      when={isConfigured(keyConfig.id)}
                      fallback={
                        <span class="flex items-center gap-1 text-xs text-muted-foreground">
                          <X class="h-3 w-3 text-destructive" />
                          Not configured
                        </span>
                      }
                    >
                      <span class="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <Check class="h-3 w-3" />
                        {getConfigSource(keyConfig.id)}
                      </span>
                    </Show>
                  </div>
                </div>
              </CardHeader>
              <CardContent class="pt-0">
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <Input
                      type={showKeys()[keyConfig.id] ? 'text' : 'password'}
                      value={keys()[keyConfig.id] || ''}
                      onInput={(e) => handleSave(keyConfig.id, e.currentTarget.value)}
                      placeholder={keyConfig.placeholder}
                      class="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey(keyConfig.id)}
                      class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Show when={showKeys()[keyConfig.id]} fallback={<Eye class="h-4 w-4" />}>
                        <EyeOff class="h-4 w-4" />
                      </Show>
                    </button>
                  </div>
                  <Show when={keys()[keyConfig.id]}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearKey(keyConfig.id)}
                      class="text-destructive hover:text-destructive"
                    >
                      Clear
                    </Button>
                  </Show>
                  <a
                    href={keyConfig.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center justify-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                    title="Get API key"
                  >
                    <ExternalLink class="h-4 w-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
        </For>
      </div>

      {/* Save Button */}
      <div class="mt-6 flex justify-end">
        <Button onClick={handleSaveAll}>Save All Settings</Button>
      </div>

      {/* Status Summary */}
      <Card class="mt-8">
        <CardHeader>
          <CardTitle class="text-base">Configuration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <For each={API_KEYS}>
              {(keyConfig) => (
                <div class="flex items-center gap-2">
                  <Show
                    when={isConfigured(keyConfig.id)}
                    fallback={<X class="h-4 w-4 text-destructive" />}
                  >
                    <Check class="h-4 w-4 text-green-600 dark:text-green-400" />
                  </Show>
                  <span class={isConfigured(keyConfig.id) ? '' : 'text-muted-foreground'}>
                    {keyConfig.name}
                  </span>
                </div>
              )}
            </For>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
