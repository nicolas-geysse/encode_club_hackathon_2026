// @refresh reload
import { createHandler, StartServer } from '@solidjs/start/server';

// Inline script to apply theme immediately (prevents flash)
const themeScript = `
(function() {
  try {
    var saved = localStorage.getItem('stride-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (saved === 'system' && prefersDark) || (!saved && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`;

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          <title>Stride - Navigate student life</title>
          {/* eslint-disable-next-line solid/no-innerhtml */}
          <script innerHTML={themeScript} />
          {assets}
        </head>
        <body class="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
