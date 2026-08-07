export function extractBearerToken(
  header: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  const [scheme, token] = value.split(' ');
  return scheme === 'Bearer' && token ? token : undefined;
}
