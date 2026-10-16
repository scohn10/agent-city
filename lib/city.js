// Client-safe city config. No secrets here.

export const GRID = 5;
export const CENTER = { r: 2, c: 2 };
export const TILE_W = 132;
export const TILE_H = 66;

export const STYLES = {
  tower:   { label: 'Tower',    height: 150, footprint: 0.62 },
  office:  { label: 'Office',   height: 96,  footprint: 0.72 },
  shop:    { label: 'Shop',     height: 42,  footprint: 0.78 },
  house:   { label: 'House',    height: 34,  footprint: 0.6  },
  factory: { label: 'Factory',  height: 52,  footprint: 0.8  },
  lab:     { label: 'Lab',      height: 46,  footprint: 0.7  },
};

export const COLORS = [
  { id: 'brick',  base: '#b5523b' },
  { id: 'slate',  base: '#4d6a8a' },
  { id: 'teal',   base: '#2f8f83' },
  { id: 'gold',   base: '#c9963a' },
  { id: 'plum',   base: '#7a4f86' },
  { id: 'stone',  base: '#8c8577' },
  { id: 'night',  base: '#2f3a52' },
  { id: 'coral',  base: '#d0705a' },
];

export const PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic API)',
    fields: ['apiKey', 'model'],
    defaults: { model: 'claude-sonnet-5-5' },
    help: 'Paste an Anthropic API key from console.anthropic.com. It stays in this browser and is only sent to the relay when the agent runs.',
  },
  openai: {
    label: 'OpenAI-compatible',
    fields: ['baseUrl', 'apiKey', 'model'],
    defaults: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-5' },
    help: 'Works with OpenAI or any service with a /chat/completions endpoint (OpenRouter, Groq, Together, a local gateway with a public URL).',
  },
  webhook: {
    label: 'Your own agent (webhook)',
    fields: ['url', 'secret'],
    defaults: {},
    help: 'We POST { agent, message, history } to your URL and show the reply. Return JSON { "reply": "..." } or plain text. Good for Claude Agent SDK, n8n, Zapier, or any custom agent.',
  },
  demo: {
    label: 'Demo agent (no key needed)',
    fields: [],
    defaults: {},
    help: 'A practice agent that answers with sample replies so you can try the city first. Switch it to a real AI any time from Edit.',
  },
};

export const FIELD_LABELS = {
  apiKey: 'API key',
  model: 'Model',
  baseUrl: 'Base URL',
  url: 'Webhook URL',
  secret: 'Shared secret (optional, sent as X-Agent-City-Secret)',
};

export function lotKey(r, c) { return `${r}-${c}`; }
export function isCenter(r, c) { return r === CENTER.r && c === CENTER.c; }

export function blankCity() {
  return { name: 'My City', agents: {}, version: 1 };
}
