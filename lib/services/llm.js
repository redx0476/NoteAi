// LLM layer backed by OpenRouter (OpenAI-compatible chat completions).
// Generates meeting summaries, action items, and answers questions.

const OR_URL = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
const OR_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

const ALLOWED_MODELS = new Set([
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-120b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
]);

function modelChain(requested) {
  const first = requested && ALLOWED_MODELS.has(requested) ? requested : DEFAULT_MODEL;
  return [first, ...[...ALLOWED_MODELS].filter((m) => m !== first)];
}

function transcriptToText(segments) {
  return segments.map((s) => `${s.speaker}: ${s.text}`).join('\n');
}

async function callModel(model, system, user, maxTokens) {
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OR_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'NOTEAI',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text).choices?.[0]?.message?.content ?? '';
}

async function chat({ model, system, user, maxTokens = 1500 }) {
  if (!OR_KEY) throw new Error('OPENROUTER_API_KEY is not configured');
  const chain = modelChain(model);
  let lastErr;
  for (const m of chain) {
    try {
      return await callModel(m, system, user, maxTokens);
    } catch (err) {
      lastErr = err;
      if (err.status === 429 || err.status === 503 || err.status === 502) continue;
      throw err;
    }
  }
  throw new Error(`All free models were rate-limited. Last error: ${lastErr?.message}`);
}

/**
 * Generate structured notes from a transcript.
 * Returns { title, summary, actionItems:[{text,owner}], chapters:[{title,summary}], keywords:[string] }.
 */
async function summarizeMeeting(segments, model) {
  const transcript = transcriptToText(segments);
  if (!transcript.trim()) {
    return { title: 'Untitled meeting', summary: '', actionItems: [], chapters: [], keywords: [] };
  }

  const raw = await chat({
    model,
    maxTokens: 1800,
    system:
      'You are an expert meeting-notes assistant. Given a meeting transcript, produce concise, accurate, well-structured notes. ' +
      'Respond ONLY with valid JSON matching this exact shape: ' +
      '{"title": string, ' +
      '"summary": string (markdown: 2-4 short paragraphs or bullets), ' +
      '"actionItems": [{"text": string, "owner": string|null}], ' +
      '"chapters": [{"title": string, "summary": string}] (3-6 topic sections in chronological order), ' +
      '"keywords": [string] (5-10 key topics / terms)}. ' +
      'Do not invent facts not present in the transcript. Use the transcript language.',
    user: `Transcript:\n\n${transcript}`,
  });

  return safeParse(raw);
}

/** Answer a question about a meeting transcript (the "Ask" / chat feature). */
async function askMeeting(segments, question, model) {
  const transcript = transcriptToText(segments);
  return chat({
    model,
    maxTokens: 1000,
    system:
      'You answer questions about a meeting using ONLY the provided transcript. ' +
      'If the answer is not in the transcript, say so plainly.',
    user: `Transcript:\n\n${transcript}\n\nQuestion: ${question}`,
  });
}

function safeParse(raw) {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const json = start >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(json);
    return {
      title: parsed.title || 'Untitled meeting',
      summary: parsed.summary || '',
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  } catch {
    return { title: 'Untitled meeting', summary: raw, actionItems: [], chapters: [], keywords: [] };
  }
}

module.exports = { summarizeMeeting, askMeeting };
