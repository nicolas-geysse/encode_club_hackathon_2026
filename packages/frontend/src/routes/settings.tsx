/**
 * Settings Page
 *
 * Multi-provider configuration for LLM (Mistral, Groq, Gemini) and STT (Groq Whisper, Voxtral).
 * Settings are stored in localStorage and pushed to the server's in-memory store via /api/settings/apply.
 */

import { createSignal, onMount, For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/components/ui/Card';
import { toast } from '~/lib/notificationStore';
import { ArrowLeft, Eye, EyeOff, Check, X, ExternalLink, RefreshCw, Zap } from 'lucide-solid';
import {
  LLM_PROVIDERS,
  STT_PROVIDERS,
  computeSettingsFromConfig,
  type ProviderConfig,
} from '~/lib/providerPresets';

const KEYS_STORAGE_KEY = 'stride_api_keys';
const PROVIDER_STORAGE_KEY = 'stride_provider_config';

/** Non-provider API keys (shown in "Other Keys" section) */
const OTHER_KEYS = [
  {
    id: 'OPIK_API_KEY',
    name: 'Opik API Key',
    description: 'Required for AI observability and feedback tracking',
    placeholder: 'op_...',
    link: 'https://www.comet.com/opik',
  },
  {
    id: 'OPIK_WORKSPACE',
    name: 'Opik Workspace',
    description: 'Your Opik workspace name',
    placeholder: 'my-workspace',
    link: 'https://www.comet.com/opik',
  },
  {
    id: 'GOOGLE_MAPS_API_KEY',
    name: 'Google Maps API Key',
    description: 'Optional - enables job location features in Prospection tab',
    placeholder: 'AIza...',
    link: 'https://console.cloud.google.com/apis/credentials',
  },
] as const;

interface ActiveConfig {
  llm: { model: string; baseUrl: string; provider: string; hasKey: boolean };
  stt: { model: string; baseUrl: string; provider: string; hasKey: boolean };
  googleMaps?: { hasKey: boolean };
}

export default function SettingsPage() {
  const navigate = useNavigate();

  // API keys (all keys, including provider-specific ones)
  const [apiKeys, setApiKeys] = createSignal<Record<string, string>>({});
  const [showKeys, setShowKeys] = createSignal<Record<string, boolean>>({});

  // Provider selection
  const [llmProvider, setLlmProvider] = createSignal('mistral');
  const [llmModel, setLlmModel] = createSignal('ministral-3b-2512');
  const [sttProvider, setSttProvider] = createSignal('groq-whisper');
  const [sttModel, setSttModel] = createSignal('whisper-large-v3-turbo');

  // Server status
  const [activeConfig, setActiveConfig] = createSignal<ActiveConfig | null>(null);
  const [sources, setSources] = createSignal<Record<string, string>>({});
  const [applying, setApplying] = createSignal(false);
  const [testing, setTesting] = createSignal(false);

  // Load saved state on mount
  onMount(async () => {
    // Load API keys from localStorage
    const savedKeys = localStorage.getItem(KEYS_STORAGE_KEY);
    if (savedKeys) {
      try {
        setApiKeys(JSON.parse(savedKeys));
      } catch {
        // ignore
      }
    }

    // Load provider config from localStorage
    const savedConfig = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (savedConfig) {
      try {
        const config: ProviderConfig = JSON.parse(savedConfig);
        setLlmProvider(config.llmProvider || 'mistral');
        setLlmModel(config.llmModel || 'ministral-3b-2512');
        setSttProvider(config.sttProvider || 'groq-whisper');
        setSttModel(config.sttModel || 'whisper-large-v3-turbo');
      } catch {
        // ignore
      }
    }

    await refreshStatus();
  });

  const refreshStatus = async () => {
    try {
      const response = await fetch('/api/settings/status');
      if (response.ok) {
        const data = await response.json();
        setActiveConfig(data.active || null);
        setSources(data.sources || {});
      }
    } catch {
      // API not available
    }
  };

  // Get current LLM preset
  const currentLLMPreset = () =>
    LLM_PROVIDERS.find((p) => p.id === llmProvider()) || LLM_PROVIDERS[0];
  const currentSTTPreset = () =>
    STT_PROVIDERS.find((p) => p.id === sttProvider()) || STT_PROVIDERS[0];

  // API key for the currently selected LLM provider
  const llmApiKeyField = () => currentLLMPreset().apiKeyField;
  const sttApiKeyField = () => currentSTTPreset().apiKeyField;

  const handleKeyChange = (keyId: string, value: string) => {
    const newKeys = { ...apiKeys(), [keyId]: value };
    setApiKeys(newKeys);
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(newKeys));
  };

  const handleClearKey = (keyId: string) => {
    const newKeys = { ...apiKeys() };
    delete newKeys[keyId];
    setApiKeys(newKeys);
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(newKeys));
  };

  const toggleShowKey = (keyId: string) => {
    setShowKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const handleLLMProviderChange = (providerId: string) => {
    setLlmProvider(providerId);
    const preset = LLM_PROVIDERS.find((p) => p.id === providerId);
    if (preset) {
      setLlmModel(preset.defaultModel);
    }
  };

  const handleSTTProviderChange = (providerId: string) => {
    setSttProvider(providerId);
    const preset = STT_PROVIDERS.find((p) => p.id === providerId);
    if (preset) {
      setSttModel(preset.defaultModel);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      // Save provider config to localStorage
      const config: ProviderConfig = {
        llmProvider: llmProvider(),
        llmModel: llmModel(),
        sttProvider: sttProvider(),
        sttModel: sttModel(),
      };
      localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(config));

      // Compute and send settings to server
      const settings = computeSettingsFromConfig(config, apiKeys());
      const response = await fetch('/api/settings/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(
          'Settings applied',
          `${data.applied?.length || 0} settings updated on server.`
        );
        await refreshStatus();
      } else {
        toast.error('Failed to apply', 'Server returned an error.');
      }
    } catch (error) {
      toast.error('Error', error instanceof Error ? error.message : 'Failed to apply settings.');
    } finally {
      setApplying(false);
    }
  };

  const handleTestLLM = async () => {
    setTesting(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Say "Hello, settings test OK!" in one short sentence.',
          step: 'general',
          mode: 'tab',
          profileId: '__settings_test__',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.response || data.reply || 'No reply';
        toast.success('LLM Test OK', reply.substring(0, 120));
      } else {
        const errData = await response.json().catch(() => ({ message: 'Unknown error' }));
        toast.error('LLM Test Failed', errData.message || `HTTP ${response.status}`);
      }
    } catch (error) {
      toast.error('LLM Test Error', error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  };

  const getSourceBadge = (keyId: string) => {
    const src = sources()[keyId];
    if (src === 'store') return 'runtime';
    if (src === 'env') return '.env';
    return null;
  };

  const isKeyConfigured = (keyId: string) => {
    return !!apiKeys()[keyId] || sources()[keyId] !== 'none';
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
          <p class="text-muted-foreground">Configure AI providers and API keys</p>
        </div>
      </div>

      {/* Section 1: Provider Selection */}
      <div class="space-y-4 mb-8">
        <h2 class="text-lg font-semibold">AI Providers</h2>

        {/* LLM Provider Card */}
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">LLM Provider</CardTitle>
            <CardDescription>Choose the AI model for chat and analysis</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-muted-foreground mb-1 block">Provider</label>
                <Select
                  value={llmProvider()}
                  options={LLM_PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={(e) => handleLLMProviderChange(e.currentTarget.value)}
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground mb-1 block">Model</label>
                <Select
                  value={llmModel()}
                  options={currentLLMPreset().models.map((m) => ({ value: m, label: m }))}
                  onChange={(e) => setLlmModel(e.currentTarget.value)}
                />
              </div>
            </div>
            {/* API Key for selected provider */}
            <div>
              <label class="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                API Key ({llmApiKeyField()})
                <Show when={isKeyConfigured(llmApiKeyField())}>
                  <span class="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Check class="h-3 w-3" />
                    {getSourceBadge(llmApiKeyField()) || 'local'}
                  </span>
                </Show>
              </label>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <Input
                    type={showKeys()[llmApiKeyField()] ? 'text' : 'password'}
                    value={apiKeys()[llmApiKeyField()] || ''}
                    onInput={(e) => handleKeyChange(llmApiKeyField(), e.currentTarget.value)}
                    placeholder="your-api-key..."
                    class="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey(llmApiKeyField())}
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <Show when={showKeys()[llmApiKeyField()]} fallback={<Eye class="h-4 w-4" />}>
                      <EyeOff class="h-4 w-4" />
                    </Show>
                  </button>
                </div>
                <Show when={apiKeys()[llmApiKeyField()]}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearKey(llmApiKeyField())}
                    class="text-destructive hover:text-destructive"
                  >
                    Clear
                  </Button>
                </Show>
                <a
                  href={currentLLMPreset().consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center justify-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                  title="Get API key"
                >
                  <ExternalLink class="h-4 w-4" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* STT Provider Card */}
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">Speech-to-Text Provider</CardTitle>
            <CardDescription>Choose the engine for voice transcription</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-muted-foreground mb-1 block">Provider</label>
                <Select
                  value={sttProvider()}
                  options={STT_PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
                  onChange={(e) => handleSTTProviderChange(e.currentTarget.value)}
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground mb-1 block">Model</label>
                <Select
                  value={sttModel()}
                  options={currentSTTPreset().models.map((m) => ({ value: m, label: m }))}
                  onChange={(e) => setSttModel(e.currentTarget.value)}
                />
              </div>
            </div>
            {/* API Key for selected STT provider */}
            <div>
              <label class="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                API Key ({sttApiKeyField()})
                <Show when={isKeyConfigured(sttApiKeyField())}>
                  <span class="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Check class="h-3 w-3" />
                    {getSourceBadge(sttApiKeyField()) || 'local'}
                  </span>
                </Show>
              </label>
              <Show when={sttApiKeyField() !== llmApiKeyField()}>
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <Input
                      type={showKeys()[sttApiKeyField()] ? 'text' : 'password'}
                      value={apiKeys()[sttApiKeyField()] || ''}
                      onInput={(e) => handleKeyChange(sttApiKeyField(), e.currentTarget.value)}
                      placeholder="your-api-key..."
                      class="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey(sttApiKeyField())}
                      class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Show when={showKeys()[sttApiKeyField()]} fallback={<Eye class="h-4 w-4" />}>
                        <EyeOff class="h-4 w-4" />
                      </Show>
                    </button>
                  </div>
                  <Show when={apiKeys()[sttApiKeyField()]}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearKey(sttApiKeyField())}
                      class="text-destructive hover:text-destructive"
                    >
                      Clear
                    </Button>
                  </Show>
                  <a
                    href={currentSTTPreset().consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center justify-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                    title="Get API key"
                  >
                    <ExternalLink class="h-4 w-4" />
                  </a>
                </div>
              </Show>
              <Show when={sttApiKeyField() === llmApiKeyField()}>
                <p class="text-xs text-muted-foreground italic">
                  Uses the same API key as LLM provider above
                </p>
              </Show>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Other API Keys */}
      <div class="space-y-4 mb-8">
        <h2 class="text-lg font-semibold">Other API Keys</h2>
        <For each={OTHER_KEYS}>
          {(keyConfig) => (
            <Card>
              <CardHeader class="pb-3">
                <div class="flex items-center justify-between">
                  <div>
                    <CardTitle class="text-base">{keyConfig.name}</CardTitle>
                    <CardDescription class="text-sm">{keyConfig.description}</CardDescription>
                  </div>
                  <Show
                    when={isKeyConfigured(keyConfig.id)}
                    fallback={
                      <span class="flex items-center gap-1 text-xs text-muted-foreground">
                        <X class="h-3 w-3 text-destructive" />
                        Not set
                      </span>
                    }
                  >
                    <span class="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check class="h-3 w-3" />
                      {getSourceBadge(keyConfig.id) || (apiKeys()[keyConfig.id] ? 'local' : '.env')}
                    </span>
                  </Show>
                </div>
              </CardHeader>
              <CardContent class="pt-0">
                <div class="flex gap-2">
                  <div class="relative flex-1">
                    <Input
                      type={showKeys()[keyConfig.id] ? 'text' : 'password'}
                      value={apiKeys()[keyConfig.id] || ''}
                      onInput={(e) => handleKeyChange(keyConfig.id, e.currentTarget.value)}
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
                  <Show when={apiKeys()[keyConfig.id]}>
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

      {/* Section 3: Apply & Status */}
      <div class="space-y-4">
        <h2 class="text-lg font-semibold">Apply & Test</h2>

        {/* Active server config */}
        <Show when={activeConfig()}>
          {(config) => (
            <Card class="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
              <CardContent class="pt-4">
                <p class="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                  Active Server Configuration
                </p>
                <div class="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span class="text-muted-foreground">LLM:</span>{' '}
                    <span class="font-mono">
                      {config().llm.provider}/{config().llm.model}
                    </span>
                    <Show when={config().llm.hasKey}>
                      <Check class="inline h-3 w-3 ml-1 text-green-600" />
                    </Show>
                    <Show when={!config().llm.hasKey}>
                      <X class="inline h-3 w-3 ml-1 text-destructive" />
                    </Show>
                  </div>
                  <div>
                    <span class="text-muted-foreground">STT:</span>{' '}
                    <span class="font-mono">
                      {config().stt.provider}/{config().stt.model}
                    </span>
                    <Show when={config().stt.hasKey}>
                      <Check class="inline h-3 w-3 ml-1 text-green-600" />
                    </Show>
                    <Show when={!config().stt.hasKey}>
                      <X class="inline h-3 w-3 ml-1 text-destructive" />
                    </Show>
                  </div>
                  <div>
                    <span class="text-muted-foreground">Maps:</span>{' '}
                    <Show when={config().googleMaps?.hasKey}>
                      <span class="text-green-600 dark:text-green-400">
                        <Check class="inline h-3 w-3 mr-1" />
                        Active
                      </span>
                    </Show>
                    <Show when={!config().googleMaps?.hasKey}>
                      <span class="text-muted-foreground">
                        <X class="inline h-3 w-3 mr-1 text-destructive" />
                        No key
                      </span>
                    </Show>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </Show>

        {/* Action buttons */}
        <div class="flex gap-3">
          <Button onClick={handleApply} disabled={applying()} class="flex-1">
            <Show when={applying()} fallback={<RefreshCw class="h-4 w-4 mr-2" />}>
              <RefreshCw class="h-4 w-4 mr-2 animate-spin" />
            </Show>
            {applying() ? 'Applying...' : 'Apply Settings'}
          </Button>
          <Button variant="outline" onClick={handleTestLLM} disabled={testing()}>
            <Show when={testing()} fallback={<Zap class="h-4 w-4 mr-2" />}>
              <Zap class="h-4 w-4 mr-2 animate-pulse" />
            </Show>
            {testing() ? 'Testing...' : 'Test LLM'}
          </Button>
        </div>

        {/* Info */}
        <Card class="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <CardContent class="pt-4">
            <p class="text-sm text-amber-800 dark:text-amber-200">
              <strong>How it works:</strong> Click "Apply Settings" to push your provider and keys
              to the server. Settings persist in your browser and are auto-applied on page reload.
              The server's <code class="bg-amber-100 dark:bg-amber-900 px-1 rounded">.env</code>{' '}
              keys are used as fallback when no override is set.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
