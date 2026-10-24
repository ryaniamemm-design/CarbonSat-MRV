                   
                                
  
                                               
                                     
  
                                              
                                  
  
                               
  
                                                        
   
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.dirname(ROOT);
const WebSocket = require(path.join(WORKSPACE, '.tmp_browser/node_modules/ws'));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const AUDIT = path.join(ROOT, 'audit/workbench_visual_2026-10-19');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = (url, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request(url, { method }, res => { let s = ''; res.on('data', b => s += b); res.on('end', () => resolve(s)); });
  req.setTimeout(5000, () => req.destroy(new Error('HTTP timeout'))); req.on('error', reject); req.end();
});

const LABEL = (() => {
  const i = process.argv.indexOf('--out');
  const v = i > 0 ? process.argv[i + 1] : 'after';
  if (!/^(before|after)$/.test(v)) throw new Error('--out must be before|after');
  return v;
})();
const OUT = path.join(AUDIT, LABEL);
const SHOTS = path.join(OUT, 'shots');
                                              
                                            
const PROFILE = path.join(os.tmpdir(), 'workbench-shots-' + LABEL + '-' + Date.now());

                      
const STEPS = [
  { name: '01_A_1440x900_cell0020_2024', w: 1440, h: 900, caseKey: 'A', object: 'cell_0020', year: 2024 },
  { name: '02_A_1440x900_cell0020_2001_source', w: 1440, h: 900, caseKey: 'A', object: 'cell_0020', year: 2001, sourceOpen: true },
  { name: '03_A_1366x768_cell0074_2012', w: 1366, h: 768, caseKey: 'A', object: 'cell_0074', year: 2012 },
  { name: '04_B_1440x900_2001', w: 1440, h: 900, caseKey: 'B', object: null, year: 2001 },
  { name: '05_B_1366x768_2024', w: 1366, h: 768, caseKey: 'B', object: null, year: 2024 },
  { name: '06_ledger_locate_1440x900', w: 1440, h: 900, page: 'web/changes.html?cell=cell_0020&era=2&year=2024' },
  { name: '07_reject_1440x900', w: 1440, h: 900, caseKey: 'A', object: 'cell_0020', year: 2024, reject: true },
];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  const out = { label: LABEL, startedAtUTC: new Date().toISOString(), steps: [], overflow: [] };
  let server, browser, ws, send, serial = 0;
  const pending = new Map();
  try {
    server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const f = path.resolve(ROOT, '.' + decodeURIComponent(u.pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    browser = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
      `--user-data-dir=${PROFILE}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore', windowsHide: true });
    let dp;
    for (let i = 0; i < 100; i++) {
      try { dp = Number(fs.readFileSync(path.join(PROFILE, 'DevToolsActivePort'), 'utf8').split('\n')[0]); if (dp) break; } catch (e) { }
      await sleep(150);
    }
    const target = JSON.parse(await get(`http://127.0.0.1:${dp}/json/new?about:blank`, 'PUT'));
    ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
    await new Promise(r => ws.once('open', r));
    ws.on('message', d => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
    send = (method, params = {}) => new Promise(r => { const id = ++serial; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    const evaluate = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    };
    const shot = async (name) => {
      await sleep(320);
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = path.join(SHOTS, name + '.png');
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      out.steps.push({ name, file: path.relative(ROOT, file).replace(/\\/g, '/') });
      console.log('shot', name);
    };
    const metrics = () => evaluate(`(() => {
      const pick = (sel) => { const e = document.querySelector(sel); if (!e) return null;
        const r = e.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left),
                 scrollW: e.scrollWidth, clientW: e.clientWidth, fs: getComputedStyle(e).fontSize }; };
      const sels = { shell: '.shell', header: 'header', mapWrap: '#mapWrap', objList: '#objList', right: '.col-right',
                     series: '#series', legend: '.legend', tabs: '.tabsPanel', main: 'main' };
      const o = {}; Object.keys(sels).forEach(k => { o[k] = pick(sels[k]); });
      o.vw = innerWidth; o.vh = innerHeight; o.docH = document.documentElement.scrollHeight;
      /* 文本截断探针：横向不可滚且 scrollW 明显大于 clientW 的元素 */
      o.clipped = Array.from(document.querySelectorAll('h1,h2,.objItem .nm,.val,.bigValue,.badge,.k,.v,button,select'))
        .filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible')
        .slice(0, 12).map(e => (e.className || e.tagName) + ':' + e.textContent.trim().slice(0, 24));
      return o;
    })()`);

    const nav = async (rel) => { await send('Page.navigate', { url: `http://127.0.0.1:${port}/${rel}` }); await sleep(900); };

    for (const s of STEPS) {
      await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: false });
      if (s.page) {
        await nav(s.page);
      } else {
        await nav('web/workbench.html?case=' + s.caseKey + (s.object ? '&object=' + s.object : '') + '&year=' + s.year);
        await evaluate(`new Promise(r => { const t = setInterval(() => { const st = window.__workbench && window.__workbench.getState();
          if (st && (st.status === 'ready' || st.status === 'error')) { clearInterval(t); r(st); } }, 60); setTimeout(() => { clearInterval(t); r(null); }, 9000); })`);
        if (s.object) await evaluate(`window.__workbench.selectObject(${JSON.stringify(s.object)})`);
        if (s.year) await evaluate(`window.__workbench.selectYear(${s.year})`);
        if (s.sourceOpen) {
          const has = await evaluate(`!!document.getElementById('btnSourceFold')`);
          if (has) await evaluate(`document.getElementById('btnSourceFold').click()`);
        }
        if (s.reject) {
          await evaluate(`(async () => {
            const b = await (await fetch('npp_estimate_bundle.json', { cache: 'no-store' })).json();
            b.cellYears['cell_0020|2024'].prod_tC_yr = 1;
            return window.__workbench.importCase('A', JSON.stringify(b), null);
          })()`);
        }
      }
      const m = await metrics();
      out.steps.push({ name: s.name + ' [metrics]', metrics: m });
      if (m.clipped && m.clipped.length) out.overflow.push({ step: s.name, clipped: m.clipped });
      await shot(s.name);
    }
    fs.writeFileSync(path.join(OUT, 'shots_metrics.json'), JSON.stringify(out, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, label: LABEL, steps: STEPS.length, overflow: out.overflow }, null, 2));
  } catch (e) {
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    try { if (ws) ws.close(); } catch (e) { }
    try { if (browser) browser.kill(); } catch (e) { }
    try { if (server) server.close(); } catch (e) { }
  }
})();
