                   
                                                                
  
                                                    
                                                      
           
  
                   
                                      
                                            
                                   
                           
                                                       
  
                                                         
  
      
                                                                                
                                                                                            
   
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'web/workbench_evidence_registry.json');
const SCHEMA = 'CarbonSat-WorkbenchEvidenceRegistry-v1.0';

const N = require(path.join(ROOT, 'web/npp_entry_core.js'));
const E = require(path.join(ROOT, 'web/engebei_core.js'));

const read = p => fs.readFileSync(path.join(ROOT, p));
const sha = p => crypto.createHash('sha256').update(read(p)).digest('hex');
const has = p => fs.existsSync(path.join(ROOT, p));

                                        
const SPOT_DIR = 'audit/upstream_spotcheck_2026-10-19';

function build() {
  const aBytes = read('web/npp_estimate_bundle.json');
  const aBundle = JSON.parse(aBytes.toString('utf8'));
  const aPin = JSON.parse(read('web/npp_estimate_bundle.pin.json').toString('utf8'));
  const aVerdict = N.verifyBundle(aBundle, { pin: aPin, fileSha256: sha('web/npp_estimate_bundle.json') });
  if (!aVerdict.ok) throw new Error('案例 A 当前数据包未通过既有核心核验：' + (aVerdict.errors || []).join('；'));

  const bBytes = read('web/engebei_bundle.json');
  const bBundle = JSON.parse(bBytes.toString('utf8'));
  const bPin = JSON.parse(read('web/engebei_bundle.pin.json').toString('utf8'));
  const bVerdict = E.verifyBundle(bBundle, { pin: bPin, fileSha256: sha('web/engebei_bundle.json') });
  if (!bVerdict.ok) throw new Error('案例 B 当前数据包未通过既有核心核验：' + (bVerdict.errors || []).join('；'));

  const spot = JSON.parse(read(path.join(SPOT_DIR, 'spotcheck_results.json')).toString('utf8'));
  const sample = (spot.rows || []).map(r => ({ objectId: r.objectId, year: Number(r.year) }));
  const totalObjectYears = Object.keys(aBundle.cellYears).length + Object.keys(bBundle.records).length;

  const aSource = aBundle.generatedFrom.productionIntegral;
  const aFootprint = aBundle.generatedFrom.a2ValidFootprint || null;

  return {
    schemaVersion: SCHEMA,
    generatedAtUTC: new Date().toISOString(),
    generatedBy: 'scripts/build_workbench_evidence_registry.js',
    scopeNote: '本登记只把历史复算证据绑定到具体产物身份；它本身不执行复算，也不构成精度或来源真实性证据。',
    cases: {
      A: {
        caseId: aBundle.caseId || 'kubuqi_34_cells',
        methodVersion: (aBundle.methodology && aBundle.methodology.method_version) || null,
        bundle: {
          path: 'web/npp_estimate_bundle.json',
          bytes: aBytes.length,
          fileSha256: sha('web/npp_estimate_bundle.json'),
          contentDigest: aVerdict.content.recomputed,
          contentDigestDomain: 'NppEntryCore.verifyBundle().content.recomputed（local-sha256:…）',
        },
        pin: {
          path: 'web/npp_estimate_bundle.pin.json',
          fileSha256: sha('web/npp_estimate_bundle.pin.json'),
          declaredContentSha256: aPin.bundleContentSha256 || null,
          declaredBundleFileSha256: aPin.bundleFileSha256 || null,
        },
        sourceArtifacts: [
          { path: aSource.path, sha256: sha(aSource.path), bytes: read(aSource.path).length, role: '生产量积分 CSV（tC/yr 的直接来源）' },
        ].concat(aFootprint && has(aFootprint.path) ? [{ path: aFootprint.path, sha256: sha(aFootprint.path), bytes: read(aFootprint.path).length, role: 'A2 有效足迹 JSON（有效面积分母）' }] : []),
                                                    
        declaredSourceDigests: [
          { field: 'generatedFrom.productionIntegral.sha256', value: aSource.sha256 },
        ].concat(aFootprint ? [{ field: 'generatedFrom.a2ValidFootprint.sha256', value: aFootprint.sha256 }] : []),
        localRecompute: {
          claim: '既有清单派生脚本对源 CSV / A2 足迹做来源哈希核验并逐格派生清单（该轮 --verify 通过）',
          scriptPath: 'scripts/build_npp_estimate_bundle.py',
          scriptSha256: sha('scripts/build_npp_estimate_bundle.py'),
          reportPath: 'audit/estimation_upgrade/ACCEPTANCE.md',
          reportSha256: sha('audit/estimation_upgrade/ACCEPTANCE.md'),
          derived: {
            cellYears: Object.keys(aBundle.cellYears).length,
            classRows: Object.values(aBundle.cellYears).reduce((s, r) => s + (r.landCover || []).length, 0),
          },
          appliesTo: '案例 A 的整包（34 格 × 24 年）；不适用于单条记录的地面真实性。',
        },
      },
      B: {
        caseId: bBundle.caseId,
        methodVersion: (bBundle.methodology && bBundle.methodology.methodVersion) || null,
        bundle: {
          path: 'web/engebei_bundle.json',
          bytes: bBytes.length,
          fileSha256: sha('web/engebei_bundle.json'),
          contentDigest: bVerdict.stableDigestRecomputed,
          contentDigestDomain: 'EngebeiCore.stableDigestOf()（local-sha256:…，与 bundle.stableDigest 同域）',
        },
        pin: {
          path: 'web/engebei_bundle.pin.json',
          fileSha256: sha('web/engebei_bundle.pin.json'),
          declaredContentSha256: bPin.stableDigest || null,
          declaredBundleFileSha256: bPin.bundleFileSha256 || null,
        },
        windowSha256: {
          declared: bBundle.windowSha256 || null,
          recomputed: bVerdict.windowSha256Recomputed || null,
        },
        sourceArtifacts: [
          { path: bBundle.sourceRef.csvPath, sha256: sha(bBundle.sourceRef.csvPath), bytes: read(bBundle.sourceRef.csvPath).length, role: '逐像元积分后的年度 NPP CSV' },
          { path: bBundle.sourceRef.windowSpecPath, sha256: sha(bBundle.sourceRef.windowSpecPath), bytes: read(bBundle.sourceRef.windowSpecPath).length, role: '窗口规格（boundsWGS84 来源）' },
        ],
        declaredSourceDigests: [
          { field: 'sourceRef.csvSha256', value: bBundle.sourceRef.csvSha256 },
          { field: 'sourceRef.windowSpecSha256', value: bBundle.sourceRef.windowSpecSha256 },
        ],
        localRecompute: {
          claim: '既有独立复算脚本从源 CSV 重算 24 年数值并做反例自检（该轮通过）',
          scriptPath: 'scripts/verify_engebei_case.js',
          scriptSha256: sha('scripts/verify_engebei_case.js'),
          reportPath: 'audit/engebei_research_case_2026-10-16/ACCEPTANCE.md',
          reportSha256: sha('audit/engebei_research_case_2026-10-16/ACCEPTANCE.md'),
          derived: {
            years: Object.keys(bBundle.records).length,
          },
          appliesTo: '案例 B 的整包（2001–2024，单窗口）；不适用于该项目的地面真实性或治理成效。',
        },
      },
    },
    upstream: {
      reportPath: path.join(SPOT_DIR, 'REPORT.md'),
      reportSha256: sha(path.join(SPOT_DIR, 'REPORT.md')),
      resultsPath: path.join(SPOT_DIR, 'spotcheck_results.json'),
      resultsSha256: sha(path.join(SPOT_DIR, 'spotcheck_results.json')),
      toleranceRelative: spot.tolerance && spot.tolerance.relative,
      status: spot.status,
      sampleSize: sample.length,
      totalObjectYears,
      objectYears: sample,
      appliesTo: '仅所抽对象年在该次声明的计算口径下复现一致；**不得**读成全量正确、地面精度已验证或治理效果成立。',
    },
  };
}

