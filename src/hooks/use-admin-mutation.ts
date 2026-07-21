import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Shared wrapper around useMutation for admin surfaces.
 *
 * - Displays a success toast (`successMessage` / dynamic via `onSuccessToast`)
 * - Displays a meaningful error toast, extracting server-function error
 *   messages consistently.
 * - Preserves per-call `onSuccess` / `onError` callbacks (invoked AFTER the
 *   toast so callers can still invalidate queries, close dialogs, etc.).
 */
export type AdminMutationOptions<TData, TError, TVariables, TContext> =
  UseMutationOptions<TData, TError, TVariables, TContext> & {
    successMessage?: string;
    onSuccessToast?: (data: TData, variables: TVariables) => string | undefined;
    errorMessage?: string;
    /** Suppress the automatic error toast (still returns the error to callers). */
    silentError?: boolean;
    /** Suppress the automatic success toast. */
    silentSuccess?: boolean;
  };

export function extractErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  const anyErr = err as { message?: unknown; error?: unknown; body?: { message?: string } };
  if (typeof anyErr.message === "string" && anyErr.message) return anyErr.message;
  if (typeof anyErr.error === "string" && anyErr.error) return anyErr.error;
  if (anyErr.body?.message) return anyErr.body.message;
  try {
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}

export function useAdminMutation<TData = unknown, TError = unknown, TVariables = void, TContext = unknown>(
  options: AdminMutationOptions<TData, TError, TVariables, TContext>,
) {
  const {
    successMessage,
    onSuccessToast,
    errorMessage,
    silentError,
    silentSuccess,
    onSuccess,
    onError,
    ...rest
  } = options;

  return useMutation<TData, TError, TVariables, TContext>({
    ...rest,
    onSuccess: (data, variables, context, mutateOpts) => {
      if (!silentSuccess) {
        const msg = onSuccessToast?.(data, variables) ?? successMessage;
        if (msg) toast.success(msg);
      }
      onSuccess?.(data, variables, context, mutateOpts);
    },
    onError: (error, variables, context, mutateOpts) => {
      if (!silentError) {
        toast.error(errorMessage ?? extractErrorMessage(error));
      }
      onError?.(error, variables, context, mutateOpts);
    },
  });
}