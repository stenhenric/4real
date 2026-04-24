import { useCallback } from 'react';
import { useToast } from '../app/ToastProvider';

export function useCopyToClipboard() {
  const { success, error } = useToast();

  return useCallback(
    async (text: string, successMessage = 'Copied to clipboard!') => {
      try {
        await navigator.clipboard.writeText(text);
        success(successMessage);
        return true;
      } catch {
        error('Failed to copy to clipboard.');
        return false;
      }
    },
    [error, success],
  );
}
