import type { IncomingMessage, ServerResponse } from 'http';

type InsightRequest = {
  regionName?: string;
  seasonal?: Array<{ month: string; value: number }>;
  annual?: Array<{ year: number; risk: number; low?: number; high?: number }>;
  drivers?: unknown;
};

function setCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readBody(req: IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 500_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export async function aiInsights(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    setCors(res);
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    setCors(res);
    res.statusCode = 501;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured on the server. Add it to your .env and restart dev server.' }));
    return;
  }

  let payload: InsightRequest;
  try {
    const raw = await readBody(req);
    payload = JSON.parse(raw || '{}');
  } catch {
    setCors(res);
    res.statusCode = 400;
    res.end('Invalid JSON body');
    return;
  }

  const { regionName, seasonal, annual, drivers } = payload;
  const prompt = `
You are an ocean risk analyst. Summarize hurricane risk for ${regionName ?? 'this region'} using:
- Seasonal monthly probabilities: ${JSON.stringify(seasonal ?? [])}
- Annual history + forecast with confidence bands: ${JSON.stringify(annual ?? [])}
- Drivers/SHAP/lag tests: ${JSON.stringify(drivers ?? [])}
Give 4–6 concise bullet points: current situation, near-term (next 12 months), longer-term (next decade), key drivers (with direction), and a short action note. Keep it under 120 words.`;

  try {
    const candidateModels = (
      [
        process.env.GEMINI_MODEL, // user override
        'gemini-2.5-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.0-flash-lite-001',
        'gemini-2.0-flash-001'
      ].filter(Boolean)
    ) as string[];

    const candidateBases = ['https://generativelanguage.googleapis.com/v1beta', 'https://generativelanguage.googleapis.com/v1'];

    let lastError: string | null = null;
    let text: string | null = null;

    for (const base of candidateBases) {
      for (const model of candidateModels) {
        try {
          const resp = await fetch(
            `${base}/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
              },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
              })
            }
          );

          if (!resp.ok) {
            const body = await resp.text();
            lastError = `Model ${model} @ ${base}: HTTP ${resp.status} ${body.slice(0, 400)}`;
            continue;
          }

          const json = await resp.json();
          text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
          if (text) {
            lastError = null;
            break;
          }
        } catch (inner) {
          lastError = `Model ${model} @ ${base}: ${(inner as Error).message}`;
        }
      }
      if (text) break;
    }

    if (!text) {
      throw new Error(lastError ?? 'No AI response from any model');
    }

    setCors(res);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ text }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini call failed';
    setCors(res);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: message }));
  }
}