function compare(a, b, keyPath) {
  const diffs = [];
  const walk = (x, y, p) => {
    if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') {
      if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push(p + ': 期望 ' + JSON.stringify(y) + '，实际 ' + JSON.stringify(x));
      return;
    }
    const keys = new Set([].concat(Object.keys(x), Object.keys(y)));
    keys.forEach(k => {
      if (k === 'generatedAtUTC') return;               
      walk(x[k], y[k], p ? p + '.' + k : k);
    });
  };
  walk(a, b, '');
  return diffs;
}

function main() {
  const freeze = process.argv.indexOf('--freeze') >= 0;
  const verify = process.argv.indexOf('--verify') >= 0;
  if (freeze === verify) { console.log(JSON.stringify({ ok: false, error: '需要且只需要 --freeze 或 --verify' })); return 2; }
  const data = build();
  if (freeze) {
    if (fs.existsSync(OUT)) { console.log(JSON.stringify({ ok: false, error: '登记已存在，拒绝覆盖：' + path.relative(ROOT, OUT) })); return 1; }
    fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, path: path.relative(ROOT, OUT).replace(/\\/g, '/'), sha256: sha('web/workbench_evidence_registry.json'), sample: data.upstream.sampleSize, total: data.upstream.totalObjectYears }));
    return 0;
  }
  const disk = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const diffs = compare(data, disk);
  console.log(JSON.stringify({ ok: diffs.length === 0, checked: 2, diffs: diffs.slice(0, 8) }, null, 0));
  return diffs.length ? 1 : 0;
}

try { process.exitCode = main(); }
catch (e) { console.log(JSON.stringify({ ok: false, error: e.message })); process.exitCode = 1; }
