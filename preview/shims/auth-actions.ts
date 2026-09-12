/**
 * Stands in for the server actions in app/auth-actions.ts.
 *
 * Server actions cannot run in a static preview, so these resolve without
 * doing anything. The forms that call them still render and still show their
 * pending state.
 */
export type AuthState = { error: string | null };

export async function signIn(): Promise<AuthState> {
  await new Promise((r) => setTimeout(r, 400));
  return { error: null };
}

export async function signUp(): Promise<AuthState> {
  await new Promise((r) => setTimeout(r, 400));
  return { error: null };
}

export async function signOut(): Promise<void> {
  return undefined;
}
