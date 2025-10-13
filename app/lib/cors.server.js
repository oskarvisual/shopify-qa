const DEFAULT_METHODS = "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS";
const VARY_HEADER_VALUE = "Origin, Access-Control-Request-Headers, Access-Control-Request-Method";

export function cors(request, response, options = {}) {
  const origin = request.headers.get("Origin") || options.origin || "*";
  const allowMethods = options.allowMethods || DEFAULT_METHODS;
  const allowHeaders =
    options.allowHeaders || request.headers.get("Access-Control-Request-Headers") || "*";
  const allowCredentials = options.allowCredentials ?? true;

  const baseHeaders = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": allowMethods,
    "Access-Control-Allow-Headers": allowHeaders,
    "Vary": VARY_HEADER_VALUE,
  });

  if (allowCredentials) {
    baseHeaders.set("Access-Control-Allow-Credentials", "true");
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: options.preflightStatus || 204,
      headers: baseHeaders,
    });
  }

  const headers = response.headers;
  baseHeaders.forEach((value, key) => {
    if (key === "Vary" && headers.has("Vary")) {
      const existing = headers.get("Vary");
      if (!existing?.includes(value)) {
        headers.set("Vary", `${existing}, ${value}`);
      }
    } else {
      headers.set(key, value);
    }
  });

  return response;
}
