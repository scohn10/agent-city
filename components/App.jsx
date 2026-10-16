'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import CityMap, { buildingArt } from './CityMap';
import { STYLES, COLORS, PROVIDERS, FIELD_LABELS, GRID, W2, H2, blankCity } from '../lib/city';

const STORE_KEY = 'agentcity:v1';
const TOUR_KEY = 'agentcity:tour';
const TOUR_LOT = '1-2';
const TOUR_STEPS = { plus: 1, form: 2, chat: 3, station: 4, finish: 4 };
const STARTERS = [
  'Introduce yourself and tell me how you can help.',
  'Give me three things to focus on this week.',
  'What should I set you up to do first?',
];

function loadTour() {
  try { return localStorage.getItem(TOUR_KEY); } catch { return null; }
}
function saveTour(step) {
  try { localStorage.setItem(TOUR_KEY, step); } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && typeof c === 'object' && c.agents ? c : null;
  } catch { return null; }
}
function save(city) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(city)); } catch {}
}

function uid() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}

async function relay(agent, message, history, cityName) {
  const res = await fetch('/api/relay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent: { name: agent.name, role: agent.role, instructions: agent.instructions, connection: agent.connection },
      message,
      history: history.map(m => ({ role: m.role, content: m.content })),
      cityName,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data.reply;
}

/* ---------------- Add / edit agent ---------------- */

function StyleSwatch({ style, color, selected, onClick }) {
  const st = STYLES[style];
  const { parts } = buildingArt({ style, color, seed: 3, pad: false });
  const a = W2 * st.footprint, b = H2 * st.footprint;
  const top = -(st.height + st.top) - 6;
  const vb = `${-a - 14} ${top} ${2 * a + 28} ${b - top + 6}`;
  return (
    <button type="button" className={`swatch ${selected ? 'on' : ''}`} onClick={onClick} aria-pressed={selected}>
      <svg viewBox={vb} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <ellipse cx="6" cy={b * 0.9} rx={a * 1.05} ry={b * 0.55} fill="#000" opacity="0.1" />
        {parts}
      </svg>
      <span className="sw-name">{st.label}</span>
      <span className="sw-good">{st.good}</span>
    </button>
  );
}

function AgentForm({ initial, onSave, onCancel, cityName, defaultProvider = 'anthropic' }) {
  const [a, setA] = useState(() => initial || {
    name: '', role: '', instructions: '', style: 'office', color: 'slate',
    connection: { provider: defaultProvider, ...PROVIDERS[defaultProvider].defaults },
  });
  const [test, setTest] = useState(null);
  const prov = PROVIDERS[a.connection.provider];

  const set = (k, v) => setA(p => ({ ...p, [k]: v }));
  const setConn = (k, v) => setA(p => ({ ...p, connection: { ...p.connection, [k]: v } }));
  const setProvider = id => setA(p => ({ ...p, connection: { provider: id, ...PROVIDERS[id].defaults } }));

  const ready = a.name.trim() && prov.fields.filter(f => f !== 'secret').every(f => (a.connection[f] || '').trim());

  async function runTest() {
    setTest({ state: 'busy' });
    try {
      const reply = await relay(a, 'Connection check from Agent City. Reply with one short sentence introducing yourself.', [], cityName);
      setTest({ state: 'ok', text: reply });
    } catch (e) {
      setTest({ state: 'err', text: e.message });
    }
  }

  return (
    <form className="form" onSubmit={e => { e.preventDefault(); if (ready) onSave(a); }}>
      <label>Agent name
        <input autoFocus value={a.name} maxLength={40} onChange={e => set('name', e.target.value)} placeholder="e.g. Ledger, Scout, Atlas" />
      </label>
      <label>What does it do?
        <input value={a.role} maxLength={120} onChange={e => set('role', e.target.value)} placeholder="e.g. Tracks my budget and flags overspending" />
      </label>

      <fieldset>
        <legend>Pick a building</legend>
        <div className="swatches">
          {Object.keys(STYLES).map(s => (
            <StyleSwatch key={s} style={s} color={a.color} selected={a.style === s} onClick={() => set('style', s)} />
          ))}
        </div>
        <div className="colors" role="radiogroup" aria-label="Color">
          {COLORS.map(c => (
            <button type="button" key={c.id} className={`dot ${a.color === c.id ? 'on' : ''}`}
              style={{ background: c.base }} onClick={() => set('color', c.id)} aria-label={c.id} aria-pressed={a.color === c.id} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Connect your agent</legend>
        <div className="seg">
          {Object.entries(PROVIDERS).map(([id, p]) => (
            <button type="button" key={id} className={a.connection.provider === id ? 'on' : ''} onClick={() => setProvider(id)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="hint">{prov.help}</p>
        {prov.fields.map(f => (
          <label key={f}>{FIELD_LABELS[f]}
            <input
              type={f === 'apiKey' || f === 'secret' ? 'password' : 'text'}
              autoComplete="off" spellCheck={false}
              value={a.connection[f] || ''}
              onChange={e => setConn(f, e.target.value)}
              placeholder={f === 'url' ? 'https://your-agent.example.com/run' : ''}
            />
          </label>
        ))}
        {a.connection.provider !== 'webhook' && a.connection.provider !== 'demo' && (
          <label>Standing instructions (optional)
            <textarea rows={3} value={a.instructions} onChange={e => set('instructions', e.target.value)}
              placeholder="How this agent should think, what to focus on, what to avoid." />
          </label>
        )}
        <div className="row">
          <button type="button" className="ghost" disabled={!ready || test?.state === 'busy'} onClick={runTest}>
            {test?.state === 'busy' ? 'Testing…' : 'Test connection'}
          </button>
          {test?.state === 'ok' && <span className="ok">Connected</span>}
          {test?.state === 'err' && <span className="err">Failed</span>}
        </div>
        {test?.text && <p className={`testout ${test.state}`}>{test.text}</p>}
      </fieldset>

      <div className="actions">
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={!ready}>{initial ? 'Save changes' : 'Build it'}</button>
      </div>
    </form>
  );
}

/* ---------------- Chat ---------------- */

function Chat({ messages, busy, onSend, placeholder, suggestions }) {
  const [text, setText] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, busy]);
  return (
    <div className="chat">
      <div className="msgs">
        {messages.length === 0 && !suggestions && <p className="empty">No messages yet. Give it a task.</p>}
        {messages.length === 0 && suggestions && (
          <div className="chips">
            {suggestions.map(t => (
              <button key={t} type="button" className="chip" disabled={busy} onClick={() => onSend(t)}>{t}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? 'error' : ''}`}>
            {m.from && <div className="from">{m.from}</div>}
            <div className="body">{m.content}</div>
          </div>
        ))}
        {busy && <div className="msg assistant typing"><span /><span /><span /></div>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={e => { e.preventDefault(); const t = text.trim(); if (!t || busy) return; setText(''); onSend(t); }}>
        <textarea rows={1} value={text} placeholder={placeholder}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
        <button className="primary" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  );
}

/* ---------------- Tour ---------------- */

function Welcome({ cityName, onName, onStart, onSkip }) {
  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="modal">
        <svg className="modal-art" viewBox="-60 -44 120 70" aria-hidden="true">
          <polygon points="0,-20 50,5 0,30 -50,5" fill="#86b86c" />
          <polygon points="0,-20 50,5 0,30 -50,5" fill="none" stroke="#6c9c56" />
          <polygon points="-14,-8 0,-15 14,-8 0,-1" fill="#e8dfc5" />
          <polygon points="-14,-8 0,-1 0,14 -14,7" fill="#d9cdae" />
          <polygon points="0,-1 14,-8 14,7 0,14" fill="#b9ad92" />
          <line x1="0" y1="-15" x2="0" y2="-34" stroke="#4b4a45" strokeWidth="1.4" />
          <path d="M 0 -34 l 12 3 l -12 4 z" fill="#c9963a" />
          <circle cx="-30" cy="6" r="5" fill="#3d7f4b" /><circle cx="30" cy="6" r="5" fill="#4f9a5a" />
          <circle cx="-6" cy="22" r="4" fill="#4f9a5a" />
        </svg>
        <h2 id="welcome-title">Welcome to Agent City</h2>
        <p className="lede">Build a city where every building is an AI agent working for you.</p>
        <ol className="how">
          <li><b>Every park is an empty lot.</b> Tap a <span className="kbd">+</span> to build an agent there.</li>
          <li><b>Connect it to any AI:</b> Claude, another model, or an agent you built yourself.</li>
          <li><b>Central Station runs the city.</b> See every agent and ask them all at once.</li>
        </ol>
        <label className="namefield">First, name your city
          <input value={cityName} maxLength={40} onChange={e => onName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onStart()} />
        </label>
        <div className="actions">
          <button className="ghost" onClick={onSkip}>Skip the tour</button>
          <button className="primary" onClick={onStart}>Start the tour</button>
        </div>
      </div>
    </div>
  );
}

function StepTag({ step }) {
  return <span className="steptag">Step {TOUR_STEPS[step]} of 4</span>;
}

function Coach({ step, title, children, onSkip, action }) {
  return (
    <div className="coach" role="status">
      <div className="coach-head">
        <StepTag step={step} />
        <button className="linkbtn" onClick={onSkip}>Skip tour</button>
      </div>
      <strong>{title}</strong>
      <p>{children}</p>
      {action}
    </div>
  );
}

function TourNote({ step, title, children, onSkip, action }) {
  return (
    <div className="tournote">
      <div className="coach-head">
        {TOUR_STEPS[step] ? <StepTag step={step} /> : <span />}
        {onSkip && <button className="linkbtn" onClick={onSkip}>Skip tour</button>}
      </div>
      <strong>{title}</strong>
      <div>{children}</div>
      {action}
    </div>
  );
}

/* ---------------- App ---------------- */

export default function App() {
  const [city, setCity] = useState(blankCity);
  const [loaded, setLoaded] = useState(false);
  const [statuses, setStatuses] = useState({});
  const [view, setView] = useState(null); // {type:'add'|'agent'|'edit'|'central', lot}
  const [broadcast, setBroadcast] = useState([]);
  const [broadcasting, setBroadcasting] = useState(false);
  const [tour, setTourState] = useState(null); // welcome | plus | form | chat | station | finish | done
  const tourRef = useRef(tour);
  tourRef.current = tour;
  const setTour = step => { setTourState(step); saveTour(step); };
  const fileRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const c = load();
    if (c) setCity(c);
    const t = loadTour();
    setTourState(t || (c && Object.keys(c.agents).length ? 'done' : 'welcome'));
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) save(city); }, [city, loaded]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeViewRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const agents = city.agents;
  const count = Object.keys(agents).length;
  const lotsTotal = GRID * GRID - 1;

  const updateAgent = (lot, fn) => setCity(c => {
    if (!c.agents[lot]) return c;
    return { ...c, agents: { ...c.agents, [lot]: fn(c.agents[lot]) } };
  });

  function closeView() {
    setView(null);
    if (tourRef.current === 'form') setTour('plus');
  }
  const closeViewRef = useRef(closeView);
  closeViewRef.current = closeView;

  function addAt(lot) {
    setView({ type: 'add', lot });
    if (tourRef.current === 'plus') setTour('form');
  }

  function openCentral() {
    setView({ type: 'central' });
    if (tourRef.current === 'station') setTour('finish');
  }

  function openAgent(lot) {
    setView({ type: 'agent', lot });
    updateAgent(lot, a => ({ ...a, unread: 0 }));
  }

  async function sendTo(lot, text) {
    const agent = city.agents[lot];
    if (!agent) return;
    const prior = agent.history || [];
    const userMsg = { role: 'user', content: text, ts: Date.now() };
    updateAgent(lot, a => ({ ...a, history: [...(a.history || []), userMsg] }));
    setStatuses(s => ({ ...s, [lot]: 'busy' }));
    try {
      const reply = await relay(agent, text, prior, city.name);
      const watching = viewRef.current?.type === 'agent' && viewRef.current?.lot === lot;
      updateAgent(lot, a => ({
        ...a,
        history: [...(a.history || []), { role: 'assistant', content: reply, ts: Date.now() }].slice(-60),
        unread: watching ? 0 : (a.unread || 0) + 1,
      }));
      setStatuses(s => ({ ...s, [lot]: 'idle' }));
      if (tourRef.current === 'chat') setTour('station');
      return reply;
    } catch (e) {
      updateAgent(lot, a => ({ ...a, history: [...(a.history || []), { role: 'assistant', content: e.message, error: true, ts: Date.now() }] }));
      setStatuses(s => ({ ...s, [lot]: 'error' }));
      throw e;
    }
  }

  async function askEveryone(text) {
    const lots = Object.keys(city.agents);
    if (!lots.length) return;
    setBroadcasting(true);
    setBroadcast(b => [...b, { role: 'user', content: text }]);
    await Promise.all(lots.map(async lot => {
      const name = city.agents[lot].name;
      try {
        const reply = await sendTo(lot, text);
        setBroadcast(b => [...b, { role: 'assistant', from: name, content: reply }]);
      } catch (e) {
        setBroadcast(b => [...b, { role: 'assistant', from: name, content: e.message, error: true }]);
      }
    }));
    setBroadcasting(false);
  }

  function saveAgent(lot, data, isNew) {
    setCity(c => ({
      ...c,
      agents: {
        ...c.agents,
        [lot]: isNew
          ? { ...data, id: uid(), createdAt: Date.now(), history: [], unread: 0 }
          : { ...c.agents[lot], ...data },
      },
    }));
    setView({ type: 'agent', lot });
    if (isNew && tourRef.current === 'form') setTour('chat');
  }

  function removeAgent(lot) {
    const a = city.agents[lot];
    if (!a || !confirm(`Demolish ${a.name}? The lot goes back to a park and its chat history is deleted.`)) return;
    setCity(c => { const next = { ...c.agents }; delete next[lot]; return { ...c, agents: next }; });
    setStatuses(s => { const n = { ...s }; delete n[lot]; return n; });
    setView(null);
  }

  function exportCity() {
    const strip = Object.fromEntries(Object.entries(city.agents).map(([k, a]) => {
      const { apiKey, secret, ...conn } = a.connection || {};
      return [k, { ...a, history: [], unread: 0, connection: conn }];
    }));
    const blob = new Blob([JSON.stringify({ ...city, agents: strip }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(city.name || 'city').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importCity(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const c = JSON.parse(r.result);
        if (!c || typeof c.agents !== 'object') throw new Error();
        setCity({ ...blankCity(), ...c });
        setView(null);
      } catch { alert('That file is not a city export.'); }
    };
    r.readAsText(file);
  }

  const current = view?.lot ? agents[view.lot] : null;
  const tourLot = !agents[TOUR_LOT] ? TOUR_LOT
    : Array.from({ length: GRID * GRID }, (_, i) => `${Math.floor(i / GRID)}-${i % GRID}`)
        .find(k => k !== '2-2' && !agents[k]) || null;
  const panelOpen = !!view;

  return (
    <div className={`shell ${panelOpen ? 'with-panel' : ''}`}>
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 3 21 8v8l-9 5-9-5V8z" fill="#c9963a" /><path d="M12 3v18M3 8l9 5 9-5" stroke="#fff" strokeWidth="1.4" fill="none" /></svg>
          </span>
          <span className="name">Agent City</span>
        </div>
        <input className="cityname" aria-label="City name" value={city.name} maxLength={40}
          onChange={e => setCity(c => ({ ...c, name: e.target.value }))} />
        <div className="meta">{count}/{lotsTotal} lots built</div>
        <button className="ghost helpbtn" onClick={() => { setView(null); setTour('welcome'); }} aria-label="Restart the tour">Tour</button>
      </header>

      <main className="stage">
        <CityMap agents={agents} statuses={statuses}
          onAdd={addAt}
          onOpen={openAgent}
          onOpenCentral={openCentral}
          spotlight={!panelOpen && tour === 'plus' ? tourLot : !panelOpen && tour === 'station' ? 'center' : null} />
        {loaded && tour === 'plus' && !panelOpen && (
          <Coach step="plus" title="Build your first agent" onSkip={() => setTour('done')}>
            Tap the <b>+</b> under the arrow. Any park works; we've picked one for you.
          </Coach>
        )}
        {loaded && tour === 'station' && !panelOpen && (
          <Coach step="station" title="Meet Central Station" onSkip={() => setTour('done')}>
            Replies show up as bubbles over your buildings. Now tap <b>Central Station</b>, the hub where every agent reports in.
          </Coach>
        )}
        {loaded && tour === 'done' && count === 0 && !panelOpen && (
          <div className="intro">
            <strong>Your city is all parks.</strong>
            <span>Tap any <b>+</b> to build your first agent, then connect it to Claude, another AI, or your own agent.</span>
          </div>
        )}
      </main>

      {panelOpen && <div className="scrim" onClick={closeView} />}
      {panelOpen && (
        <aside className="panel" role="dialog" aria-modal="true">
          <button className="close" onClick={closeView} aria-label="Close">×</button>

          {view.type === 'add' && (
            <>
              <h2>Build an agent</h2>
              <p className="sub">This park becomes your agent's building.</p>
              {tour === 'form' && (
                <TourNote step="form" title="Set it up" onSkip={() => setTour('done')}>
                  Give it a name, pick a building, and choose how it thinks. No API key yet? Leave it on <b>Demo agent</b>. You can connect a real AI later from <b>Edit</b>.
                </TourNote>
              )}
              <AgentForm cityName={city.name} defaultProvider={tour === 'form' ? 'demo' : 'anthropic'}
                onCancel={closeView} onSave={d => saveAgent(view.lot, d, true)} />
            </>
          )}

          {view.type === 'edit' && current && (
            <>
              <h2>Edit {current.name}</h2>
              <AgentForm cityName={city.name} initial={current} onCancel={() => setView({ type: 'agent', lot: view.lot })} onSave={d => saveAgent(view.lot, d, false)} />
            </>
          )}

          {view.type === 'agent' && current && (
            <>
              <h2>{current.name}</h2>
              <p className="sub">
                {current.role || 'No role set'} · <span className="badge">{PROVIDERS[current.connection.provider]?.label}</span>
              </p>
              <div className="toolbar">
                <button className="ghost" onClick={() => setView({ type: 'edit', lot: view.lot })}>Edit</button>
                <button className="ghost" onClick={() => updateAgent(view.lot, a => ({ ...a, history: [] }))}>Clear chat</button>
                <button className="ghost danger" onClick={() => removeAgent(view.lot)}>Demolish</button>
              </div>
              {tour === 'chat' && (
                <TourNote step="chat" title="Give it its first task" onSkip={() => setTour('done')}>
                  Type anything below, or tap a suggestion to send it.
                </TourNote>
              )}
              {tour === 'station' && (
                <TourNote step="station" title={`${current.name} is up and running`} onSkip={() => setTour('done')}
                  action={<button className="primary" onClick={openCentral}>Go to Central Station</button>}>
                  When you're away, replies wait as bubbles over the building. Next stop: Central Station.
                </TourNote>
              )}
              <Chat messages={current.history || []} busy={statuses[view.lot] === 'busy'}
                placeholder={`Message ${current.name}…`}
                suggestions={tour === 'chat' || (current.history || []).length === 0 ? STARTERS : null}
                onSend={t => sendTo(view.lot, t).catch(() => {})} />
            </>
          )}

          {view.type === 'central' && (
            <>
              <h2>Central Station</h2>
              <p className="sub">Ask every agent in {city.name} at once, or jump to one.</p>
              {tour === 'finish' && (
                <TourNote step="finish" title="That's the tour. Your city is open."
                  action={<button className="primary" onClick={() => setTour('done')}>Finish tour</button>}>
                  <ul className="nexts">
                    <li>Build more agents on any park, up to 24.</li>
                    <li>Connect a real AI from an agent's <b>Edit</b> button.</li>
                    <li>Ask every agent at once in the box below.</li>
                  </ul>
                </TourNote>
              )}
              {count > 0 ? (
                <ul className="roster">
                  {Object.entries(agents).map(([lot, a]) => (
                    <li key={lot}>
                      <button onClick={() => openAgent(lot)}>
                        <span className="sw" style={{ background: (COLORS.find(c => c.id === a.color) || COLORS[1]).base }} />
                        <span className="nm">{a.name}</span>
                        <span className="st">{statuses[lot] === 'busy' ? 'working' : statuses[lot] === 'error' ? 'error' : a.unread ? `${a.unread} new` : 'idle'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="empty">No agents yet. Close this and tap a + on any park.</p>}
              {count > 0 && (
                <Chat messages={broadcast} busy={broadcasting} placeholder="Ask every agent…" onSend={askEveryone} />
              )}
              <details className="settings">
                <summary>City settings</summary>
                <div className="row">
                  <button className="ghost" onClick={exportCity}>Export layout</button>
                  <button className="ghost" onClick={() => fileRef.current?.click()}>Import layout</button>
                  <input ref={fileRef} type="file" accept="application/json" hidden onChange={e => e.target.files[0] && importCity(e.target.files[0])} />
                </div>
                <p className="hint">Exports leave out API keys and chat history. Keys live only in this browser and pass through the relay when an agent runs; they are never stored on the server.</p>
              </details>
            </>
          )}
        </aside>
      )}

      {loaded && tour === 'welcome' && (
        <Welcome cityName={city.name}
          onName={v => setCity(c => ({ ...c, name: v }))}
          onStart={() => { if (!city.name.trim()) setCity(c => ({ ...c, name: 'My City' })); setTour(tourLot ? 'plus' : 'station'); }}
          onSkip={() => setTour('done')} />
      )}
    </div>
  );
}
