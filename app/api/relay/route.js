// Server relay: forwards a message to the user's own agent (BYO key / webhook).
// Keys arrive per-request from the browser and are never stored or logged here.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_MSG = 8000;
const MAX_HISTORY = 20;

function bad(msg, status = 400) {
  return Response.json({ error: msg }, { status });
}

function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return null;
  }
  if (h.startsWith('[')) return null; // no raw IPv6 literals
  return u;
}

async function withTimeout(fn, ms = 55000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fn(ctl.signal); } finally { clearTimeout(t); }
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MSG) }));
}

async function callAnthropic(cfg, system, messages, signal) {
  if (!cfg.apiKey) throw new Error('Missing Anthropic API key');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model || 'claude-sonnet-5-5',
      max_tokens: 1500,
      system: system || undefined,
      messages,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic error ${res.status}`);
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

async function callOpenAI(cfg, system, messages, signal) {
  if (!cfg.apiKey) throw new Error('Missing API key');
  const base = safeUrl(cfg.baseUrl || 'https://api.openai.com/v1');
  if (!base) throw new Error('Base URL must be a public https URL');
  const url = base.href.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Provider error ${res.status}`);
  return (data?.choices?.[0]?.message?.content || '').trim();
}

function demoReply(agent, message) {
  const role = agent.role ? `I'd be handling "${agent.role}"` : 'I would be doing real work for you';
  const quote = message.length > 140 ? message.slice(0, 137) + '…' : message;
  return [
    `Hi, I'm ${agent.name}. Got your message: "${quote}"`,
    `I'm a demo agent, so this is a sample reply. Once you connect me, ${role} right here.`,
    'To connect me, tap Edit and choose Claude, another AI, or your own agent.',
  ].join('\n\n');
}

async function callWebhook(cfg, agent, message, history, signal) {
  const u = safeUrl(cfg.url);
  if (!u) throw new Error('Webhook URL must be a public https URL');
  const headers = { 'content-type': 'application/json' };
  if (cfg.secret) headers['x-agent-city-secret'] = cfg.secret;
  const res = await fetch(u, {
    method: 'POST',
    signal,
    headers,
    body: JSON.stringify({ agent: { name: agent.name, role: agent.role }, message, history }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
  try {
    const j = JSON.parse(text);
    return String(j.reply ?? j.text ?? j.output ?? j.message ?? text).trim();
  } catch {
    return text.trim();
  }
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return bad('Invalid JSON'); }

  const { agent, message, history } = body || {};
  if (!agent || typeof agent !== 'object') return bad('Missing agent');
  if (typeof message !== 'string' || !message.trim()) return bad('Missing message');
  if (message.length > MAX_MSG) return bad('Message too long');

  const conn = agent.connection || {};
  const system = [
    agent.instructions || '',
    `You are "${agent.name}", an agent living in a city dashboard called ${body.cityName || 'Agent City'}.${agent.role ? ` Your role: ${agent.role}.` : ''} Keep replies concise and actionable.`,
  ].filter(Boolean).join('\n\n');

  const msgs = [...cleanHistory(history), { role: 'user', content: message }];

  try {
    const reply = await withTimeout(signal => {
      if (conn.provider === 'anthropic') return callAnthropic(conn, system, msgs, signal);
      if (conn.provider === 'openai') return callOpenAI(conn, system, msgs, signal);
      if (conn.provider === 'demo') return new Promise(r => setTimeout(() => r(demoReply(agent, message)), 900));
      if (conn.provider === 'webhook') return callWebhook(conn, agent, message, cleanHistory(history), signal);
      throw new Error('Unknown provider');
    });
    return Response.json({ reply: reply || '(empty reply)' });
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'Agent timed out' : (e?.message || 'Relay failed');
    return bad(msg, 502);
  }
}
