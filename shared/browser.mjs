// Headless Chrome/Edge driven over the DevTools protocol, with no npm
// dependencies. Needs Node >= 22 (global WebSocket) and a locally installed
// Chromium-family browser; set CHROME_PATH to pick one explicitly.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { diag, warn } from './diagnostics.mjs';

const WINDOWS_APPS = ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe', 'Chromium/Application/chrome.exe'];
const MAC_APPS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];
const LINUX_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'];

export function findChrome(env = process.env) {
  if (env.CHROME_PATH) return fs.existsSync(env.CHROME_PATH) ? env.CHROME_PATH : null;
  let candidates = [];
  if (process.platform === 'win32') {
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
    candidates = roots.flatMap(root => WINDOWS_APPS.map(app => path.join(root, app)));
  } else if (process.platform === 'darwin') {
    candidates = MAC_APPS;
  } else {
    const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
    candidates = LINUX_NAMES.flatMap(name => dirs.map(dir => path.join(dir, name)));
  }
  return candidates.find(file => fs.existsSync(file)) || null;
}

// Why the browser gate cannot run here, or null when it can.
export function browserUnavailable(env = process.env) {
  if (typeof globalThis.WebSocket !== 'function') {
    return warn('browser/unavailable', `Node ${process.versions.node} has no global WebSocket; the browser gate needs Node >= 22`, {
      fix: 'Run with Node 22+, or open the output in a browser yourself and state that it was not checked automatically.',
    });
  }
  if (!findChrome(env)) {
    return warn('browser/unavailable', 'no Chrome, Chromium or Edge installation found', {
      fix: 'Install one or set CHROME_PATH, or open the output in a browser yourself and state that it was not checked automatically.',
    });
  }
  return null;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const listeners = new Set();
    let nextId = 0;
    ws.onopen = () => resolve({
      send(method, params = {}, sessionId) {
        const id = ++nextId;
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        return new Promise((res, rej) => pending.set(id, { res, rej, method }));
      },
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      close() { ws.close(); },
    });
    ws.onerror = () => reject(new Error('DevTools WebSocket failed'));
    ws.onclose = () => { for (const p of pending.values()) p.rej(new Error(`${p.method}: DevTools connection closed`)); pending.clear(); };
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      const waiting = msg.id && pending.get(msg.id);
      if (waiting) {
        pending.delete(msg.id);
        if (msg.error) waiting.rej(new Error(`${waiting.method}: ${msg.error.message}`));
        else waiting.res(msg.result);
      } else listeners.forEach(fn => fn(msg));
    };
  });
}

export async function launchBrowser({ chromePath = findChrome(), timeoutMs = 20000 } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-chrome-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
  ];
  // GitHub's Ubuntu runners block the Chrome sandbox (AppArmor user namespaces).
  if (process.env.CI && process.platform === 'linux') args.push('--no-sandbox');
  const child = spawn(chromePath, [...args, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise(resolve => child.once('exit', resolve));
  // Chrome helpers can keep writing the profile briefly after the main process
  // exits; a leftover temp directory must never fail a check.
  const cleanup = () => {
    try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* best effort */ }
  };
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new Error(`browser did not expose DevTools within ${timeoutMs} ms`)), timeoutMs);
      child.stderr.on('data', chunk => {
        buffer += chunk;
        const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`browser exited with code ${code} before DevTools was ready`)); });
    });
    const cdp = await connect(wsUrl);
    return {
      cdp,
      async close() {
        try { await Promise.race([cdp.send('Browser.close'), new Promise(r => setTimeout(r, 2000))]); } catch { /* already gone */ }
        cdp.close();
        await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]);
        if (child.exitCode === null) { child.kill(); await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]); }
        cleanup();
      },
    };
  } catch (error) {
    if (child.exitCode === null) child.kill();
    cleanup();
    throw error;
  }
}

