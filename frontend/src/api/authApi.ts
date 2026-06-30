import axios, { type AxiosError } from "axios";
import { http, setToken } from "./http";
import { DrawingApiError } from "./drawingApi";

// Auth client for /api/auth (register/login). On success it persists the JWT via
// setToken so the shared request interceptor authenticates every later call, and
// returns the decoded principal for the UI. Failures surface as DrawingApiError
// with a message already phrased for the user.

// Mirror of backend AuthResponse (Dtos/AuthDtos.cs).
export type AuthResult = {
  token: string;
  userId: string;
  email: string;
  expiresAt: string;
};

// Backend error body for /api/auth (see AuthController.MapError / validation).
type AuthErrorBody = {
  error?: string;
  message?: string;
  errors?: { field?: string; message?: string }[];
};

export async function register(email: string, password: string): Promise<AuthResult> {
  return authRequest("/api/auth/register", email, password);
}

export async function login(email: string, password: string): Promise<AuthResult> {
  return authRequest("/api/auth/login", email, password);
}

async function authRequest(
  path: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  try {
    const { data } = await http.post<AuthResult>(path, { email, password });
    setToken(data.token);
    return data;
  } catch (err) {
    throw new DrawingApiError(toFriendlyAuthMessage(err));
  }
}

// Translate any thrown auth error into one user-facing line. Pure/exported so it
// can be unit-tested without a live backend.
export function toFriendlyAuthMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return "Something went wrong. Please try again.";
  }

  const axiosErr = err as AxiosError<AuthErrorBody>;

  if (!axiosErr.response) {
    return "Could not reach the server. Is the backend running?";
  }

  const body = axiosErr.response.data;
  switch (body?.error) {
    case "email_already_exists":
      return "An account with this email already exists. Try signing in.";
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "validation_failed":
      // Surface the first field message (e.g. "Password must be at least 8 characters.").
      return body.errors?.[0]?.message ?? "Please check your email and password.";
    default:
      return body?.message ?? "Authentication failed. Please try again.";
  }
}
