export function shouldClearAuthAfterRefreshError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'status' in error
    && (error as { status?: unknown }).status === 401
  );
}
