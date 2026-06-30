import axios, { type AxiosError } from "axios";
import { http } from "./http";
import { DrawingApiError } from "./drawingApi";

// CRUD client for /api/drawings (save/list/load/delete). Every call is
// authenticated by the shared request interceptor (JWT). The command wire shape
// is { kind, params }: an opaque per-command field bag the backend stores
// verbatim (see DrawingDtos.cs). Conversion to/from SceneObject lives in
// pipeline/savedDrawing.ts, keeping this module a thin transport.

// One command on the wire (mirror of backend DrawingCommandDto(Kind, Params)).
export type SavedCommandDto = {
  kind: string;
  params: Record<string, unknown>;
};

// Body for POST (create) / PUT (update).
export type SaveDrawingRequest = {
  prompt: string;
  title?: string | null;
  thumbnailB64?: string | null;
  commands: SavedCommandDto[];
};

// List-item shape (GET /api/drawings) — headers + thumbnail, no commands.
export type DrawingSummary = {
  id: number;
  prompt: string;
  title: string | null;
  thumbnailB64: string | null;
  createdAt: string;
  updatedAt: string;
};

// Full drawing (GET /api/drawings/{id}, and echoed on create/update).
export type DrawingDetail = DrawingSummary & {
  commands: SavedCommandDto[];
};

export type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export async function saveDrawing(request: SaveDrawingRequest): Promise<DrawingDetail> {
  try {
    const { data } = await http.post<DrawingDetail>("/api/drawings", request);
    return data;
  } catch (err) {
    throw new DrawingApiError(toFriendlyDrawingsMessage(err));
  }
}

export async function updateDrawing(
  id: number,
  request: SaveDrawingRequest,
): Promise<DrawingDetail> {
  try {
    const { data } = await http.put<DrawingDetail>(`/api/drawings/${id}`, request);
    return data;
  } catch (err) {
    throw new DrawingApiError(toFriendlyDrawingsMessage(err));
  }
}

export async function listDrawings(
  page = 1,
  pageSize = 20,
): Promise<PagedResult<DrawingSummary>> {
  try {
    const { data } = await http.get<PagedResult<DrawingSummary>>("/api/drawings", {
      params: { page, pageSize },
    });
    return data;
  } catch (err) {
    throw new DrawingApiError(toFriendlyDrawingsMessage(err));
  }
}

export async function getDrawing(id: number): Promise<DrawingDetail> {
  try {
    const { data } = await http.get<DrawingDetail>(`/api/drawings/${id}`);
    return data;
  } catch (err) {
    throw new DrawingApiError(toFriendlyDrawingsMessage(err));
  }
}

export async function deleteDrawing(id: number): Promise<void> {
  try {
    await http.delete(`/api/drawings/${id}`);
  } catch (err) {
    throw new DrawingApiError(toFriendlyDrawingsMessage(err));
  }
}

// Backend error body for /api/drawings (validation_failed / not_found).
type DrawingsErrorBody = {
  error?: string;
  message?: string;
  errors?: { field?: string; message?: string }[];
};

// Translate any thrown drawings-API error into one user-facing line. Pure/
// exported so it can be unit-tested without a live backend.
export function toFriendlyDrawingsMessage(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return "Something went wrong while saving your drawing.";
  }

  const axiosErr = err as AxiosError<DrawingsErrorBody>;

  if (!axiosErr.response) {
    return "Could not reach the server. Is the backend running?";
  }

  // The 401 interceptor already routes back to login; this is the interim message.
  if (axiosErr.response.status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  const body = axiosErr.response.data;
  switch (body?.error) {
    case "not_found":
      return "That drawing no longer exists.";
    case "validation_failed":
      return body.errors?.[0]?.message ?? "The drawing could not be saved.";
    default:
      return body?.message ?? "The server returned an error. Please try again.";
  }
}
