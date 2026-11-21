'use client';

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError, errorMessage } from './api';

/**
 * Push server-side field errors (422 / field-level 409) into a React Hook Form. Returns the
 * message to show above the form when the error isn't tied to a known field.
 */
export function applyServerError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (err instanceof ApiClientError) {
    const fieldErrors = err.fieldErrors;
    let matched = false;
    for (const field of fields) {
      const message = fieldErrors[field];
      if (message) {
        setError(field, { type: 'server', message });
        matched = true;
      }
    }
    if (matched) return null;
  }
  return errorMessage(err);
}
