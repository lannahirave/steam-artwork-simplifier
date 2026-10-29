// Apply the saved (or system) theme before first paint to avoid a flash.
// Kept as a file rather than an inline script so the Content-Security-Policy needs no 'unsafe-inline'.
try {
  var saved = localStorage.getItem('steam-artwork-studio:theme')
  var dark =
    saved === 'dark' ||
    (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
} catch (e) {}
