/**
 * Page Loader Component
 *
 * Full-page loading spinner for initial data fetching.
 */

export function PageLoader() {
  return (
    <div class="flex flex-col items-center justify-center py-20">
      <div class="relative">
        <div class="w-12 h-12 border-4 border-primary-200 rounded-full" />
        <div class="absolute top-0 left-0 w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
      <p class="mt-4 text-slate-500 text-sm">Loading...</p>
    </div>
  );
}

export default PageLoader;
