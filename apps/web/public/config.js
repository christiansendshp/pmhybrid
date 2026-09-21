// Read before the app starts (index.html loads this first), so one build serves
// any environment: point it at the API by setting apiBaseUrl, or leave it empty
// for the development default, http://localhost:3000. A deployment replaces this
// file (the web image writes it from the API_BASE_URL environment variable).
window.__PMHYBRID__ = { apiBaseUrl: '' };
