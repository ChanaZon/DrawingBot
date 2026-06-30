import axios from "axios";

// Shared axios instance for every backend call. Centralizes the base URL, the
// JWT bearer token (attached on each request), and a single 401 handler so the
// whole app reacts to an expired/invalid token in one place.
//
// Security (CLAUDE.md): the frontend never holds an LLM API key. The only secret
// it stores is the user's own JWT, kept in localStorage and sent as
// `Authorization: Bearer <token>` on protected routes (/api/draw/parse, /api/drawings).

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

// localStorage key for the persisted JWT. Survives reloads so the user stays
// signed in; cleared on logout or on any 401.
const TOKEN_KEY = "drawing-bot-token";

// localStorage access is wrapped because it throws in private-mode / disabled
// storage. A missing token simply means "not authenticated", never a crash.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore: the in-memory interceptor still attaches the token for this session.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore.
  }
}

export const http = axios.create({ baseURL });

// Attach the bearer token (if any) to every outgoing request.
http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A single app-level reaction to "the server rejected our token". The App wires
// this to clear auth state and show the login form. Kept as a settable callback
// so this module stays decoupled from Redux.
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // The token is gone or no longer accepted — drop it and notify the app so
      // it can route back to the login screen instead of looping failed calls.
      clearToken();
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);
