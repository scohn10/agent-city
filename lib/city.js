// Client-safe city config. No secrets here.

export const GRID = 5;
export const CENTER = { r: 2, c: 2 };
export const TILE_W = 132;
export const TILE_H = 66;
export const W2 = TILE_W / 2;
export const H2 = TILE_H / 2;

// height = body height, top = how far roof features rise above it, windows = columns of windows (0 = none)
export const STYLES = {
  tower:      { label: 'Tower',      good: 'Research, big projects',  height: 150, top: 50, footprint: 0.62, windows: 3 },
  deco:       { label: 'Spire',      good: 'Your flagship agent',     height: 150, top: 80, footprint: 0.6,  windows: 3 },
  office:     { label: 'Office',     good: 'Operations, admin',       height: 96,  top: 6,  footprint: 0.72, windows: 4 },
  bank:       { label: 'Exchange',   good: 'Money, investing',        height: 54,  top: 26, footprint: 0.82, windows: 0 },
  shop:       { label: 'Shop',       good: 'Sales, e-commerce',       height: 42,  top: 6,  footprint: 0.78, windows: 4 },
  showroom:   { label: 'Showroom',   good: 'Cars, listings, deals',   height: 40,  top: 22, footprint: 0.82, windows: 0 },
  studio:     { label: 'Studio',     good: 'Content, social, video',  height: 46,  top: 40, footprint: 0.78, windows: 4 },
  house:      { label: 'House',      good: 'Home, family',            height: 34,  top: 34, footprint: 0.6,  windows: 0 },
  factory:    { label: 'Factory',    good: 'Building, production',    height: 52,  top: 56, footprint: 0.8,  windows: 4 },
  warehouse:  { label: 'Warehouse',  good: 'Inventory, logistics',    height: 34,  top: 16, footprint: 0.86, windows: 0 },
  lab:        { label: 'Lab',        good: 'R&D, analysis',           height: 46,  top: 34, footprint: 0.7,  windows: 4 },
  greenhouse: { label: 'Greenhouse', good: 'Health, habits, growth',  height: 30,  top: 26, footprint: 0.76, windows: 0 },
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
