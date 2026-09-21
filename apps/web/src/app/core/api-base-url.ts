/** The address the API is called on when nothing says otherwise: the API's own development port. */
export const DEFAULT_API_BASE_URL = 'http://localhost:3000';

interface RuntimeConfig {
  apiBaseUrl?: string;
}

declare global {
  interface Window {
    /** Written by `config.js`, which `index.html` loads before the app (Roadmap IMPROVEMENT-02b). */
    __PMHYBRID__?: RuntimeConfig;
  }
}

/**
 * The API address of this deployment: what `config.js` says, else the
 * development default, without a trailing slash so a path can be appended.
 */
export function readApiBaseUrl(config: RuntimeConfig | undefined): string {
  const configured = config?.apiBaseUrl?.trim();
  return configured ? configured.replace(/\/+$/, '') : DEFAULT_API_BASE_URL;
}

/**
 * Read once, when the app loads. It used to be a constant in source, so one
 * build served one API; `config.js` (a file next to the app that a deployment
 * replaces) lets the same build serve any (Roadmap IMPROVEMENT-02b).
 */
export const API_BASE_URL = readApiBaseUrl(
  typeof window === 'undefined' ? undefined : window.__PMHYBRID__,
);
