import {
  HUD_SUMMARY_INSTRUCTIONS,
  keylessHudSummaryResponse,
} from '../../../src/hudSummaryResponse.js';
import { enforceOptInRateLimit, openAiRateLimiter } from './rate-limit.js';
import { readRequestBody } from '../common/request.js';
import { OPENAI_HUD_SUMMARY_MODEL_DEFAULT } from './constants.js';

function extractOpenAiResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (!Array.isArray(data?.output)) return '';
  return data.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((part) => part?.text || part?.output_text || '')
    .join(' ')
    .trim();
}

function toFiveWordHudSummary(value) {
  return String(value || '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
}

function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY ||
    ''
  ).trim();
}

async function generateGeminiHudSummary(geminiKey, context) {
  const models = [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3.8-flash',
  ].filter(Boolean);

  const attempts = [];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    try {
      // First attempt with standard generation config
      let response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${HUD_SUMMARY_INSTRUCTIONS}\n\nContext data:\n${JSON.stringify(context)}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
          },
        }),
      });

      // If bad request, retry with thinkingBudget: 0 in case thinking tokens are required to be off
      if (!response.ok && response.status === 400) {
        const retryResp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${HUD_SUMMARY_INSTRUCTIONS}\n\nContext data:\n${JSON.stringify(context)}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 500,
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          }),
        });
        if (retryResp.ok) {
          response = retryResp;
        }
      }

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const answerPart =
          parts.find(
            (p) => !p.thought && typeof p.text === 'string' && p.text.trim(),
          ) || parts[0];
        const rawText = answerPart?.text || '';
        const summary = toFiveWordHudSummary(rawText);
        if (summary) {
          return {
            summary,
            model,
            finishReason: data?.candidates?.[0]?.finishReason,
          };
        }
        attempts.push({
          model,
          status: 200,
          reason: 'empty_summary',
          candidate: data?.candidates?.[0],
        });
      } else {
        const errText = await response.text().catch(() => '');
        let parsedMessage = errText.slice(0, 200);
        try {
          const parsed = JSON.parse(errText);
          parsedMessage = parsed?.error?.message || parsedMessage;
        } catch {}
        attempts.push({ model, status: response.status, error: parsedMessage });
      }
    } catch (err) {
      attempts.push({ model, error: err.message });
    }
  }

  return { error: 'Gemini API request failed', attempts };
}

async function handleHudSummary(req, res) {
  const geminiKey = getGeminiApiKey();
  const openAiKey = (process.env.OPENAI_API_KEY || '').trim();

  // Status check via GET
  if (req.method === 'GET') {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const testParam = parsedUrl.searchParams.get('test');
    const modelsParam = parsedUrl.searchParams.get('models');
    const probeModel = parsedUrl.searchParams.get('model');

    if (modelsParam && geminiKey) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
        );
        const data = await resp.json().catch(() => ({}));
        const modelNames = Array.isArray(data?.models)
          ? data.models.map((m) => m.name?.replace('models/', ''))
          : data;
        res.statusCode = resp.ok ? 200 : resp.status || 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ ok: resp.ok, models: modelNames }));
        return;
      } catch (err) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    if (probeModel && geminiKey) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${probeModel}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Five words describing Tokyo' }] }],
            }),
          },
        );
        const data = await resp.json().catch(() => ({}));
        res.statusCode = resp.ok ? 200 : resp.status || 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ ok: resp.ok, model: probeModel, data }));
        return;
      } catch (err) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    if (testParam && geminiKey) {
      const testResult = await generateGeminiHudSummary(geminiKey, {
        place: 'Tokyo',
        nearbyPlaces: ['Tokyo Bay', 'Shibuya'],
      });
      res.statusCode = testResult.summary ? 200 : 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          ...testResult,
          provider: 'gemini',
        }),
      );
      return;
    }

    const detectedKeys = [];
    if (process.env.GEMINI_API_KEY) detectedKeys.push('GEMINI_API_KEY');
    if (process.env.GOOGLE_API_KEY) detectedKeys.push('GOOGLE_API_KEY');
    if (process.env.GEMINI_KEY) detectedKeys.push('GEMINI_KEY');
    if (process.env.OPENAI_API_KEY) detectedKeys.push('OPENAI_API_KEY');

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        geminiConfigured: Boolean(geminiKey),
        openAiConfigured: Boolean(openAiKey),
        activeProvider: geminiKey ? 'gemini' : openAiKey ? 'openai' : 'none',
        detectedKeys,
      }),
    );
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // If neither Gemini nor OpenAI is configured, return graceful unconfigured payload
  if (!geminiKey && !openAiKey) {
    const keyless = keylessHudSummaryResponse(openAiKey);
    res.statusCode = keyless.statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(keyless.payload));
    return;
  }

  // Opt-in rate limiting
  if (!enforceOptInRateLimit(openAiRateLimiter(), req, res)) return;

  try {
    const body = await readRequestBody(req, 64 * 1024);
    const context = JSON.parse(body || '{}');

    // 1. Prefer Gemini if configured
    if (geminiKey) {
      const result = await generateGeminiHudSummary(geminiKey, context);
      if (result.summary) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            summary: result.summary,
            provider: 'gemini',
            error: null,
          }),
        );
        return;
      }
      // If Gemini errored and OpenAI is not configured, report error
      if (!openAiKey) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            summary: null,
            error: result.error || 'Gemini HUD summary request failed',
          }),
        );
        return;
      }
    }

    // 2. Fall back to OpenAI
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:
          process.env.OPENAI_HUD_SUMMARY_MODEL ||
          OPENAI_HUD_SUMMARY_MODEL_DEFAULT,
        instructions: HUD_SUMMARY_INSTRUCTIONS,
        input: JSON.stringify(context),
        reasoning: { effort: 'minimal' },
        max_output_tokens: 100,
      }),
    });
    const data = await response.json().catch(() => ({}));
    const summary = toFiveWordHudSummary(extractOpenAiResponseText(data));
    res.statusCode = response.ok && summary ? 200 : response.status || 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (!response.ok)
      console.warn(`[hud-summary] upstream HTTP ${response.status}`);
    res.end(
      JSON.stringify({
        summary: summary || null,
        provider: 'openai',
        error: response.ok ? null : 'OpenAI HUD summary request failed',
      }),
    );
  } catch (err) {
    console.warn('[hud-summary] request failed:', err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'AI HUD summary request failed',
        details: err?.message || String(err),
      }),
    );
  }
}

export { handleHudSummary };
