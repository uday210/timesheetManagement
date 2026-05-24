/**
 * deviceAuth.ts — shared-secret check for the device command endpoints.
 * Controls a physical device, so every call must carry the bearer token.
 */
export function deviceAuthorized(request: Request): boolean {
  const token = process.env.DEVICE_API_TOKEN;
  if (!token) return false; // not configured → deny everything
  return (request.headers.get("authorization") || "") === `Bearer ${token}`;
}
