'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import CityMap, { buildingArt } from './CityMap';
import {
  ACCEPT, prepareFiles, fileMeta, fileWire, useDictation, useVoices,
  ttsSupported, speak, stopSpeaking, unlockSpeech,
} from './media';
import { STYLES, COLORS, PROVIDERS, FIELD_LABELS, GRID, W2, H2, blankCity } from '../lib/city';
import { PLANS, PAID_PLANS, planInfo } from '../lib/plans';

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

async function relay(agent, message, history, cityName, files = []) {
  const res = await fetch('/api/relay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agent: { name: agent.name, role: agent.role, instructions: agent.instructions, connection: agent.connection },
      message,
      history: history.filter(m => !m.error).map(m => ({
        role: m.role,
        content: m.content + (m.files?.length ? `\n[Attached: ${m.files.map(f => f.name).join(', ')}]` : ''),
      })),
      attachments: files.map(fileWire),
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

function VoicePicker({ value, onChange }) {
  const voices = useVoices();
  const [ok, setOk] = useState(false);
  useEffect(() => { setOk(ttsSupported()); }, []);
  if (!ok) return null;
  return (
    <fieldset>
      <legend>Voice</legend>
      <div className="row voicepick">
        <select value={value} onChange={e => onChange(e.target.value)} aria-label="Agent voice">
          <option value="">Device default</option>
          {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name}{v.lang ? ` (${v.lang})` : ''}</option>)}
        </select>
        <button type="button" className="ghost" onClick={() => { unlockSpeech(); speak('Hi, this is how I will sound when I read my replies to you.', { voiceURI: value }); }}>Preview</button>
      </div>
      <p className="hint">Used when this agent reads its replies aloud. Voices come from your device, so they can differ between phone and computer.</p>
    </fieldset>
  );
}

function AgentForm({ initial, onSave, onCancel, cityName, defaultProvider = 'anthropic' }) {
  const [a, setA] = useState(() => initial || {
    name: '', role: '', instructions: '', style: 'office', color: 'slate',
    connection: { provider: defaultProvider, ...PROVIDERS[defaultProvider].defaults },
  });
  const [test, setTest] = useState(null);
  const prov = PROVIDERS[a.connection.provider];
  const nameRef = useRef(null);
  // Only jump into the name field with a real mouse/trackpad. On phones, focusing
  // pops the keyboard over the panel before people have seen the options.
  useEffect(() => {
    try { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) nameRef.current?.focus(); } catch {}
  }, []);

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
        <input ref={nameRef} value={a.name} maxLength={40} onChange={e => set('name', e.target.value)} placeholder="e.g. Ledger, Scout, Atlas" />
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

      <VoicePicker value={a.voice || ''} onChange={v => set('voice', v)} />

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

