// Runs before the page is drawn, so a saved light or dark choice shows without a flash.
// With no saved choice the page follows the device setting (prefers-color-scheme).
try {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
} catch {
  /* storage blocked: follow the device setting */
}
