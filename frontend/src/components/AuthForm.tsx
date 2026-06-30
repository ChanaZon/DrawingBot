import { useState } from "react";
import { login, register } from "../api/authApi";
import { DrawingApiError } from "../api/drawingApi";
import { useAppDispatch } from "../store";
import { setAuthenticated } from "../store/drawingSlice";

// Phase 6 gate: the whole app is behind auth because every backend route
// (/api/draw/parse included) now requires a JWT. On success the token is already
// persisted by authApi; here we just flip the store into the authenticated state.
type Mode = "login" | "register";

export function AuthForm() {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
      dispatch(setAuthenticated(true));
    } catch (err) {
      const message =
        err instanceof DrawingApiError
          ? err.message
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleMode() {
    setMode(isRegister ? "login" : "register");
    setError(null);
  }

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-xl font-semibold text-gray-800">
        {isRegister ? "Create an account" : "Sign in"}
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        {isRegister
          ? "Register to start drawing and save your work."
          : "Sign in to draw and load your saved drawings."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={isSubmitting}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={isRegister ? "new-password" : "current-password"}
            disabled={isSubmitting}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
          />
          {isRegister && (
            <span className="text-xs font-normal text-gray-400">
              At least 8 characters.
            </span>
          )}
        </label>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting
            ? isRegister
              ? "Creating account..."
              : "Signing in..."
            : isRegister
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={toggleMode}
        disabled={isSubmitting}
        className="mt-4 w-full text-center text-sm text-indigo-600 hover:underline disabled:opacity-50"
      >
        {isRegister
          ? "Already have an account? Sign in"
          : "Need an account? Register"}
      </button>
    </div>
  );
}
