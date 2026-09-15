import { HttpErrorResponse } from '@angular/common/http';

/** The API's validation message(s) for a failed request (Nest's `{ message }` body), or a generic fallback. */
export function describeHttpError(
  error: unknown,
  fallback = 'The change could not be saved.',
): string {
  if (error instanceof HttpErrorResponse) {
    const message: unknown = error.error?.message;
    if (Array.isArray(message)) {
      return message.join('; ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return fallback;
}
