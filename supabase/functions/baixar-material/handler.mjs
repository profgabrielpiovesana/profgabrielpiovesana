const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function createHandler({ auth, db, storage, allowedOrigins }) {
  const allowed = new Set(allowedOrigins);
  return async request => {
    const origin = request.headers.get('Origin');
    const headers = {
      'Cache-Control': 'private, no-store', Pragma: 'no-cache', Vary: 'Origin, Authorization',
      ...(origin && allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    };
    const denied = status => new Response(JSON.stringify({ error: 'Material indisponível.' }), {
      status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
    if (origin && !allowed.has(origin)) return denied(403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    } });
    if (request.method !== 'POST') return denied(405);
    const bearer = /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '');
    if (!bearer) return denied(401);
    try {
      let input;
      try { input = await request.json(); } catch { return denied(400); }
      if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || !uuid(input.id)) return denied(400);
      const { data, error } = await auth.getUser(bearer[1]);
      if (error || !data?.user?.id) return denied(401);
      const material = await db.getMaterial(input.id, bearer[1]);
      if (!material?.object_path) return denied(403);
      const pdf = await storage.download(material.object_path);
      if (!(pdf instanceof Blob)) return denied(502);
      return new Response(pdf, { status: 200, headers: { ...headers, 'Content-Type': 'application/octet-stream' } });
    } catch { return denied(502); }
  };
}