const Icon = {
  clip: <path d="M16.5 6.5 8.4 14.6a2.2 2.2 0 0 0 3.1 3.1l8.2-8.2a4 4 0 0 0-5.7-5.7l-8.4 8.4a5.8 5.8 0 0 0 8.2 8.2L21 13.2" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  speaker: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  wave: <path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0" />,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  x: <path d="M7 7l10 10M17 7 7 17" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  check: <path d="M5 12.5 10 17l9-10" />,
  dash: <path d="M7 12h10" />,
};
const Svg = ({ name, size = 20 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{Icon[name]}</svg>
);

function FileChips({ files, onRemove }) {
  return (
    <div className="filechips">
      {files.map((f, i) => (
        <div key={f.id || i} className={`filechip ${f.kind}`} title={f.name}>
          {f.thumb ? <img src={f.thumb} alt="" /> : <span className="ficon"><Svg name="file" size={16} /></span>}
          <span className="fname">{f.name}</span>
          {onRemove && (
            <button type="button" className="fx" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.name}`}><Svg name="x" size={14} /></button>
          )}
        </div>
      ))}
    </div>
  );
}

function Chat({ messages, busy, onSend, placeholder, suggestions, voiceFor = () => undefined, canVoice = true, canFiles = true, onLocked = () => {} }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState([]);
  const [drag, setDrag] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(null); // index of message being read
  const [canSpeak, setCanSpeak] = useState(false);
  const dict = useDictation();
  const end = useRef(null);
  const fileInput = useRef(null);

  const voiceModeRef = useRef(false);
  const busyRef = useRef(busy);
  const queue = useRef([]);
  const speakingRef = useRef(false);
  const seen = useRef(messages.length);
  const msgsRef = useRef(messages);
  const voiceForRef = useRef(voiceFor);
  busyRef.current = busy;
  voiceModeRef.current = voiceMode;
  msgsRef.current = messages;
  voiceForRef.current = voiceFor;

  useEffect(() => { setCanSpeak(ttsSupported()); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, busy]);
  useEffect(() => () => { stopSpeaking(); dict.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function send(raw) {
    if (busyRef.current) return;
    const t = (raw ?? text).trim() || (files.length ? `Please take a look at the attached file${files.length > 1 ? 's' : ''}.` : '');
    if (!t) return;
    onSend(t, files);
    setText('');
    setFiles([]);
    setNotes([]);
  }

  function listen() {
    if (!dict.supported || dict.listening) return;
    dict.start(said => {
      if (said && voiceModeRef.current) send(said);
    });
  }

  // Read new replies aloud in voice mode, one after another, then listen again.
  function pump() {
    if (speakingRef.current) return;
    const next = queue.current.shift();
    if (next === undefined) {
      if (voiceModeRef.current && !busyRef.current) listen();
      return;
    }
    const m = msgsRef.current[next];
    if (!m) { pump(); return; }
    speakingRef.current = true;
    setSpeaking(next);
    speak(m.from ? `${m.from}. ${m.content}` : m.content, {
      voiceURI: voiceForRef.current(m),
      onEnd: () => { speakingRef.current = false; setSpeaking(null); pump(); },
    });
  }

  useEffect(() => {
    if (messages.length < seen.current) seen.current = messages.length;
    for (let i = seen.current; i < messages.length; i++) {
      if (messages[i].role === 'assistant' && voiceModeRef.current && canSpeak) queue.current.push(i);
    }
    seen.current = messages.length;
    pump();
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleVoiceMode() {
    if (!voiceMode && !canVoice) { onLocked('voiceMode'); return; }
    if (voiceMode) {
      setVoiceMode(false);
      queue.current = [];
      stopSpeaking();
      speakingRef.current = false;
      setSpeaking(null);
      dict.stop();
      return;
    }
    unlockSpeech();
    setVoiceMode(true);
    voiceModeRef.current = true;
    listen();
  }

  function readOne(i) {
    if (speaking === i) { stopSpeaking(); speakingRef.current = false; setSpeaking(null); return; }
    queue.current = [];
    speakingRef.current = true;
    setSpeaking(i);
    const m = msgsRef.current[i];
    speak(m.from ? `${m.from}. ${m.content}` : m.content, {
      voiceURI: voiceForRef.current(m),
      onEnd: () => { speakingRef.current = false; setSpeaking(null); },
    });
  }

  function micTap() {
    if (dict.listening) { dict.stop(); return; }
    if (voiceMode) { stopSpeaking(); listen(); return; }
    dict.start(said => { if (said) setText(t => (t ? t.replace(/\s*$/, ' ') : '') + said); });
  }

  function pickFiles() {
    if (!canFiles) { onLocked('files'); return; }
    fileInput.current?.click();
  }

  async function addFiles(list) {
    if (!list || !list.length) return;
    if (!canFiles) { onLocked('files'); return; }
    const { items, errors } = await prepareFiles(list, files);
    setFiles(f => [...f, ...items]);
    setNotes(errors);
  }

  const status = dict.listening ? 'Listening…' : speaking !== null ? 'Speaking…' : busy ? 'Thinking…' : voiceMode ? (dict.supported ? 'Tap the mic to talk' : 'Replies will be read aloud') : '';
  const shown = dict.listening && dict.interim ? (text ? text.replace(/\s*$/, ' ') : '') + dict.interim : text;

  return (
    <div className={`chat ${drag ? 'dragging' : ''}`}
      onDragOver={e => { if (canFiles && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
      {canSpeak && (
        <div className="voicebar">
          <button type="button" className={`vtoggle ${voiceMode ? 'on' : ''}`} onClick={toggleVoiceMode} aria-pressed={voiceMode}>
            <Svg name="wave" size={16} /> Voice mode {voiceMode ? 'on' : 'off'}
            {!canVoice && <span className="lockpill"><Svg name="lock" size={12} /> Town</span>}
          </button>
          {status && <span className={`vstatus ${dict.listening ? 'live' : ''}`}>{status}</span>}
        </div>
      )}
      <div className="msgs">
        {messages.length === 0 && !suggestions && <p className="empty">No messages yet. Give it a task, attach a file, or tap the mic.</p>}
        {messages.length === 0 && suggestions && (
          <div className="chips">
            {suggestions.map(t => (
              <button key={t} type="button" className="chip" disabled={busy} onClick={() => onSend(t, [])}>{t}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? 'error' : ''}`}>
            {m.from && <div className="from">{m.from}</div>}
            {m.files?.length > 0 && <FileChips files={m.files} />}
            <div className="body">{m.content}</div>
            {m.role === 'assistant' && !m.error && canSpeak && (
              <button type="button" className={`readbtn ${speaking === i ? 'on' : ''}`} onClick={() => readOne(i)}
                aria-label={speaking === i ? 'Stop reading' : 'Read aloud'}>
                <Svg name={speaking === i ? 'stop' : 'speaker'} size={15} />
                {speaking === i ? 'Stop' : 'Listen'}
              </button>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant typing"><span /><span /><span /></div>}
        <div ref={end} />
      </div>
      {drag && <div className="dropzone">Drop files to attach</div>}
      {(files.length > 0 || notes.length > 0 || dict.error) && (
        <div className="attachrow">
          {files.length > 0 && <FileChips files={files} onRemove={id => setFiles(f => f.filter(x => x.id !== id))} />}
          {notes.map((n, i) => <p key={i} className="fnote">{n}</p>)}
          {dict.error && <p className="fnote">{dict.error}</p>}
        </div>
      )}
      <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
        <button type="button" className={`iconbtn ${canFiles ? '' : 'locked'}`} onClick={pickFiles}
          aria-label={canFiles ? 'Attach files' : 'Attach files (Town and City plans)'} title={canFiles ? 'Attach files' : 'Attaching files is part of Town and City'}>
          <Svg name="clip" />
          {!canFiles && <span className="lockdot"><Svg name="lock" size={10} /></span>}
        </button>
        <textarea rows={1} value={shown} placeholder={dict.listening ? 'Listening…' : placeholder} readOnly={dict.listening}
          onChange={e => setText(e.target.value)}
          onPaste={e => { const f = e.clipboardData?.files; if (f && f.length) { e.preventDefault(); addFiles(f); } }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
        {dict.supported && (
          <button type="button" className={`iconbtn mic ${dict.listening ? 'live' : ''}`} onClick={micTap}
            aria-label={dict.listening ? 'Stop listening' : 'Speak your message'} title={dict.listening ? 'Stop' : 'Speak'}>
            <Svg name={dict.listening ? 'stop' : 'mic'} />
          </button>
        )}
        <button className="primary" disabled={busy || dict.listening || (!text.trim() && !files.length)}>Send</button>
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

/* ---------------- Plans ---------------- */

const REASON_COPY = {
  lots: plan => `You've used all ${planInfo(plan).lots} lots on the ${planInfo(plan).name} plan. Upgrade to build more agents.`,
  voiceMode: () => 'Voice mode is part of the Town and City plans.',
  files: () => 'Attaching files is part of the Town and City plans.',
};

function extractRestore(input) {
  const v = String(input || '').trim();
  const m = v.match(/[?&]restore=([^&\s]+)/);
  return m ? decodeURIComponent(m[1]) : v;
}

function PlansModal({ plan, subscribed, reason, onClose, onBilling }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [restore, setRestore] = useState('');

  async function go(path, body, key) {
    setBusy(key); setErr('');
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      if (data.url) { window.location.href = data.url; return; }
      if (data.plan) { onBilling({ plan: data.plan, subscribed: true }); onClose(); }
    } catch (e) {
      setErr(e.message);
      setBusy('');
    }
  }

  const rows = [
    ['Agents', p => p.lots === 24 ? 'All 24 agents' : `Up to ${p.lots} agents`],
    ['Chat, mic dictation, read aloud', () => true],
    ['Voice mode (hands-free)', p => p.features.voiceMode],
    ['File attachments', p => p.features.files],
  ];

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="plans-title" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal plans">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <h2 id="plans-title">Grow your city</h2>
        <p className="lede">{reason ? REASON_COPY[reason](plan) : 'Pick the plan that fits how many agents you run.'}</p>
        <div className="plancards">
          {['free', ...PAID_PLANS].map(id => {
            const p = PLANS[id];
            const isCurrent = id === plan;
            let action;
            if (isCurrent) action = <button className="ghost" disabled>Current plan</button>;
            else if (id === 'free') action = subscribed
              ? <button className="ghost" disabled={!!busy} onClick={() => go('/api/billing/portal', null, id)}>{busy === id ? 'Opening…' : 'Downgrade'}</button>
              : <button className="ghost" disabled>Free forever</button>;
            else action = (
              <button className="primary" disabled={!!busy} onClick={() => go('/api/billing/checkout', { plan: id }, id)}>
                {busy === id ? 'Opening…' : subscribed ? `Switch to ${p.name}` : `Choose ${p.name}`}
              </button>
            );
            return (
              <div key={id} className={`plancard ${isCurrent ? 'current' : ''} ${id === 'city' ? 'best' : ''}`}>
                {id === 'city' && <span className="ribbon">Most room</span>}
                <div className="pname">{p.name}</div>
                <div className="pprice">{p.price ? <>${p.price.toFixed(2)}<small>/month</small></> : 'Free'}</div>
                <div className="pblurb">{p.blurb}</div>
                <ul className="pfeat">
                  {rows.map(([label, fn]) => {
                    const v = fn(p);
                    return (
                      <li key={label} className={v ? '' : 'off'}>
                        <Svg name={v ? 'check' : 'dash'} size={15} />
                        <span>{typeof v === 'string' ? v : label}</span>
                      </li>
                    );
                  })}
                </ul>
                {action}
              </div>
            );
          })}
        </div>
        {err && <p className="fnote">{err}</p>}
        <div className="planfoot">
          {subscribed ? (
            <button className="linkbtn" disabled={!!busy} onClick={() => go('/api/billing/portal', null, 'portal')}>
              {busy === 'portal' ? 'Opening…' : 'Manage billing, invoices, or cancel'}
            </button>
          ) : (
            <form className="restore" onSubmit={e => { e.preventDefault(); if (restore.trim()) go('/api/billing/restore', { token: extractRestore(restore) }, 'restore'); }}>
              <label htmlFor="restore-in">Already subscribed on another device?</label>
              <div className="row">
                <input id="restore-in" value={restore} onChange={e => setRestore(e.target.value)} placeholder="Paste your restore link" autoComplete="off" />
                <button className="ghost" disabled={!restore.trim() || !!busy}>{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
              </div>
            </form>
          )}
          <p className="hint">Secure checkout by Stripe. Cancel anytime from Manage billing. Your API keys and chats never leave your browser.</p>
        </div>
      </div>
    </div>
  );
}

function WelcomePlan({ info, onClose }) {
  const p = planInfo(info.plan);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/?restore=${encodeURIComponent(info.restore)}` : '';
  const [copied, setCopied] = useState(false);
  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="wp-title">
      <div className="modal">
        <h2 id="wp-title">Welcome to {p.name}</h2>
        <p className="lede">Your city now has room for {p.lots === 24 ? 'all 24' : `up to ${p.lots}`} agents, plus voice mode and file attachments.</p>
        <div className="restorebox">
          <strong>Use your plan on your other devices</strong>
          <p>Open this link on your phone or another computer. Keep it private: anyone with it can use your plan.</p>
          <div className="row">
            <input readOnly value={link} onFocus={e => e.target.select()} aria-label="Restore link" />
            <button className="ghost" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch {} }}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          {info.email && <p className="hint">Your receipt went to {info.email}.</p>}
        </div>
        <div className="actions"><button className="primary" onClick={onClose}>Start building</button></div>
      </div>
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
  const [billing, setBilling] = useState({ plan: 'free', billing: false, subscribed: false });
  const [upsell, setUpsell] = useState(null);     // { reason } while the plans screen is open
  const [purchase, setPurchase] = useState(null); // { plan, restore, email } right after checkout
  const [notice, setNotice] = useState('');
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

  // Billing: read plan, and finish any checkout / restore / portal round-trip in the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams;
    const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.json().then(d => (r.ok ? d : Promise.reject(new Error(d.error || 'Something went wrong')))));
    const clean = () => { ['checkout', 'session_id', 'restore', 'billing'].forEach(k => q.delete(k)); window.history.replaceState(null, '', url.pathname + (q.toString() ? `?${q}` : '')); };

    (async () => {
      try {
        if (q.get('checkout') === 'success' && q.get('session_id')) {
          const d = await post('/api/billing/confirm', { session_id: q.get('session_id') });
          setBilling({ plan: d.plan, billing: true, subscribed: true });
          setPurchase(d);
          clean();
          return;
        }
        if (q.get('restore')) {
          const d = await post('/api/billing/restore', { token: q.get('restore') });
          setBilling({ plan: d.plan, billing: true, subscribed: true });
          setNotice(`${planInfo(d.plan).name} plan restored on this device.`);
          clean();
          return;
        }
        if (q.get('checkout') === 'cancel') clean();
        const refresh = q.get('billing') === 'updated';
        if (refresh) clean();
        const r = await fetch(`/api/billing/status${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
        if (r.ok) setBilling(await r.json());
      } catch (e) {
        setNotice(e.message);
        clean();
      }
    })();
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
  // When Stripe isn't configured (self-hosted or pre-launch), everything is unlocked.
  const limits = billing.billing ? planInfo(billing.plan) : { name: '', lots: lotsTotal, features: { voiceMode: true, files: true } };
  const lockedFeature = reason => setUpsell({ reason });
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);

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
    if (count >= limits.lots) { setUpsell({ reason: 'lots' }); return; }
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

  async function sendTo(lot, text, files = []) {
    const agent = city.agents[lot];
    if (!agent) return;
    const prior = agent.history || [];
    const userMsg = { role: 'user', content: text, ts: Date.now(), ...(files.length ? { files: files.map(fileMeta) } : {}) };
    updateAgent(lot, a => ({ ...a, history: [...(a.history || []), userMsg] }));
    setStatuses(s => ({ ...s, [lot]: 'busy' }));
    try {
      const reply = await relay(agent, text, prior, city.name, files);
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

  async function askEveryone(text, files = []) {
    const lots = Object.keys(city.agents);
    if (!lots.length) return;
    setBroadcasting(true);
    setBroadcast(b => [...b, { role: 'user', content: text, ...(files.length ? { files: files.map(fileMeta) } : {}) }]);
    await Promise.all(lots.map(async lot => {
      const name = city.agents[lot].name;
      try {
        const reply = await sendTo(lot, text, files);
        setBroadcast(b => [...b, { role: 'assistant', from: name, lot, content: reply }]);
      } catch (e) {
        setBroadcast(b => [...b, { role: 'assistant', from: name, lot, content: e.message, error: true }]);
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
        <div className="meta">{count}/{limits.lots} lots built</div>
        {billing.billing && (
          <button className={`planpill ${billing.plan}`} onClick={() => setUpsell({ reason: null })}>
            {planInfo(billing.plan).name}{billing.plan === 'free' ? ' · Upgrade' : ''}
          </button>
        )}
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
              <Chat key={view.lot} canVoice={limits.features.voiceMode} canFiles={limits.features.files} onLocked={lockedFeature}
                messages={current.history || []} busy={statuses[view.lot] === 'busy'}
                placeholder={`Message ${current.name}…`}
                suggestions={tour === 'chat' || (current.history || []).length === 0 ? STARTERS : null}
                voiceFor={() => current.voice}
                onSend={(t, f) => sendTo(view.lot, t, f).catch(() => {})} />
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
                <Chat messages={broadcast} busy={broadcasting} placeholder="Ask every agent…" onSend={askEveryone}
                  canVoice={limits.features.voiceMode} canFiles={limits.features.files} onLocked={lockedFeature}
                  voiceFor={m => agents[m.lot]?.voice} />
              )}
              <details className="settings">
                <summary>City settings</summary>
                <div className="row">
                  {billing.billing && <button className="ghost" onClick={() => setUpsell({ reason: null })}>Plan &amp; billing</button>}
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

      {upsell && (
        <PlansModal plan={billing.plan} subscribed={billing.subscribed} reason={upsell.reason}
          onClose={() => setUpsell(null)} onBilling={b => setBilling(x => ({ ...x, ...b, billing: true }))} />
      )}
      {purchase && <WelcomePlan info={purchase} onClose={() => setPurchase(null)} />}
      {notice && (
        <div className="toast" role="status" onClick={() => setNotice('')}>{notice}</div>
      )}

      {loaded && tour === 'welcome' && !purchase && (
        <Welcome cityName={city.name}
          onName={v => setCity(c => ({ ...c, name: v }))}
          onStart={() => { if (!city.name.trim()) setCity(c => ({ ...c, name: 'My City' })); setTour(tourLot ? 'plus' : 'station'); }}
          onSkip={() => setTour('done')} />
      )}
    </div>
  );
}
