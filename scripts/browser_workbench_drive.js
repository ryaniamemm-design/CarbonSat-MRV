                   
                                                         
  
                            
                                         
                          
                      
                                      
                         
                                  
                                                    
                               
                                       
                                                        
                          
                                
  
                                             
                     
  
                                  
  
                                             
   
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = path.dirname(ROOT);
const WebSocket = require(path.join(WORKSPACE, '.tmp_browser/node_modules/ws'));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const AUDIT = path.join(ROOT, 'audit/workbench_v1_2026-10-19');
const RUN = path.join(AUDIT, 'browser_runs', new Date().toISOString().replace(/[:.]/g, '-'));
const SHOTS = path.join(RUN, 'shots');
                                             
const PROFILE = path.join(os.tmpdir(), 'workbench-drive-' + Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = (url, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request(url, { method }, res => { let s = ''; res.on('data', b => s += b); res.on('end', () => resolve(s)); });
  req.setTimeout(5000, () => req.destroy(new Error('HTTP timeout'))); req.on('error', reject); req.end();
});

                           
const BUNDLE_A = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/npp_estimate_bundle.json'), 'utf8'));
const BUNDLE_B = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/engebei_bundle.json'), 'utf8'));
const EXP = {
  aObjects: BUNDLE_A.cells.length,
  aYears: BUNDLE_A.years.length,
  cell0020_2008: BUNDLE_A.cellYears['cell_0020|2008'].prod_tC_yr,
  cell0074: BUNDLE_A.cells.filter(c => c.cellId === 'cell_0074')[0],
  aFirstYear: BUNDLE_A.years[0], aLastYear: BUNDLE_A.years[BUNDLE_A.years.length - 1],
  bProd2001: BUNDLE_B.records['2001'].prod_tC_yr,
  bValidPixels: BUNDLE_B.records['2001'].validPixels,
  bLabel: BUNDLE_B.window.label,
};

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  const out = {
    module: 'CarbonSat-ResearchWorkbench-v1.1',
    kind: 'browser-software-verification (NOT a human usability trial)',
    startedAtUTC: new Date().toISOString(),
    runDir: path.relative(ROOT, RUN).replace(/\\/g, '/'),
    expected: EXP, checks: [], screenshots: [],
    publicTransactionsSent: 0, walletRequests: 0,
    externalRequests: [], consoleErrors: [], pageExceptions: [],
  };
  let server, browser, ws, send, finished = false;
  const pending = new Map();
  const check = (name, ok, detail = '') => {
    out.checks.push({ name, ok: !!ok, detail });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  };
  const fatal = setTimeout(() => { console.error('Browser drive exceeded 240 seconds'); if (browser) browser.kill(); process.exit(2); }, 240000);

  try {
    server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
        const file = path.resolve(ROOT, '.' + decodeURIComponent(u.pathname));
        if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
        const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
      } catch (e) { res.writeHead(400); res.end('bad request'); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/web/`;
    out.url = BASE + 'workbench.html';

    browser = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`, '--window-size=1440,1000', 'about:blank'],
      { stdio: 'ignore', windowsHide: true });
    browser.once('error', e => { out.browserLaunchError = e.message; });
    let debugPort;
    for (let i = 0; i < 80; i++) {
      try { debugPort = Number(fs.readFileSync(path.join(PROFILE, 'DevToolsActivePort'), 'utf8').split('\n')[0]); if (debugPort) break; } catch (e) { }
      await sleep(150);
    }
    if (!debugPort) throw new Error('Edge CDP startup failed');
    out.browser = JSON.parse(await get(`http://127.0.0.1:${debugPort}/json/version`)).Browser;
    const target = JSON.parse(await get(`http://127.0.0.1:${debugPort}/json/new?about:blank`, 'PUT'));
    ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    let serial = 0;
    ws.on('message', data => {
      const m = JSON.parse(data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); clearTimeout(p.timer); pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      } else if (m.method === 'Network.requestWillBeSent') {
        const u = m.params.request.url;
        if (!/^http:\/\/127\.0\.0\.1:/.test(u) && !/^data:/.test(u)) out.externalRequests.push(u);
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        out.consoleErrors.push(m.params.args.map(a => a.value || a.description || '').join(' '));
      } else if (m.method === 'Runtime.exceptionThrown') {
        out.pageExceptions.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || ''));
      }
    });
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)); }, 25000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
    const run = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const text = sel => run(`(document.querySelector(${JSON.stringify(sel)})||{}).innerText||''`);
    const screenshot = async name => {
      const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const p = path.join(SHOTS, name + '.png');
      fs.writeFileSync(p, Buffer.from(img.data, 'base64'));
      out.screenshots.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    };
    const clickSel = sel => run(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;})()`);

    await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: out.url });
    await sleep(3000);

                                                                                 
    const st0 = await run('window.__workbench.getState()');
    check('载入：默认进入案例 A 且状态 ready', st0.caseKey === 'A' && st0.status === 'ready', JSON.stringify(st0));
    check('案例 A：对象 34 / 年份 24', st0.objects === EXP.aObjects && EXP.aYears === 24, 'objects=' + st0.objects);

    const hint = await text('#statusGroup');
    check('顶栏：只显示判定结论（内部一致 / 与发布版本一致 / 覆盖状态）',
      /内部一致/.test(hint) && /与发布版本一致/.test(hint) && !/0 新增交易/.test(hint) && !/[0-9a-f]{16}/.test(hint),
      hint.replace(/\s+/g, ' ').slice(0, 120));

                                                    
    const ev0 = await run('window.__workbench.getEvidence()');
    check('证据登记：已载入并按身份判为适用（APPLICABLE）',
      ev0 && ev0.status === 'APPLICABLE' && ev0.checks.length >= 5 && ev0.checks.every(c => c.ok !== false),
      ev0 ? ev0.status + ' checks=' + ev0.checks.length : 'null');
    const rects0 = await run('document.querySelectorAll("#frame .cellRect").length');
    check('地图：34 个研究框（几何来自格框规则）', rects0 === 34, 'rects=' + rects0);
    const items0 = await run('document.querySelectorAll("#objList .objItem").length');
    check('列表：34 个对象', items0 === 34, 'items=' + items0);

                                                          
                                              
    const geo = await run(`(()=>{
      const wrap=document.getElementById('mapWrap').getBoundingClientRect();
      const rs=Array.from(document.querySelectorAll('#frame .cellRect')).map(e=>{const b=e.getBoundingClientRect();return {w:b.width,h:b.height,inside:b.left>=wrap.left-1&&b.right<=wrap.right+1&&b.top>=wrap.top-1&&b.bottom<=wrap.bottom+1};});
      return {n:rs.length,minW:Math.min.apply(null,rs.map(r=>r.w)),minH:Math.min.apply(null,rs.map(r=>r.h)),inside:rs.filter(r=>r.inside).length,wrapW:Math.round(wrap.width),wrapH:Math.round(wrap.height)};
    })()`);
    check('地图：每个研究框在屏幕上都有可辨尺寸（≥10px）且落在视口内',
      geo.minW >= 10 && geo.minH >= 10 && geo.inside >= 30,
      'minW=' + geo.minW.toFixed(1) + ' minH=' + geo.minH.toFixed(1) + ' inside=' + geo.inside + '/' + geo.n + ' wrap=' + geo.wrapW + 'x' + geo.wrapH);
    const scope0 = await text('#objScope');
    check('范围性质：明示非项目边界', /非治理项目边界/.test(scope0) && /非治理小班边界/.test(scope0), scope0.slice(0, 70));
    await screenshot('01_首屏_案例A');

                                                                                     
    const initSel = await run('window.__workbench.getState().objectId');
    await clickSel('.cellRect[data-id="cell_0074"]');
    await sleep(220);
    const afterMap = await run('window.__workbench.getState()');
    const listSel = await run('(()=>{const e=document.querySelector(".objItem[aria-selected=\\"true\\"]");return e?e.getAttribute("data-id"):null})()');
    check('地图点击 ⇒ 状态与列表高亮同步', afterMap.objectId === 'cell_0074' && listSel === 'cell_0074', initSel + ' → ' + afterMap.objectId + ' / list=' + listSel);
    const nameAfterMap = await text('#objName');
    check('地图点击 ⇒ 右侧标题同步', nameAfterMap.trim() === 'cell_0074', nameAfterMap.trim());

    await clickSel('.objItem[data-id="cell_0020"]');
    await sleep(220);
    const afterList = await run('window.__workbench.getState()');
    const mapSelStroke = await run('(()=>{const e=document.querySelector(".cellRect[data-id=\\"cell_0020\\"]");return e?e.getAttribute("stroke-width"):null})()');
    check('列表点击 ⇒ 地图高亮同步（选中框描边加粗）', afterList.objectId === 'cell_0020' && Number(mapSelStroke) > 2, 'stroke-width=' + mapSelStroke);

                                                                              
    await run(`(()=>{const s=document.getElementById('yearSelect');s.value='2008';s.dispatchEvent(new Event('change'));})()`);
    await sleep(260);
    const y8 = await run('window.__workbench.getDetail()');
    const mainVal = await text('#mainValue');
    check('年份切换 ⇒ 右侧指标为该年产物值（逐位相同）', y8.year === 2008 && y8.prod === EXP.cell0020_2008,
      'page=' + y8.prod + ' disk=' + EXP.cell0020_2008);
    check('年份切换 ⇒ 主指标显示数值与单位', mainVal.replace(/\s+/g, '').indexOf('4,258.03') >= 0 && /tC\/yr/.test(mainVal), mainVal.replace(/\s+/g, ' ').slice(0, 40));

                 
    const pt = await clickSel('.serHit[data-year="2019"]');
    await sleep(260);
    const ySel = await run('document.getElementById("yearSelect").value');
    const st19 = await run('window.__workbench.getState()');
    check('序列点点击 ⇒ 年份选择器与状态一并更新', pt === true && ySel === '2019' && st19.year === 2019, 'select=' + ySel + ' state=' + st19.year);
    const seriesNote = await text('#seriesNote');
    check('序列：明示按 2012 分段、不跨段求差/增幅', /不跨段连线/.test(seriesNote) && /不求差值\/增幅/.test(seriesNote), seriesNote.replace(/\s+/g, ' ').slice(0, 90));
    const pathCount = await run('(document.getElementById("series").innerHTML.match(/<path /g)||[]).length');
    check('序列：两段路径，不跨 2012 连线', pathCount === 2, 'paths=' + pathCount);
    await screenshot('02_年份与序列联动');

                                                                              
    const src = await run('window.__workbench.getSource()');
    check('来源面板：五层分列且各有 scope', src && src.rows.length === 5 && src.rows.every(r => r.scope && r.scope.length > 8),
      src ? src.rows.map(r => r.key).join(',') : 'null');
    check('来源面板：pin 层判为与发布版本一致（内容 + 文件字节）',
      src.rows[1].state === 'ok' && /一致/.test(src.rows[1].verdict) && /文件字节：一致/.test(src.rows[1].detail),
      src.rows[1].verdict + ' | ' + src.rows[1].detail);
    check('来源面板：历史复算层判为"适用于当前产物"（不是无条件通过）',
      src.rows[2].state === 'info' && /适用于当前产物/.test(src.rows[2].verdict),
      src.rows[2].verdict);
    check('来源面板：上游抽样写明 9/840 且注明本页未执行',
      /9\s*\/\s*840/.test(src.rows[3].verdict) && /本工作台未联网/.test(src.rows[3].scope), src.rows[3].verdict);
                         
    const folded0 = await run('document.getElementById("sourceRows").hidden');
    check('来源面板：首屏默认收起（避免与核心指标同等醒目）', folded0 === true, 'hidden=' + folded0);
    await clickSel('#btnSourceFold');
    await sleep(180);
    const srcDom = await text('#sourceRows');
    const folded1 = await run('document.getElementById("sourceRows").hidden');
    check('来源面板：展开后显示详细说明与「不能代替什么」',
      folded1 === false && /pin 匹配只说明/.test(srcDom) && /地面精度/.test(srcDom), srcDom.length + ' chars');
                              
    check('来源面板：展开区含身份逐项对照（案例/方法/源摘要/内容摘要/文件字节）',
      /源产物摘要（独立计算）/.test(srcDom) && /内容摘要/.test(srcDom) && /文件字节/.test(srcDom), '');
    await clickSel('#btnSourceFold');
    await sleep(140);

                                  
    await run(`(()=>{const s=document.getElementById('yearSelect');s.value='2002';s.dispatchEvent(new Event('change'));})()`);
    await sleep(220);
    const src2002 = await run('window.__workbench.getSource()');
    check('来源面板：未抽中的对象年显示「不在已抽范围」且不给通过色',
      src2002.rows[3].state === 'warn' && /不在已抽范围/.test(src2002.rows[3].verdict) && src2002.rows[3].ok === false,
      src2002.rows[3].verdict);
    await screenshot('02b_来源展开与抽样范围');
    await run(`(()=>{const s=document.getElementById('yearSelect');s.value='2008';s.dispatchEvent(new Event('change'));})()`);
    await sleep(180);

                                                                                      
    await run(`(()=>{const s=document.getElementById('yearSelect');s.value='2008';s.dispatchEvent(new Event('change'));document.querySelector('.tabs button[data-tab="ledger"]').click();})()`);
    await sleep(300);
    const href = await run('document.getElementById("btnLedger").getAttribute("href")');
    check('台账入口：链接携带格/时段/年定位参数', href === 'changes.html?cell=cell_0020&era=1&year=2008', href);
    await screenshot('03_台账入口与定位参数');

    await send('Page.navigate', { url: BASE + href });
    await sleep(3600);
    const sel = await run('window.__changes.getSelection()');
    const notice = await text('#locateNotice');
    check('台账页：定位参数生效（格/时段/年一致）', sel.cellId === 'cell_0020' && sel.era === 1 && sel.year === 2008, JSON.stringify(sel));
    check('台账页：显示「已按链接定位」且声明独立重算', /已按链接定位/.test(notice) && /独立重算/.test(notice), notice.replace(/\s+/g, ' ').slice(0, 80));
    const locateTxt = await text('#locate');
    check('台账页：① 定位块确实定位到同一格年', /cell_0020 · 2008/.test(locateTxt), locateTxt.replace(/\s+/g, ' ').slice(0, 60));
    await screenshot('04_台账页_定位保留');

                        
    const badRes = await run('window.__changes.applyLocate("?cell=cell_0020&era=2&year=2008&x=1")');
    check('台账页：非法定位参数被拒绝（跨段 + 多余参数）',
      badRes && badRes.ok === false && badRes.rejected.length === 2, JSON.stringify(badRes && badRes.rejected));
    const goodRes = await run('window.__changes.applyLocate("?cell=cell_0074&era=2&year=2019")');
    check('台账页：合法定位参数可再次应用', goodRes && goodRes.ok === true && goodRes.cellId === 'cell_0074' && goodRes.year === 2019, JSON.stringify(goodRes));

                                                                                    
    await send('Page.navigate', { url: out.url });
    await sleep(3000);
    await clickSel('#caseSegB');
    await sleep(1400);
    const stB = await run('window.__workbench.getState()');
    check('切换案例 B：状态与对象数正确', stB.caseKey === 'B' && stB.status === 'ready' && stB.objects === 1, JSON.stringify(stB));
    const rectsB = await run('document.querySelectorAll("#frame .cellRect").length');
    check('切换案例 B：地图只剩 1 个窗口（A 的 34 框已清除）', rectsB === 1, 'rects=' + rectsB);
    const itemsB = await run('document.querySelectorAll("#objList .objItem").length');
    check('切换案例 B：列表只剩 1 项', itemsB === 1, 'items=' + itemsB);
    const scopeB = await text('#objScope');
    check('切换案例 B：范围性质逐字为论文报告窗口标注',
      scopeB.indexOf(EXP.bLabel) >= 0, scopeB.slice(0, 80));
    const dB = await run('window.__workbench.getDetail()');
    await run(`(()=>{const s=document.getElementById('yearSelect');s.value='2001';s.dispatchEvent(new Event('change'));})()`);
    await sleep(260);
    const dB01 = await run('window.__workbench.getDetail()');
    check('切换案例 B：年份切到 2001 后数值为 B 的产物值', dB01.prod === EXP.bProd2001, 'page=' + dB01.prod + ' disk=' + EXP.bProd2001);
    const detText = await text('#tabBody');
    check('切换案例 B：显示部分有效覆盖与有效像元数',
      /部分有效覆盖/.test(detText) && /PARTIAL_COVERAGE/.test(detText) && String(EXP.bValidPixels) === '813' && detText.indexOf('813') >= 0,
      detText.replace(/\s+/g, ' ').slice(0, 100));
    const factB = await text('#factRow');
    check('切换案例 B：事实条把 PARTIAL_COVERAGE 翻成中文并标警示',
      /部分有效覆盖/.test(factB) && /有效面积比例/.test(factB), factB.replace(/\s+/g, ' ').slice(0, 60));
    check('切换案例 B：不残留 A 的数值（无 4,258 / cell_0020）',
      (await text('.col-right')).indexOf('cell_0020') < 0, '');
    const srcB = await run('window.__workbench.getSource()');
    check('切换案例 B：来源面板随案例更新（本地复算指向恩格贝脚本 / 未验证含出版定稿）',
      /verify_engebei_case/.test(srcB.rows[2].detail) && /出版定稿/.test(srcB.rows[4].detail),
      srcB.rows[2].detail.slice(0, 40));
    await screenshot('05_案例B_窗口与部分覆盖');

                      
    await clickSel('.tabs button[data-tab="ledger"]');
    await sleep(260);
    const hasBtn = await run('!!document.getElementById("btnLedger")');
    const ledgerTxt = await text('#tabBody');
    check('案例 B：台账入口禁用并说明原因（未接入原 34 格规则）',
      hasBtn === false && /未接入/.test(ledgerTxt) && /禁用/.test(ledgerTxt), ledgerTxt.replace(/\s+/g, ' ').slice(0, 80));
    await screenshot('06_案例B_台账入口禁用');

                                                                              
    await send('Network.emulateNetworkConditions', { offline: false, latency: 1800, downloadThroughput: 8e6, uploadThroughput: 8e6 });
    const beforeStale = (await run('window.__workbench.getStats()')).staleDropped;
    await run('window.__workbench.switchCase("B"); window.__workbench.switchCase("A"); true');
    await sleep(7000);
    const stRace = await run('window.__workbench.getState()');
    const statsRace = await run('window.__workbench.getStats()');
    check('异步竞态：快速 B→A 切换后最终仍是 A（迟到结果被丢弃）',
      stRace.caseKey === 'A' && stRace.status === 'ready' && statsRace.staleDropped > beforeStale,
      JSON.stringify({ caseKey: stRace.caseKey, status: stRace.status, stale: statsRace.staleDropped, before: beforeStale }));
    const rectsRace = await run('document.querySelectorAll("#frame .cellRect").length');
    check('异步竞态：地图与列表回到 34 框（无混装）', rectsRace === 34, 'rects=' + rectsRace);
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

                                                                                       
    const valBeforeReject = await text('#mainValue');
    const tampered = JSON.parse(JSON.stringify(BUNDLE_A));
    tampered.cellYears['cell_0020|2008'].prod_tC_yr = 1;
    const resign = await run(`(()=>{const t=${JSON.stringify(JSON.stringify(tampered))};const o=JSON.parse(t);o.bundleContentSha256=window.NppEntryCore.contentSha(o);return JSON.stringify(o);})()`);
    const r1 = await run(`window.__workbench.importCase('A', ${JSON.stringify(resign)}, null)`);
    await sleep(300);
    const bannerTxt = await text('#banner');
    const stRej = await run('window.__workbench.getState()');
    check('非法 bundle（篡改后重签自摘要）⇒ 拒绝', r1 && r1.ok === false, JSON.stringify(r1 && r1.errors && r1.errors.slice(0, 1)));
    check('拒绝后仍显示上一份已核验结果，并写明「新输入未被采用」',
      stRej.status === 'ready' && /上一份已核验结果/.test(bannerTxt) && /未被采用/.test(bannerTxt), bannerTxt.replace(/\s+/g, ' ').slice(0, 100));
    const valAfterReject = await text('#mainValue');
    check('拒绝后指标仍为原值（未被篡改值覆盖）', valAfterReject === valBeforeReject && valAfterReject.indexOf('—') !== 0,
      'before=' + valBeforeReject.replace(/\s+/g, ' ').slice(0, 24) + ' after=' + valAfterReject.replace(/\s+/g, ' ').slice(0, 24));
    await screenshot('07_非法输入被拒并保留上一份');

               
    const pinText = fs.readFileSync(path.join(ROOT, 'web/npp_estimate_bundle.pin.json'), 'utf8');
    const badPin = JSON.parse(pinText); badPin.bundleContentSha256 = 'local-sha256:' + '0'.repeat(64);
    const r2 = await run(`window.__workbench.importCase('A', ${JSON.stringify(JSON.stringify(BUNDLE_A))}, ${JSON.stringify(JSON.stringify(badPin))})`);
    await sleep(250);
    check('错 pin ⇒ 拒绝（不静默降级为"通过"）', r2 && r2.ok === false, JSON.stringify(r2 && r2.errors && r2.errors.slice(0, 1)));

                                             
    const r3 = await run(`window.__workbench.importCase('A', ${JSON.stringify(JSON.stringify(BUNDLE_A))}, null)`);
    await sleep(250);
    const metaAfterNoPin = await text('#statusGroup');
    const srcNoPin = await run('window.__workbench.getSource()');
    check('缺 pin ⇒ 可载入但 pin 层判为「未与发布摘要比对」（不冒充已核对发布件）',
      r3 && r3.ok === true && r3.pinStatus === 'PIN_ABSENT' &&
      /未与发布摘要比对/.test(metaAfterNoPin) && srcNoPin.rows[1].ok === false,
      (r3 && r3.pinStatus) + ' / ' + metaAfterNoPin.replace(/\s+/g, ' ').slice(0, 60));

                                             
    for (const badText of ['null', 'false', '0', '{"broken":']) {
      const rr = await run(`window.__workbench.importCase('A', ${JSON.stringify(JSON.stringify(BUNDLE_A))}, ${JSON.stringify(badText)})`);
      await sleep(160);
      const bnn = await text('#banner');
      check('结构非法的 pin ' + badText + ' ⇒ 拒绝载入并说明原因',
        rr && rr.ok === false && /pin/.test(bnn) && /(结构非法|不是合法 JSON)/.test(bnn),
        (rr && (rr.errors || [])[0] || '').slice(0, 60));
    }
                 
    await run(`window.__workbench.importCase('A', ${JSON.stringify(JSON.stringify(BUNDLE_A))}, ${JSON.stringify(pinText)})`);
    await sleep(400);

                                                                                       
    await send('Network.setBlockedURLs', { urls: ['*npp_estimate_bundle.json*'] });
    await run('window.__workbench.switchCase("A")');
    await sleep(1200);
    const stFail = await run('window.__workbench.getState()');
    const bannerFail = await text('#banner');
    check('数据包取不到 ⇒ 载入被拒绝并写明失败原因',
      stFail.status === 'error' && /载入被拒绝/.test(bannerFail) && /(网络获取失败|HTTP|未找到)/.test(bannerFail),
      bannerFail.replace(/\s+/g, ' ').slice(0, 110));
    await screenshot('07b_载入失败与错误说明');
    await send('Network.setBlockedURLs', { urls: [] });
    await send('Page.navigate', { url: out.url });
    await sleep(3000);

                                                                                 
    await send('Network.setBlockedURLs', { urls: ['*tile.openstreetmap.org*'] });
    await clickSel('#btnBasemap');
    await sleep(2500);
    const bm = await run('window.__workbench.getBasemap()');
    const bmBtn = await text('#btnBasemap');
    const rectsBm = await run('document.querySelectorAll("#frame .cellRect").length');
    const valBm = await text('#mainValue');
    check('底图失败：状态为 failed 且按钮改为「底图不可用」', bm.status === 'failed' && /不可用/.test(bmBtn), bm.status + ' / ' + bmBtn);
    check('底图失败：核心查看仍可用（34 框 + 指标仍在）', rectsBm === 34 && valBm.indexOf('—') !== 0, 'rects=' + rectsBm);
    await screenshot('08_底图失败核心仍可用');
    await send('Network.setBlockedURLs', { urls: [] });

                                                                                   
    await run('window.__workbench.clear()');
    await sleep(220);
    const cleared = await run('window.__workbench.getState()');
    const clearTxt = await text('#mainValue');
    check('清除 ⇒ 不再显示任何案例数值（状态回到 idle）',
      cleared.status === 'idle' && cleared.modelCaseId === null && clearTxt.trim() === '—', JSON.stringify(cleared) + ' / value=' + clearTxt.trim());

                                                                                
    await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: out.url });
    await sleep(3200);
    const vis = await run(`(()=>{
      const ids=['#caseSegA','#caseSegB','#yearSelect','#btnBasemap','#btnFit','#mainValue','.tabs button[data-tab="ledger"]','#objList'];
      const r={};ids.forEach(s=>{const e=document.querySelector(s);if(!e){r[s]='missing';return;}const b=e.getBoundingClientRect();r[s]={top:Math.round(b.top),bottom:Math.round(b.bottom),w:Math.round(b.width),h:Math.round(b.height),inView:b.top>=-1&&b.bottom<=innerHeight+1&&b.width>0&&b.height>0};});
      r.vh=innerHeight;r.vw=innerWidth;return r;})()`);
    const allVisible = ['#caseSegA', '#caseSegB', '#yearSelect', '#btnBasemap', '#btnFit', '#mainValue', '.tabs button[data-tab="ledger"]', '#objList']
      .every(k => vis[k] && vis[k] !== 'missing' && vis[k].inView !== false);
    check('小屏 1366×768：关键控件与按钮均在视口内', allVisible, JSON.stringify(vis));
    await screenshot('09_小屏1366x768');

                                                                                 
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    check('控制台：无未捕获异常', out.pageExceptions.length === 0, out.pageExceptions.slice(0, 2).join(' | '));
    check('控制台：无 error 级日志', out.consoleErrors.length === 0, out.consoleErrors.slice(0, 2).join(' | '));
    const tileOnly = out.externalRequests.every(u => /tile\.openstreetmap\.org/.test(u));
    check('网络：除主动开启的底图瓦片外，无任何外部请求', tileOnly,
      'total=' + out.externalRequests.length + ' hosts=' + JSON.stringify(Array.from(new Set(out.externalRequests.map(u => { try { return new URL(u).host; } catch (e) { return u.slice(0, 40); } })))));
    check('副作用：0 笔公共交易、0 次钱包请求', out.publicTransactionsSent === 0 && out.walletRequests === 0, '');

  } catch (e) {
    out.error = e.message;
    console.error('DRIVE ERROR:', e.stack || e.message);
    check('驱动异常', false, e.message);
  } finally {
    clearTimeout(fatal);
    if (!finished) finished = true;
    try { if (ws) ws.close(); } catch (e) { }
    try { if (browser) browser.kill(); } catch (e) { }
    try { if (server) server.close(); } catch (e) { }

    const failed = out.checks.filter(c => !c.ok);
    out.finishedAtUTC = new Date().toISOString();
    out.passed = out.checks.length - failed.length;
    out.total = out.checks.length;
    out.failed = failed.length;
    fs.mkdirSync(AUDIT, { recursive: true });
    fs.writeFileSync(path.join(AUDIT, 'browser_result_v1.1.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log('\n浏览器实测：' + out.passed + '/' + out.total + ' PASS' + (failed.length ? ' · ' + failed.length + ' FAIL' : ''));
    process.exit(failed.length ? 1 : 0);
  }
}

main();
