import { httpError } from '../model.ts';
import type { Claims, InstitutionId } from '../model.ts';
export interface SadhanaHttpEvent {
  rawPath?: string;
  path?: string;
  pathParameters?: { proxy?: string };
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined> | null;
  requestContext?: {
    stage?: string;
    http?: { method?: string };
    authorizer?: { jwt?: { claims?: Claims } };
  };
}
export interface JsonResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
export const json = (statusCode: number, body: unknown): JsonResponse => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});
export const readPhotoJSON = (raw: string): Record<string, unknown> => {
  if (raw.length > 310000)
    throw httpError(413, 'Profile photo upload exceeds the 220 KB image limit.');
  try {
    const value: unknown = JSON.parse(raw);
    return value as Record<string, unknown>;
  } catch {
    throw httpError(400, 'Invalid photo upload request.');
  }
};
export const readJSON = (raw: string): Record<string, any> => {
  if (!raw) return {};
  if (raw.length > 25000) throw httpError(413, 'Request exceeds the permitted size.');
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, 'Invalid JSON request.');
  }
};
export interface RouteContext {
  event: SadhanaHttpEvent;
  parts: string[];
  method: string | undefined;
  query: Record<string, string | undefined>;
  inst: InstitutionId;
  claims: Claims;
  groups: InstitutionId[];
}
export type DomainRoute = (context: RouteContext) => Promise<JsonResponse | undefined>;
