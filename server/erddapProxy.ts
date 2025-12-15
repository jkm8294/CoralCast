import type { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

const ALLOW_ORIGINS = new Set([
  'https://coastwatch.noaa.gov',
  'https://coastwatch.pfeg.noaa.gov',
  'https://erddap.marine.usf.edu',
  'https://data.pmel.noaa.gov',
  'https://erddap.secoora.org',
  'https://reynolds-erddap.umeoce.maine.edu',
  'https://www.nhc.noaa.gov'
]);

function isAllowed(target: string): boolean {
  try {
    const url = new URL(target);
    return ALLOW_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
}

function setCorsHeaders(res: ServerResponse, extraHeaders: Record<string, string> = {}) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
}

async function handleGet(req: IncomingMessage, res: ServerResponse) {
  const reqUrl = new URL(req.url ?? '', 'http://localhost');
  const raw = reqUrl.searchParams.get('url');

  if (!raw) {
    res.statusCode = 400;
    setCorsHeaders(res);
    res.end('Missing url');
    return;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    res.statusCode = 400;
    setCorsHeaders(res);
    res.end('Bad encoding');
    return;
  }

  if (!isAllowed(decoded)) {
    res.statusCode = 400;
    setCorsHeaders(res);
    res.end('Bad or disallowed url');
    return;
  }

  try {
    const upstream = await fetch(decoded, {
      method: 'GET',
      headers: {
        Accept: 'text/csv,application/json;q=0.9,*/*;q=0.8',
        'User-Agent': 'coral-health-index/1.0'
      },
      cache: 'no-store'
    });
    const text = await upstream.text();
    const contentType = upstream.headers.get('Content-Type') ?? 'text/plain';

    res.statusCode = upstream.status;
    setCorsHeaders(res, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    res.end(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upstream fetch failed';
    res.statusCode = 500;
    setCorsHeaders(res, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Proxy error: ${message}` }));
  }
}

export async function erddapProxy(req: IncomingMessage, res: ServerResponse) {
  if (!req.url) {
    res.statusCode = 400;
    setCorsHeaders(res);
    res.end('Missing url');
    return;
  }

  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    setCorsHeaders(res);
    res.end();
    return;
  }

  if (method !== 'GET') {
    res.statusCode = 405;
    setCorsHeaders(res);
    res.end('Method not allowed');
    return;
  }

  await handleGet(req, res);
}
