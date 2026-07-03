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
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'qwen/qwen3-coder:free',
  'poolside/laguna-m.1:free',
  'poolside/laguna-xs-2.1:free',
  'poolside/laguna-xs.2:free',
  'cohere/north-mini-code:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'liquid/lfm-2.5-1.2b-thinking:free',
  'nvidia/nemotron-3.5-content-safety:free',
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
      // Keep chain-of-thought out of responses — reasoning models otherwise
      // leak "Let's parse…" preambles into answers and notes JSON.
      reasoning: { exclude: true },
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

async function chat({ model, system, user, maxTokens = 1500, validate }) {
  if (!OR_KEY) throw new Error('OPENROUTER_API_KEY is not configured');
  const chain = modelChain(model);
  let lastErr;
  for (const m of chain) {
    try {
      const raw = await callModel(m, system, user, maxTokens);
      // A validation throw falls through to the next model, same as a 429 —
      // some free models return malformed JSON that others get right.
      return validate ? validate(raw) : raw;
    } catch (err) {
      lastErr = err;
      if (err.status === 429 || err.status === 503 || err.status === 502 || err.invalidOutput) continue;
      throw err;
    }
  }
  throw new Error(`All free models failed. Last error: ${lastErr?.message}`);
}

/**
 * Generate structured notes from a transcript.
 * Returns { title, summary, objectives:[string], actionItems:[{text,owner}], chapters:[{title,summary}], keywords:[string] }.
 */
async function summarizeMeeting(segments, model) {
  const transcript = transcriptToText(segments);
  if (!transcript.trim()) {
    return { title: 'Untitled meeting', summary: '', objectives: [], actionItems: [], chapters: [], keywords: [] };
  }

  return chat({
    model,
    maxTokens: 1800,
    system:
      'You are an expert meeting-notes assistant. Given a meeting transcript, produce concise, accurate, well-structured notes. ' +
      'Respond ONLY with valid JSON matching this exact shape: ' +
      '{"title": string, ' +
      '"summary": string (markdown: 2-4 short paragraphs or bullets), ' +
      '"objectives": [string] (2-5 short statements of what the meeting aimed to achieve; [] if unclear), ' +
      '"actionItems": [{"text": string, "owner": string|null}], ' +
      '"chapters": [{"title": string, "summary": string}] (3-6 topic sections in chronological order), ' +
      '"keywords": [string] (5-10 key topics / terms)}. ' +
      'Do not invent facts not present in the transcript. Use the transcript language.',
    user: `Transcript:\n\n${transcript}`,
    validate: safeParse,
  });
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
  // Strip markdown code fences, then keep the outermost {...}.
  const stripped = raw.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const json = start >= 0 ? stripped.slice(start, end + 1) : stripped;

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    try {
      // Repair invalid escapes models sometimes emit (e.g. \) \G \uused).
      const repaired = json
        .replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u')
        .replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      parsed = JSON.parse(repaired);
    } catch {
      // Never fall back to storing the raw text as the summary — throw so
      // chat() retries the next model in the chain.
      const err = new Error('Model returned malformed notes JSON');
      err.invalidOutput = true;
      throw err;
    }
  }

  return {
    title: parsed.title || 'Untitled meeting',
    summary: parsed.summary || '',
    objectives: Array.isArray(parsed.objectives) ? parsed.objectives : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
    chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
  };
}

module.exports = { summarizeMeeting, askMeeting };
