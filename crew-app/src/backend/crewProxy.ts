import { createHmac, timingSafeEqual } from 'node:crypto';
import { CREW_PROXY } from './crewProxyConfig.ts';

export interface VerifyInput {
  header: string | undefined;
  secret: string | undefined;
  nowMs: number;
  method: string;
  path: string; // as signed
  body: string; // as signed
}
export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_header' | 'missing_secret' | 'malformed' | 'stale' | 'bad_signature' };

function hmacHex(secret: string, timestamp: string, method: string, path: string, body: string): string {
  return createHmac('sha256', secret).update(CREW_PROXY.signedString(timestamp, method, path, body)).digest('hex');
}

/** Returns "<timestamp>:<hex hmac>". */
export function signCrewProxy(secret: string, timestamp: string, method: string, path: string, body: string): string {
  return `${timestamp}:${hmacHex(secret, timestamp, method, path, body)}`;
}

/** Deterministic and fail-closed. */
export function verifyCrewProxy(input: VerifyInput): VerifyResult {
  if (input.header === undefined || input.header === '') return { ok: false, reason: 'missing_header' };
  if (input.secret === undefined || input.secret === '') return { ok: false, reason: 'missing_secret' };
  const match = /^(\d+):([0-9a-f]{64})$/i.exec(input.header);
  if (!match) return { ok: false, reason: 'malformed' };
  const timestamp = match[1] as string;
  const signature = (match[2] as string).toLowerCase();
  if (Math.abs(input.nowMs / 1000 - Number(timestamp)) > CREW_PROXY.toleranceSeconds) return { ok: false, reason: 'stale' };
  const expected = Buffer.from(hmacHex(input.secret, timestamp, input.method, input.path, input.body), 'hex');
  const given = Buffer.from(signature, 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}
