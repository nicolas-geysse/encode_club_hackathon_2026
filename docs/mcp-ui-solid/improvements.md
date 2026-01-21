# MCP-UI Solid - Feature Documentation

Based on real-world usage in **Stride** (Encode Club Hackathon 2026), this document outlines the features and capabilities of `@seed-ship/mcp-ui-solid` **v2.0.0**.

📦 **npm packages**:
- [`@seed-ship/mcp-ui-spec`](https://www.npmjs.com/package/@seed-ship/mcp-ui-spec) - Schema definitions (Zod)
- [`@seed-ship/mcp-ui-solid`](https://www.npmjs.com/package/@seed-ship/mcp-ui-solid) - SolidJS renderers
- [`@seed-ship/mcp-ui-cli`](https://www.npmjs.com/package/@seed-ship/mcp-ui-cli) - Developer tools

**Related**: See [slash-commands.md](./slash-commands.md) for implementation details.

---

## Implementation Status (Updated 2026-01-21)

| Feature | Status | Sprint | Notes |
|---------|--------|--------|-------|
| Extended Form Fields | ✅ DONE | Sprint 1 | 9 field types: text, email, password, number, date, textarea, select, checkbox, radio |
| Conditional Fields (showWhen) | ✅ DONE | Sprint 2 | 13 operators supported |
| Async Action Handlers | ✅ DONE | Sprint 2 | Lifecycle callbacks + retry support |
| Shared Validation Schema | ✅ DONE | Sprint 1 | Zod schemas exported from mcp-ui-spec |
| Modal/Dialog Wrapper | ✅ DONE | Sprint 3 | 5 sizes, escape/backdrop close, focus trap |
| Action Grouping | ✅ DONE | Sprint 3 | 5 variants, 3 sizes, 5 layouts |
| Form State Persistence | ✅ DONE | Sprint 4 | persistKey, debounce, expiry, field exclusion, SSR-safe |
| Native Chart.js | ✅ DONE | Sprint 4 | Optional peer dependency, auto fallback to Quickchart.io iframe |
| Image Gallery | ✅ DONE | Sprint 5 | Lightbox, columns, gap, aspect ratio, keyboard navigation |
| Video Component | ✅ DONE | Sprint 5 | YouTube, Vimeo, direct files, autoplay, controls, loop |
| Code Component | ✅ DONE | Sprint 6 | highlight.js, auto-detect language, copy button, filename |
| Map Component | ✅ DONE | Sprint 6 | Leaflet, OpenStreetMap, markers, tooltips, popups |

---

## 1. Current State (What Works Well)

### Component Coverage
- **19 UI types**: chart, table, metric, text, image, link, iframe, action, grid, carousel, artifact, footer, **form** (Sprint 1), **modal** (Sprint 3), **action-group** (Sprint 3), **image-gallery** (Sprint 5), **video** (Sprint 5), **code** (Sprint 6), **map** (Sprint 6)
- **Grid system**: 12-column responsive layout with `columns` prop
- **Composite support**: Nest multiple components via `components` array
- **Type safety**: Zod schemas validate all UIResource structures
- **Security**: DOMPurify sanitizes HTML content

### Developer Experience
- **Hooks**: `useStreamingUI`, `useAction`, `useToolAction`, **useConditionalField** (Sprint 2), **useModal**, **useConfirmModal** (Sprint 3), **useFormPersistence** (Sprint 4)
- **Context**: `MCPActionProvider` for centralized action handling with **lifecycle callbacks** (Sprint 2)
- **Recursive rendering**: Nested grids/composites work out of the box
- **Form validation**: Field-level and form-level validation with Zod schemas (Sprint 1)
- **Chart.js integration**: Native rendering with optional peer dependency and iframe fallback (Sprint 4)
- **Video utilities** (Sprint 5): `isSupportedVideoUrl()`, `getVideoProvider()` helpers for URL detection

### Example: Working Grid Layout
```typescript
{
  type: 'grid',
  params: {
    columns: 3,
    children: [
      { type: 'metric', params: { title: 'Income', value: 1200, unit: '€' }},
      { type: 'metric', params: { title: 'Expenses', value: 800, unit: '€' }},
      { type: 'metric', params: { title: 'Savings', value: 400, unit: '€' }},
    ]
  }
}
```

---

## 2. Limitations Identified

| Limitation | Impact in Stride | Severity | Status |
|------------|------------------|----------|--------|
| **No advanced form fields** | Custom FormResource (~120 lines) for select/checkbox | High | ✅ **RESOLVED** (Sprint 1) |
| **No conditional fields** | Can't show/hide fields based on answers | High | ✅ **RESOLVED** (Sprint 2) |
| **No shared validation schema** | Validation duplicated front/back | Medium | ✅ **RESOLVED** (Sprint 1) |
| **Charts via Quickchart.io** | Limited customization, external dependency | Medium | ✅ **RESOLVED** (Sprint 4) |
| **No modal/dialog** | Forms inline only, no confirmation dialogs | Medium | ✅ **RESOLVED** (Sprint 3) |
| **No async action state** | No loading spinner during form submit | Medium | ✅ **RESOLVED** (Sprint 2) |
| **No form state persistence** | Data lost on navigation/refresh | Low | ✅ **RESOLVED** (Sprint 4) |
| **No custom CSS classes** | Can't style individual components differently | Low | ⏳ Planned (Sprint 7) |

---

## 3. Workarounds in Stride

> **Summary**: Of the 6 workarounds documented below, **4 are now resolved** or significantly improved by Sprints 1-4:
> - ✅ 3.1 Custom FormResource → Resolved (Sprint 1)
> - ✅ 3.2 Dual Toast System → Resolved (Sprint 2)
> - ⚡ 3.4 Single-Goal Policy → Improved (Sprint 3)
> - ✅ 3.5 Delayed Refresh → Resolved (Sprint 2)

### 3.1 Custom FormResource Implementation ✅ NOW RESOLVED (Sprint 1)

**Location**: `MCPUIRenderer.tsx:292-414`

The library's form support only handles `text`, `number`, and `date` input types. Stride extends this with:

```typescript
// Current lib limitation - only basic inputs
<input type={field.type || 'text'} ... />

// Stride needs select/checkbox/radio which don't exist
// Workaround: Build custom form renderer
function FormResource(props: { params?: Record<string, unknown>; onAction?: ActionCallback }) {
  // 120+ lines of custom validation, error handling, controlled inputs
}
```

> **Resolution**: Sprint 1 added `FormRenderer` component with 9 field types: text, email, password, number, date, textarea, select, checkbox, radio. Sprint 2 added `showWhen` for conditional fields.

### 3.2 Dual Toast System ✅ NOW RESOLVED (Sprint 2)

**Location**: `OnboardingChat.tsx:378-380`

Because MCP-UI doesn't provide feedback on action success/failure:

```typescript
// WORKAROUND: Show both visible toast AND notification bell
toastPopup.success('Goal Created!', `"${formData.goalName}" added`);
toast.success('Goal Created', `"${formData.goalName}" added`); // Bell icon
```

> **Resolution**: Sprint 2 added `ActionResult` interface and lifecycle callbacks. `MCPActionProvider` now accepts `onSuccess` and `onError` callbacks for centralized feedback handling.

### 3.3 Profile ID Fallback Chain

**Location**: `OnboardingChat.tsx:336-337`

Race conditions between context loading and form submission require defensive coding:

```typescript
// WORKAROUND: Multiple fallbacks due to async context not being ready
const currentProfileId = profileId() || contextProfile()?.id;
```

### 3.4 Single-Goal Policy (Manual) ⚡ IMPROVED (Sprint 3)

**Location**: `OnboardingChat.tsx:342-396`

No action grouping means business logic like "archive old, create new" must be manual:

```typescript
// WORKAROUND: 50+ lines to enforce "one active goal" policy
// 1. Fetch existing active goals
// 2. Archive each one (PUT status: 'paused')
// 3. Create new goal
// 4. Refresh goals list
```

> **Improvement**: Sprint 3 added `action-group` component with `layout` options. Multi-step workflows can now be presented as grouped actions with consistent UX. Server-side orchestration is still required, but UI presentation is cleaner.

### 3.5 Delayed Refresh ✅ NOW RESOLVED (Sprint 2)

**Location**: `OnboardingChat.tsx:382-387`

Without async action lifecycle, we guess when DB commits are done:

```typescript
// WORKAROUND: setTimeout to wait for DB commit
setTimeout(() => {
  refreshGoals().then(() => {
    logger.info('refreshGoals completed');
  });
}, 100); // Magic number - hope it's enough
```

> **Resolution**: Sprint 2 added lifecycle callbacks (`onSuccess`, `onComplete`) to `MCPActionProvider`. Actions now properly wait for promises and provide feedback, eliminating the need for magic timeouts.

### 3.6 Custom Markdown Parser

**Location**: `MCPUIRenderer.tsx:436-463`

Text component doesn't support rich markdown, so Stride has a regex-based converter:

```typescript
// WORKAROUND: simpleMarkdown() function
// - Headers (h1-h3)
// - Bold/italic
// - Code inline
// - Lists (bullet + numbered)
// - Links
// Uses regex, not a proper markdown AST parser
```

---

## 4. Suggested Improvements

### Priority: HIGH (Resolves Daily Friction)

#### 4.1 Extended Form Field Types ✅ IMPLEMENTED (Sprint 1)

**Problem**: Only `text`, `number`, `date` inputs work.

**Solution**: Add `select`, `checkbox`, `radio`, `textarea` field types.

```typescript
// Proposed schema extension
interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'radio' | 'textarea';
  required?: boolean;
  value?: unknown;
  // NEW: For select/radio
  options?: Array<{ label: string; value: string }>;
  // NEW: For textarea
  rows?: number;
  // NEW: For checkbox
  checked?: boolean;
}
```

**Example usage**:
```typescript
{
  type: 'form',
  params: {
    title: 'Set Your Goal',
    fields: [
      { name: 'goalName', label: 'Goal', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'select', options: [
        { label: 'Travel', value: 'travel' },
        { label: 'Tech', value: 'tech' },
        { label: 'Education', value: 'education' },
      ]},
      { name: 'urgent', label: 'This is urgent', type: 'checkbox' },
    ],
    submitLabel: 'Create Goal'
  }
}
```

---

#### 4.2 Conditional Fields (showWhen) ✅ IMPLEMENTED (Sprint 2)

**Problem**: Can't show/hide fields based on other field values.

**Solution**: Add `showWhen` property for field visibility.

```typescript
interface FormField {
  // ...existing fields
  showWhen?: {
    field: string;           // Name of field to watch
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains';
    value: unknown;
  };
}
```

**Example**:
```typescript
{
  type: 'form',
  params: {
    fields: [
      { name: 'hasLoan', label: 'Do you have a student loan?', type: 'checkbox' },
      {
        name: 'loanAmount',
        label: 'Loan amount',
        type: 'number',
        showWhen: { field: 'hasLoan', operator: 'eq', value: true }
      },
    ]
  }
}
```

---

#### 4.3 Async Action Handlers ✅ IMPLEMENTED (Sprint 2)

**Problem**: No loading state during form submission; no success/error feedback.

**Solution**: Action lifecycle with loading state and result callback.

```typescript
// Proposed ActionCallback signature change
type ActionCallback = (
  action: string,
  data: unknown
) => void | Promise<ActionResult>;

interface ActionResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

// Renderer would show loading spinner while promise pending
// Then show success/error toast based on result
```

**Example handler**:
```typescript
<MCPUIRenderer
  resource={resource}
  onAction={async (action, data) => {
    if (action === 'form-submit') {
      try {
        await goalService.createGoal(data);
        return { success: true, message: 'Goal created!' };
      } catch (err) {
        return { success: false, message: 'Failed to save goal' };
      }
    }
  }}
/>
```

---

#### 4.4 Shared Validation Schema ✅ IMPLEMENTED (Sprint 1)

**Problem**: Validation is duplicated between frontend (FormResource) and backend (API handlers).

**Solution**: Export Zod schemas that can be used on both sides.

```typescript
// @seed-ship/mcp-ui-spec exports
export const goalFormSchema = z.object({
  goalName: z.string().min(1, 'Goal name is required'),
  goalAmount: z.number().positive('Amount must be positive'),
  goalDeadline: z.string().optional(),
});

// Frontend uses it for client-side validation
// Backend uses same schema for API validation
```

---

### Priority: MEDIUM (Improves UX)

#### 4.5 Modal/Dialog Wrapper ✅ IMPLEMENTED (Sprint 3)

**Problem**: No way to show forms/confirmations in a modal overlay.

**Solution**: Add `modal` type or wrapper prop.

```typescript
{
  type: 'modal',
  params: {
    title: 'Confirm Delete',
    open: true,
    onClose: 'dismiss',  // Action name to emit on close
    children: [
      { type: 'text', params: { content: 'Are you sure?' }},
      { type: 'grid', params: { columns: 2, children: [
        { type: 'action', params: { label: 'Cancel', variant: 'ghost', action: 'dismiss' }},
        { type: 'action', params: { label: 'Delete', variant: 'primary', action: 'confirm-delete' }},
      ]}}
    ]
  }
}
```

---

#### 4.6 Form State Persistence (Draft Mode) ✅ IMPLEMENTED (Sprint 4)

**Problem**: Partially filled forms are lost on navigation or page refresh.

**Solution**: Optional `persistKey` prop that saves to localStorage.

**Implementation Details**:
- `useFormPersistence` hook with debounced saves (default 500ms)
- Expiry time support (`persistExpiresIn` in milliseconds)
- Field exclusion (`excludeFromPersistence: string[]`)
- SSR-safe (checks for `window`/`localStorage`)
- Automatic clear on successful form submit
- Version-based storage format for future migrations

```typescript
{
  type: 'form',
  params: {
    persistKey: 'goal-form-draft',           // Auto-saves to localStorage
    persistExpiresIn: 86400000,              // Expire after 24 hours
    excludeFromPersistence: ['password'],    // Don't persist sensitive fields
    fields: [...]
  }
}
```

---

#### 4.7 Native Chart.js Integration ✅ IMPLEMENTED (Sprint 4)

**Problem**: Charts use Quickchart.io (external service, limited customization).

**Solution**: Direct Chart.js rendering with full options support.

**Implementation Details**:
- Chart.js as optional peer dependency (`peerDependenciesMeta.optional`)
- Lazy loading via dynamic `import('chart.js/auto')`
- Smart fallback: auto-detect availability, fallback to Quickchart.io iframe
- `renderer` prop for explicit control: `'native'`, `'iframe'`, or `'auto'` (default)
- `ChartJSRenderer` component with loading/error states

```typescript
{
  type: 'chart',
  params: {
    type: 'bar',
    data: {
      labels: ['Jan', 'Feb', 'Mar'],
      datasets: [{ data: [100, 200, 150], backgroundColor: '#3b82f6' }]
    },
    options: {
      // Full Chart.js options object
      responsive: true,
      plugins: { legend: { display: false }}
    },
    renderer: 'native'  // 'native' | 'iframe' | 'auto' (default)
  }
}
```

---

#### 4.8 Action Grouping ✅ IMPLEMENTED (Sprint 3)

**Problem**: No way to group related actions (Save + Cancel).

**Solution**: `action-group` type with layout options.

```typescript
{
  type: 'action-group',
  params: {
    layout: 'horizontal', // or 'vertical'
    align: 'right',       // or 'left', 'center', 'space-between'
    children: [
      { type: 'action', params: { label: 'Cancel', variant: 'ghost', action: 'cancel' }},
      { type: 'action', params: { label: 'Save', variant: 'primary', action: 'save' }},
    ]
  }
}
```

---

### Priority: LOW (Nice-to-Have)

| Feature | Description |
|---------|-------------|
| **Custom CSS classes** | `className` prop on each component for custom styling |
| **Table sorting/filtering** | `sortable: true`, `filterable: true` on columns |
| **Metric comparison** | `previousValue` prop for before/after display |
| **Accessibility** | ARIA labels, keyboard navigation, focus management |
| **Rich text editor** | WYSIWYG field type for formatted input |
| **File upload** | `file` field type with drag-and-drop |

---

## 5. Advanced Integrations

This section covers enhancements for richer content types: images, code blocks, videos, maps, and expanded iframe support.

### 5.1 Enhanced Image Handling ✅ IMPLEMENTED (Sprint 5)

**Current state**: Basic `image` component with `url`, `alt`, `caption`, lazy loading, click-to-zoom.

**Implementation (Sprint 5)**: Added `image-gallery` component with:
- Gallery mode with configurable columns (2-5)
- Lightbox overlay with keyboard navigation
- Gap options (none, sm, md, lg)
- Aspect ratio options (1:1, 16:9, 4:3, auto)
- Caption display
- Lazy loading

**Original proposed enhancements**:

| Feature | Description |
|---------|-------------|
| **Gallery mode** | Multiple images with thumbnail navigation |
| **Lightbox** | Full-screen overlay on click |
| **Responsive srcset** | Multiple resolutions for different screens |
| **Placeholder/skeleton** | Loading state while image loads |
| **Zoom controls** | Pan and zoom for detailed images |

**Example: Gallery Mode** ✅ IMPLEMENTED (Sprint 5)
```typescript
// Actual implementation uses 'image-gallery' type
{
  type: 'image-gallery',
  params: {
    title: 'Photo Gallery',
    images: [
      { url: '/img1.jpg', alt: 'Photo 1', caption: 'Beach sunset' },
      { url: '/img2.jpg', alt: 'Photo 2', caption: 'Mountain view' }
    ],
    columns: 3,             // 2 | 3 | 4 | 5
    gap: 'md',              // 'none' | 'sm' | 'md' | 'lg'
    aspectRatio: '16:9',    // '1:1' | '16:9' | '4:3' | 'auto'
    lightbox: true,         // Enable fullscreen viewer
    showCaptions: true      // Show captions on thumbnails
  }
}
```

---

### 5.2 Code Component ✅ IMPLEMENTED (Sprint 6)

**Current state**: No dedicated code component. Only inline backticks via markdown in text components.

**Implementation (Sprint 6)**: Added `code` component type (`CodeBlockRenderer`) with:
- ✅ Syntax highlighting via highlight.js (lazy loaded)
- ✅ Auto-detect language or explicit `language` prop
- ✅ Copy to clipboard button
- ✅ Header with filename/language display
- ✅ Fallback for unknown languages
- ⚠️ showLineNumbers prop (partial implementation)
- ❌ Line numbers display, diff view, executable code not implemented

**Original proposed features**:
- **Syntax highlighting**: Prism.js or Shiki → **highlight.js** (implemented)
- **Language detection**: Auto-detect or explicit `language` prop → ✅ (implemented)
- **Copy button**: One-click copy to clipboard → ✅ (implemented)
- **Line numbers**: Optional with `showLineNumbers` prop → ⚠️ (prop exists, partial)
- **Diff view**: Show added/removed lines → ❌ (not implemented)
- **Executable code**: Optional sandboxed execution → ❌ (not implemented)

**Example**:
```typescript
{
  type: 'code',
  params: {
    code: 'const x = 42;\nconsole.log(x);',
    language: 'typescript',
    showLineNumbers: true,
    highlightLines: [2],  // Highlight specific lines
    copyButton: true,
    executable: false     // If true, add "Run" button
  }
}
```

**Schema**:
```typescript
interface CodeParams {
  code: string;
  language?: string;                    // 'typescript' | 'javascript' | 'python' | etc.
  showLineNumbers?: boolean;            // Default: false
  highlightLines?: number[];            // Lines to highlight (1-indexed)
  copyButton?: boolean;                 // Default: true
  executable?: boolean;                 // Default: false
  theme?: 'light' | 'dark' | 'auto';    // Default: 'auto'
}
```

---

### 5.3 Video Embed Component ✅ IMPLEMENTED (Sprint 5)

**Current state**: No video component. Would require manual iframe with domain whitelist.

**Implementation (Sprint 5)**: Added `video` component with:
- YouTube embed with privacy mode (youtube-nocookie.com)
- Vimeo embed support
- Direct video file support (mp4, webm, ogg, mov)
- Parameters: autoplay, controls, loop, muted, startTime
- Aspect ratio options (16:9, 4:3, 1:1, 21:9)
- Poster image support
- Iframe whitelist updated for video providers

**Original proposed solution**: Dedicated `video` component with provider detection.

**Features**:
- **YouTube support**: Auto-extract video ID from URL
- **Vimeo support**: Same pattern
- **Controls**: Play, pause, volume, fullscreen
- **Thumbnail preview**: Show poster before loading player
- **Privacy mode**: `youtube-nocookie.com` for GDPR compliance

**Example** ✅ IMPLEMENTED (Sprint 5):
```typescript
// YouTube video (auto-detected, uses youtube-nocookie.com for privacy)
{
  type: 'video',
  params: {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Tutorial Video',
    aspectRatio: '16:9',
    autoplay: false,
    controls: true
  }
}

// Direct video file
{
  type: 'video',
  params: {
    url: 'https://example.com/video.mp4',
    poster: 'https://example.com/poster.jpg',
    autoplay: true,
    muted: true,
    loop: true
  }
}
```

**Actual Schema** (Sprint 5):
```typescript
interface VideoComponentParams {
  url: string;                                   // YouTube, Vimeo, or direct URL
  title?: string;                                // Optional title
  caption?: string;                              // Optional caption below video
  poster?: string;                               // Thumbnail for direct videos
  aspectRatio?: '16:9' | '4:3' | '1:1' | '21:9'; // Default: '16:9'
  autoplay?: boolean;                            // Default: false
  controls?: boolean;                            // Default: true
  loop?: boolean;                                // Default: false
  muted?: boolean;                               // Default: false
  startTime?: number;                            // Start time in seconds (YouTube)
}
```

**Helper functions**:
```typescript
import { isSupportedVideoUrl, getVideoProvider } from '@seed-ship/mcp-ui-solid'

isSupportedVideoUrl('https://youtube.com/watch?v=xxx')  // true
getVideoProvider('https://vimeo.com/123456')            // 'vimeo'
getVideoProvider('https://example.com/video.mp4')       // 'direct'
```

---

### 5.4 Map Component ✅ IMPLEMENTED (Sprint 6)

**Current state**: No map support. Would need external service via iframe.

**Implementation (Sprint 6)**: Added `map` component type (`MapRenderer`) with:
- ✅ Leaflet integration with OpenStreetMap tiles (lazy loaded)
- ✅ Markers with lat/lng coordinates
- ✅ Tooltips (via `title` prop on marker)
- ✅ Popups (via `description` prop on marker)
- ✅ Configurable height
- ✅ SSR-safe (checks isServer)
- ✅ Error handling
- ❌ fitBounds, custom tile layers, zoom control config not implemented

**Original proposed features**:
- **Leaflet integration**: OpenStreetMap tiles → ✅ (implemented)
- **Markers**: Multiple markers → ✅ (implemented with lat/lng format)
- **Popups**: Click marker to show info → ✅ (via description prop)
- **Bounds**: Auto-fit to markers → ❌ (not implemented)
- **Geocoding**: Address to coordinates → ❌ (not implemented)

**Example**:
```typescript
{
  type: 'map',
  params: {
    center: { lat: 48.8566, lng: 2.3522 },
    zoom: 13,
    markers: [
      { lat: 48.8566, lng: 2.3522, popup: 'Paris', icon: 'default' },
      { lat: 48.8606, lng: 2.3376, popup: 'Louvre Museum', icon: 'museum' }
    ],
    height: '400px',
    provider: 'openstreetmap'  // or 'mapbox' with API key
  }
}
```

**Schema**:
```typescript
interface MapParams {
  center: { lat: number; lng: number };
  zoom?: number;                             // Default: 13
  markers?: Array<{
    lat: number;
    lng: number;
    popup?: string;
    icon?: 'default' | 'pin' | 'custom';
    iconUrl?: string;                        // For custom icons
  }>;
  height?: string;                           // Default: '300px'
  provider?: 'openstreetmap' | 'mapbox';     // Default: 'openstreetmap'
  apiKey?: string;                           // Required for mapbox
  fitBounds?: boolean;                       // Auto-fit to markers
}
```

---

### 5.5 Iframe Domain Expansion ⚡ PARTIALLY IMPLEMENTED (Sprint 5)

**Current state** (from `validation.ts:35-51`, updated Sprint 5):
```typescript
const ALLOWED_IFRAME_DOMAINS = [
  // Charts
  'quickchart.io',
  'www.quickchart.io',
  // Deposium
  'deposium.com',
  'deposium.vip',
  // Development
  'localhost',
  // Video providers (Sprint 5) ✅
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
];
```

**Implemented in Sprint 5**:

| Domain | Use Case | Status |
|--------|----------|--------|
| `youtube.com`, `youtube-nocookie.com` | Video embeds | ✅ Done |
| `vimeo.com`, `player.vimeo.com` | Video embeds | ✅ Done |

**Remaining proposed additions** (for future sprints):

| Domain | Use Case |
|--------|----------|
| `maps.google.com` | Google Maps embeds |
| `codepen.io` | Code demos |
| `codesandbox.io` | Interactive code |
| `figma.com` | Design embeds |
| `miro.com` | Whiteboard embeds |
| `docs.google.com` | Document embeds |

**Security considerations**:
- Each domain should be reviewed for XSS risks
- Consider CSP (Content Security Policy) headers
- Optional per-domain sandbox attributes
- User consent for third-party embeds (GDPR)

**Configurable whitelist**:
```typescript
// Allow custom whitelist per project
{
  type: 'iframe',
  params: {
    url: 'https://figma.com/embed/...',
    title: 'Design Mockup',
    allowedDomains: ['figma.com'],  // Override default whitelist
    sandbox: 'allow-scripts allow-same-origin'
  }
}
```

---

### 5.6 Code Execution (Sandboxed)

**Use case**: Interactive tutorials, code playgrounds, live demos.

**Approach options**:

| Option | Pros | Cons |
|--------|------|------|
| **WebContainer** | Full Node.js in browser | Large bundle, complex setup |
| **iframe sandbox** | Lightweight, isolated | Limited to JS, no npm |
| **Pyodide** | Python in browser | Slow initial load |
| **WASM-based** | Multiple languages | Complex, per-language setup |

**Recommended: iframe sandbox with message passing**

```typescript
{
  type: 'code',
  params: {
    code: 'console.log("Hello, world!");',
    language: 'javascript',
    executable: true,
    sandbox: {
      timeout: 5000,           // Max execution time (ms)
      allowNetwork: false,     // Block fetch/XMLHttpRequest
      allowStorage: false,     // Block localStorage/indexedDB
      maxOutputLines: 100      // Truncate long outputs
    }
  }
}
```

**Security measures**:
- Strict CSP: `script-src 'unsafe-eval'` only in sandboxed iframe
- No network access by default
- Execution timeout (default: 5s)
- Output size limits
- No access to parent window (`sandbox` attribute)

**Architecture**:
```
┌─────────────────────┐     postMessage     ┌──────────────────────┐
│   Parent Window     │ ──────────────────► │   Sandboxed iframe   │
│   (mcp-ui-solid)    │ ◄────────────────── │   (code runner)      │
│                     │     result/error    │                      │
└─────────────────────┘                     └──────────────────────┘
```

---

## 6. Changelog (v2.0.0)

All features below are now available in `@seed-ship/mcp-ui-solid` **v2.0.0** on npm:

### PR 1: Extended Form Fields ✅ COMPLETED
- Add `select`, `checkbox`, `radio`, `textarea` types
- Include proper accessibility (labels, ARIA)
- **Status**: Implemented in Sprint 1 with 9 field types and full validation

### PR 2: Conditional Field Visibility ✅ COMPLETED
- Add `showWhen` property
- Implement reactive visibility in FormResource
- **Status**: Implemented in Sprint 2 with 13 operators (equals, notEquals, in, notIn, contains, startsWith, endsWith, greaterThan, lessThan, isEmpty, isNotEmpty, isTrue, isFalse)

### PR 3: Async Action Handlers ✅ COMPLETED
- Update ActionCallback type signature
- Add loading state to ActionResource
- Add result toasts
- **Status**: Implemented in Sprint 2 with lifecycle callbacks (onBefore, onSuccess, onError, onComplete), retry support, and error management

### PR 4: Modal/Dialog & Action Groups ✅ COMPLETED
- Modal component with Portal rendering
- Action grouping with layout options
- **Status**: Implemented in Sprint 3

### PR 5: Form Persistence & Chart.js ✅ COMPLETED
- Form state persistence to localStorage via `persistKey`
- Native Chart.js rendering with lazy loading
- Smart fallback to Quickchart.io iframe
- **Status**: Implemented in Sprint 4 with:
  - `useFormPersistence` hook (debounce, expiry, field exclusion, SSR-safe)
  - `ChartJSRenderer` component with `renderer: 'native' | 'iframe' | 'auto'`
  - Chart.js as optional peer dependency

### PR 6: Media Components ✅ COMPLETED
- Image gallery with lightbox and keyboard navigation
- Video embed supporting YouTube, Vimeo, and direct files
- **Status**: Implemented in Sprint 5 with:
  - `ImageGalleryRenderer` component with configurable columns (2-5), gap, aspect ratio
  - `LightboxOverlay` with keyboard navigation (Escape, Arrow keys)
  - `VideoRenderer` with YouTube privacy mode (youtube-nocookie.com)
  - URL parsing helpers: `isSupportedVideoUrl()`, `getVideoProvider()`
  - 36 new tests (15 gallery + 21 video)

### PR 7: Code & Maps Components ✅ COMPLETED
- Code syntax highlighting with highlight.js
- Interactive maps with Leaflet + OpenStreetMap
- **Status**: Implemented in Sprint 6 with:
  - `CodeBlockRenderer` component with lazy-loaded highlight.js
  - `MapRenderer` component with lazy-loaded Leaflet
  - Auto-detect language, copy button, filename display
  - Markers with tooltips (title) and popups (description)
  - 7 new tests (5 code + 2 map)

### PR 8: Documentation of Patterns ✅ COMPLETED
- Document common patterns from Stride
- Show workarounds that could become features
- **Status**: This document serves as the documentation

---

## Related Files (Stride)

| File | Purpose |
|------|---------|
| `components/chat/MCPUIRenderer.tsx` | Custom renderer (can now migrate to v2.0.0) |
| `components/chat/OnboardingChat.tsx` | Consumer with action handling |
| `routes/api/chat.ts` | Slash command handlers returning UIResource |
| `components/ui/Toast.tsx` | Custom toast system (can use ActionResult callbacks) |

---

## References

### npm packages (v2.0.0)
- [`@seed-ship/mcp-ui-spec`](https://www.npmjs.com/package/@seed-ship/mcp-ui-spec) - Schema definitions (Zod)
- [`@seed-ship/mcp-ui-solid`](https://www.npmjs.com/package/@seed-ship/mcp-ui-solid) - SolidJS renderers
- [`@seed-ship/mcp-ui-cli`](https://www.npmjs.com/package/@seed-ship/mcp-ui-cli) - Developer tools

### Local development
- **mcp-ui repo**: `/home/nico/code_source/tss/mcp-ui`