function exceptionText(details) {
  return details?.exception?.description?.split('\n')[0] || details?.text || 'uncaught exception';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function openPage(browser, file) {
  const { cdp } = browser;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  const errors = [];
  const off = cdp.on(msg => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(exceptionText(msg.params.exceptionDetails));
    else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`console.error: ${msg.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && msg.params.entry.source !== 'network') {
      errors.push(msg.params.entry.text);
    }
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  // Entrance animations would otherwise be measured or captured mid-flight.
  const REDUCED_MOTION = [{ name: 'prefers-reduced-motion', value: 'reduce' }];
  await send('Emulation.setEmulatedMedia', { features: REDUCED_MOTION });

  const url = pathToFileURL(path.resolve(file)).href;
  const page = {
    url,
    errors,
    notes: [],
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(exceptionText(result.exceptionDetails));
      return result.result.value;
    },
    // Waits for `complete`; on a slow network (fonts) settles for an executed
    // DOM after 10 s and notes it, since layout checks still mean something.
    async settle(marker) {
      const probe = `(() => ({ ready: document.readyState, marked: window.__skillCheckMarker === ${JSON.stringify(marker)} }))()`;
      const deadline = Date.now() + 10000;
      let state;
      while (Date.now() < deadline) {
        try { state = await page.evaluate(probe); } catch { state = null; }
        if (state && !state.marked && state.ready === 'complete') break;
        await sleep(100);
      }
      if (!state || state.marked || state.ready === 'loading') throw new Error(`${file} did not load`);
      if (state.ready !== 'complete') page.notes.push(warn('browser/load-slow', 'page never reached readyState complete (remote fonts?); checked the executed DOM instead', { path: file }));
      await page.evaluate('Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]).then(() => new Promise(r => requestAnimationFrame(() => r(true))))');
    },
    async goto() {
      await send('Page.navigate', { url });
      await page.settle(null);
    },
    async reload() {
      await page.evaluate('window.__skillCheckMarker = "reload"');
      await send('Page.reload', {});
      await page.settle('reload');
    },
    async viewport(width, height = 900) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    },
    async media(type) {
      await send('Emulation.setEmulatedMedia', { media: type, features: REDUCED_MOTION });
      await page.evaluate('new Promise(r => requestAnimationFrame(() => r(true)))');
    },
    // Full-page PNG at the given CSS width, for optional visual review.
    async screenshot(out, width = 1280) {
      await page.viewport(width);
      const height = await page.evaluate('Math.ceil(document.documentElement.scrollHeight)');
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
      fs.writeFileSync(out, Buffer.from(data, 'base64'));
      await page.viewport(1280);
      return out;
    },
    async close() {
      off();
      await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    },
  };
  await page.goto();
  return page;
}

// Elements that push the page wider than the viewport, ignoring content that
// lives inside its own horizontal scroll or clip container.
const OVERFLOW_PROBE = `(() => {
  const width = document.documentElement.clientWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth <= width + 1) return null;
  const clipped = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return true; } return false; };
  const describe = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].join('.') : '');
  const offenders = [...document.body.querySelectorAll('*')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > width + 1 && !clipped(el); });
  const leaves = offenders.filter(el => !offenders.some(other => other !== el && el.contains(other)));
  return { width, scrollWidth, offenders: leaves.slice(0, 5).map(el => describe(el) + ' (right edge ' + Math.round(el.getBoundingClientRect().right) + 'px)') };
})()`;

export async function checkLayout(page, file, widths = [1280, 390]) {
  const out = [];
  for (const width of widths) {
    await page.viewport(width);
    const overflow = await page.evaluate(OVERFLOW_PROBE);
    if (overflow) {
      out.push(diag('browser/overflow', `page scrolls horizontally at ${width}px (content ${overflow.scrollWidth}px wide): ${overflow.offenders.join(', ') || 'unknown element'}`, {
        path: file, fix: 'Shorten or wrap the long unbroken text (paths, code, URLs) in the named element.',
      }));
    }
  }
  await page.viewport(1280);
  return out;
}

export function pageErrors(page, file) {
  return [
    ...page.errors.map(text => diag('browser/script-error', text, { path: file, fix: 'A renderer or template bug; inspect the generated page script.' })),
    ...page.notes,
  ];
}

// Opens a browser once, runs `fn(open)` where `open(file)` returns a page, and
// always cleans up. Returns { status: 'skipped' } when no browser can run.
export async function withBrowser(fn) {
  const unavailable = browserUnavailable();
  if (unavailable) return { status: 'skipped', diagnostics: [unavailable] };
  const browser = await launchBrowser();
  const pages = [];
  try {
    const diagnostics = await fn(async file => { const page = await openPage(browser, file); pages.push(page); return page; });
    return { diagnostics };
  } finally {
    for (const page of pages) await page.close();
    await browser.close();
  }
}
