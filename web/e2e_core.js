                                               
  
                            
                                                  
                                                       
                                                                         
  
                                           
                                 

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(typeof require !== "undefined" ? require("ethers") : null);
  } else {
    root.E2ECore = factory(typeof ethers !== "undefined" ? ethers : null);
  }
})(typeof self !== "undefined" ? self : this, function (ETH) {
  "use strict";

  const METHOD_VERSION = "CarbonSat-NPP-Evidence-v1.0";
  const DECLARATION = "DESCRIPTIVE_NPP_ONLY";
  const SEPOLIA_CHAIN_ID = 11155111;

                                                           
  const PAYLOAD_FIELDS = [
    "recordId", "cellId", "year", "lon", "lat", "npp", "nppUnit",
    "sourceHash", "evidenceRef", "methodVersion", "declarationCategory",
    "attributionStatus", "mlScore", "mlFlag", "mlInterpretationStatus",
  ];

                                   
  function canonicalize(v) {
    if (v === null || v === undefined || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(canonicalize);
    return Object.keys(v).sort().reduce(function (a, k) {
      a[k] = canonicalize(v[k]);
      return a;
    }, {});
  }

                                                     
  function keccakHex(obj) {
    if (!ETH || !ETH.keccak256 || !ETH.toUtf8Bytes) {
      throw new Error("ethers.keccak256 不可用（ethers 未加载）");
    }
    return ETH.keccak256(ETH.toUtf8Bytes(JSON.stringify(canonicalize(obj))));
  }

  function normalizeMl(rec) {
    const ml = rec.mlReview || rec.nppMlReview || {};
    return {
      score: ml.score,
      flag: ml.flag,
      interpretationStatus: ml.interpretationStatus,
    };
  }

                                   
  function buildPayload(rec) {
    const ml = normalizeMl(rec);
    return {
      recordId: rec.recordId,
      cellId: rec.cellId,
      year: rec.year,
      lon: rec.lon,
      lat: rec.lat,
      npp: rec.npp,
      nppUnit: rec.nppUnit,
      sourceHash: rec.sourceHash,
      evidenceRef: rec.evidenceRef,
      methodVersion: rec.methodVersion || METHOD_VERSION,
      declarationCategory: rec.declarationCategory || DECLARATION,
      attributionStatus: rec.attributionStatus || "insufficient_evidence",
      mlScore: ml.score,
      mlFlag: ml.flag,
      mlInterpretationStatus: ml.interpretationStatus,
    };
  }

                                                      
  function buildPackage(rec) {
    const payload = buildPayload(rec);
    const packHash = keccakHex(payload);                  
    return {
      hashAlgo: "keccak256",
      packHash: packHash,
      payload: payload,
                                                          
      wholeBundlePackSha256: rec.wholeBundlePackSha256 || null,
    };
  }

                                        
  function verifyLocal(pkg) {
    const recomputed = keccakHex(pkg.payload);
    return { ok: recomputed === pkg.packHash, recomputed: recomputed, stored: pkg.packHash };
  }

                                        
  function verifyAgainstChain(pkg, chainAnchor) {
    if (!chainAnchor || !chainAnchor.exists) {
      return { ok: false, reason: "链上无此包哈希（未登记或被篡改为其他哈希）" };
    }
    const recomputed = keccakHex(pkg.payload);
    if (recomputed !== pkg.packHash) {
      return { ok: false, reason: "本地包 payload 重算哈希与包内 packHash 不符（包已损坏）" };
    }
    if (recomputed !== chainAnchor.packHash) {
      return { ok: false, reason: "重算哈希与链上锚定哈希不符（本地证据被改动）" };
    }
    if (pkg.payload.methodVersion !== chainAnchor.methodVersion) {
      return { ok: false, reason: "方法版本不符" };
    }
    if (pkg.payload.declarationCategory !== chainAnchor.declarationCategory) {
      return { ok: false, reason: "声明类别不符" };
    }
    return { ok: true, reason: "链上核验通过" };
  }

                                                                         
    
          
                                                              
                                                                              
                                                                     
                                                                       
                                                                             
  const REVIEW_SCHEMA = "CarbonSat-NPP-HumanReview-v1.0";
  const REVIEW_OPINION_TYPES = {
    DATA_ISSUE_PENDING:      { code: "DATA_ISSUE_PENDING",      label: "数据问题待核" },
    INSUFFICIENT_EVIDENCE:   { code: "INSUFFICIENT_EVIDENCE",   label: "证据不足暂无法判断" },
    VERIFIED_NO_ATTRIBUTION: { code: "VERIFIED_NO_ATTRIBUTION", label: "已核查但不作治理归因" },
  };

  function buildReviewRecord(context, review) {
    const opinion = REVIEW_OPINION_TYPES[review.opinionCode];
    if (!opinion) throw new Error("无效审查意见类型: " + review.opinionCode);

    const evidenceContext = {
      recordId: context.recordId,
      cellId: context.cellId,
      year: context.year,
      lon: context.lon,
      lat: context.lat,
      npp: context.npp,
      nppUnit: context.nppUnit,
      prevNpp: context.prevNpp,
      jump: context.jump,
      rulePrescreen: {
        method: context.rulePrescreen.method,
        score: context.rulePrescreen.score,
        flag: context.rulePrescreen.flag,
        reasons: context.rulePrescreen.reasons || [],
      },
      mlReview: {
        method: context.mlReview.method,
        modelVersion: context.mlReview.modelVersion,
        featureVersion: context.mlReview.featureVersion,
        trainingCsvSha256: context.mlReview.trainingCsvSha256,
        score: context.mlReview.score,
        flag: context.mlReview.flag,
        eraFlag: context.mlReview.eraFlag,
        interpretationStatus: context.mlReview.interpretationStatus,
      },
      sourceHash: context.sourceHash,
      evidenceRef: context.evidenceRef,
      modelVersion: context.modelVersion || METHOD_VERSION,
      declarationCategory: context.declarationCategory || DECLARATION,
      attributionStatus: context.attributionStatus || "insufficient_evidence",
                                        
      wholeBundlePackSha256: context.wholeBundlePackSha256 || null,
      knownLimitations: context.knownLimitations || [],
    };

                                                                
    if (evidenceContext.attributionStatus !== "insufficient_evidence") {
      throw new Error("复核记录上下文 attributionStatus 必须为 insufficient_evidence");
    }

    const reviewObj = {
      opinion: opinion.code,
      opinionLabel: opinion.label,
      basis: review.basis || "",
      reviewer: review.reviewer || "",
      timestamp: review.timestamp || new Date().toISOString(),
    };

                                                           
    const reviewHash = keccakHex({ evidenceContext: evidenceContext, review: reviewObj });
    return {
      schemaVersion: REVIEW_SCHEMA,
      hashAlgo: "keccak256",
      reviewHash: reviewHash,
      evidenceContext: evidenceContext,                        
      review: reviewObj,                                        
    };
  }

                                                            
  function verifyReviewRecord(rec) {
    if (!rec || !rec.evidenceContext || !rec.review) {
      return { ok: false, reason: "结构缺失 evidenceContext / review" };
    }
    const recomputed = keccakHex({ evidenceContext: rec.evidenceContext, review: rec.review });
    return {
      ok: recomputed === rec.reviewHash,
      recomputed: recomputed,
      stored: rec.reviewHash,
      reason: recomputed === rec.reviewHash
        ? "核验通过：审查记录（证据上下文 + 人工意见）未被改动"
        : "核验失败：审查记录（证据上下文或人工意见）被改动",
    };
  }

                                          
    
                                            
                                                       
                                                                                     
                                                       
  function shortHash(h) {
    if (!h || typeof h !== "string") return String(h);
    return h.length > 18 ? h.slice(0, 10) + "…" + h.slice(-6) : h;
  }

  function reviewVersionStatus(opinionRecord, currentPack) {
    currentPack = currentPack || {};
    const ec = opinionRecord && opinionRecord.evidenceContext;
    if (!ec) {
      return { stale: true, reasons: ["缺少 evidenceContext"], bound: null, current: null };
    }
    const bound = {
      evidenceRef: ec.evidenceRef,
      modelVersion: ec.modelVersion,
      wholeBundlePackSha256: ec.wholeBundlePackSha256,
    };
    const current = {
      evidenceRef: currentPack.evidenceRef !== undefined ? currentPack.evidenceRef : bound.evidenceRef,
      modelVersion: currentPack.methodVersion !== undefined ? currentPack.methodVersion : bound.modelVersion,
      wholeBundlePackSha256: currentPack.wholeBundlePackSha256,
    };
    const reasons = [];
    if (current.wholeBundlePackSha256 && bound.wholeBundlePackSha256 &&
        current.wholeBundlePackSha256 !== bound.wholeBundlePackSha256) {
      reasons.push("整包哈希(wholeBundlePackSha256)不一致：意见依据 " + shortHash(bound.wholeBundlePackSha256) +
                   "，当前 " + shortHash(current.wholeBundlePackSha256));
    }
    if (current.evidenceRef && bound.evidenceRef && current.evidenceRef !== bound.evidenceRef) {
      reasons.push("证据锚点(evidenceRef)不一致：意见依据 " + shortHash(bound.evidenceRef) +
                   "，当前 " + shortHash(current.evidenceRef));
    }
    if (current.modelVersion && bound.modelVersion && current.modelVersion !== bound.modelVersion) {
      reasons.push("模型/方法版本不一致：意见依据 " + shortHash(bound.modelVersion) +
                   "，当前 " + shortHash(current.modelVersion));
    }
    return { stale: reasons.length > 0, reasons: reasons, bound: bound, current: current };
  }

                                   
  function checkRegisterEnv(opts) {
    opts = opts || {};
    if (!opts.hasEthereum) {
      return { ok: false, reason: "无钱包：window.ethereum 不可用（请使用带钱包的浏览器扩展）" };
    }
    if (!opts.contractAddress) {
      return { ok: false, reason: "无合约地址：请在页面配置中填写已部署的 EvidenceAnchor 地址" };
    }
    if (opts.chainId !== undefined && String(opts.chainId) !== String(SEPOLIA_CHAIN_ID)) {
      return { ok: false, reason: "错链：当前 chainId=" + opts.chainId + "，需 Sepolia " + SEPOLIA_CHAIN_ID };
    }
    return { ok: true, reason: "环境就绪" };
  }

                           
  function checkReadEnv(opts) {
    opts = opts || {};
    if (!opts.contractAddress) {
      return { ok: false, reason: "无合约地址：请在页面配置中填写已部署的 EvidenceAnchor 地址" };
    }
    return { ok: true, reason: "环境就绪（只读）" };
  }

                                                                           
                                                              
                                                                           
    
                   
                                                   
                                                                   
                                                    
                                                          
                                                            
                                                         
                               

  const PACK_HASH_VERSION = "pack-hash-v2";

                                                                 
  function sha256HexUtf8(str) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let utf8;
    if (typeof TextEncoder !== "undefined") {
      utf8 = new TextEncoder().encode(str);
    } else if (ETH && ETH.toUtf8Bytes) {
      utf8 = ETH.toUtf8Bytes(str);
    } else {
      throw new Error("缺少 UTF-8 编码器（TextEncoder / ethers.toUtf8Bytes）");
    }
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const len = utf8.length;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(utf8);
    padded[len] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, Math.floor(len / 536870912), false);                  
    dv.setUint32(padded.length - 4, (len << 3) >>> 0, false);                             
    const w = new Int32Array(64);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15], y = w[i - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return (x >>> 0).toString(16).padStart(8, "0"); }).join("");
  }

                                                                  
                                                         
  function pyCanonicalJson(v) {
    if (v === null || v === undefined) return "null";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(pyCanonicalJson).join(", ") + "]";
    if (typeof v === "object") {
      return "{" + Object.keys(v).sort().map(function (k) {
        return JSON.stringify(k) + ": " + pyCanonicalJson(v[k]);
      }).join(", ") + "}";
    }
    return "null";
  }

                                                         
  function recomputeManifestPackSha256(manifest) {
    const parts = [PACK_HASH_VERSION + "\n"];
    const files = (manifest.files || []).slice().sort(function (a, b) {
      if (a.path === b.path) return 0;
      return a.path < b.path ? -1 : 1;
    });
    files.forEach(function (it) {
      parts.push(it.path + "|" + (it.sha256 || "MISSING") + "\n");
    });
    parts.push(pyCanonicalJson(manifest.metadata));
    parts.push("\n#recordRefs\n");
    parts.push(pyCanonicalJson(manifest.recordRefs));
    parts.push("\n#methodHash\n");
    parts.push(String(manifest.methodHash));
    return sha256HexUtf8(parts.join(""));
  }

                                               
  function verifyManifestSource(manifest) {
    if (!manifest || typeof manifest !== "object") {
      return {
        ok: false, status: "未核验", stored: null, recomputed: null, onChainAnchored: false,
        reason: "未取得 manifest：网页没有独立取得并重算整包清单，不得显示整包来源已核验",
      };
    }
    const stored = manifest.packSha256;
    let recomputed = null, err = null;
    try { recomputed = recomputeManifestPackSha256(manifest); }
    catch (e) { err = String((e && e.message) || e); }
    if (err) {
      return { ok: false, status: "未核验", stored: stored, recomputed: null, onChainAnchored: false,
               reason: "整包哈希重算失败：" + err };
    }
    if (!stored) {
      return { ok: false, status: "未核验", stored: null, recomputed: recomputed, onChainAnchored: false,
               reason: "manifest 缺 packSha256 字段" };
    }
    if (recomputed !== stored) {
      return {
        ok: false, status: "未核验", stored: stored, recomputed: recomputed, onChainAnchored: false,
        reason: "整包 packSha256 独立重算(" + recomputed.slice(0, 12) + "…) 与清单记录(" +
                String(stored).slice(0, 12) + "…) 不符 —— 整包哈希字段被篡改或包内容已变",
      };
    }
    return {
      ok: true, status: "已核验", stored: stored, recomputed: recomputed, onChainAnchored: false,
      reason: "已按 build_evidence（pack-hash-v2）规则独立重算整包 packSha256 并与清单一致（本地离线核验，整包哈希未上链）",
    };
  }

                                            
  const BROWSER_LIMIT_NOTE =
    "范围限定：浏览器只是按 pack-hash-v2 规则重算 manifest【自身内容】的哈希，"
    + "仅证明该清单自洽；它【没有】读取也没有核对 manifest 内列出的源文件，"
    + "故不得理解为“已核对全部 32 个源文件”。逐文件核对见【源文件逐项核验】状态。";

                                           
                                           
    
                                                         
                                                      
                                                 
                                                             
  function verifyPackageSourceBinding(pkg, manifestVerify) {
    const mv = manifestVerify || { ok: false, reason: "未核验 manifest" };
    const inPkg = pkg ? (pkg.wholeBundlePackSha256 || null) : null;
    if (!mv.ok) {
      return {
        ok: false, status: "未核验", manifestVerified: false, inPackage: inPkg,
        verifiedManifest: mv.stored || null, onChainAnchored: false,
        scopeNote: BROWSER_LIMIT_NOTE,
        reason: "整包清单未核验（不能仅因下载包自带整包哈希就判一致）：" + mv.reason,
      };
    }
    if (typeof inPkg !== "string" || inPkg.length !== 64) {
      return {
        ok: false, status: "不一致", manifestVerified: true, inPackage: inPkg,
        verifiedManifest: mv.stored, onChainAnchored: false,
        scopeNote: BROWSER_LIMIT_NOTE,
        reason: "下载包未携带 wholeBundlePackSha256，无法与已核验 manifest 比对",
      };
    }
    if (inPkg !== mv.stored) {
      return {
        ok: false, status: "不一致", manifestVerified: true, inPackage: inPkg,
        verifiedManifest: mv.stored, onChainAnchored: false,
        scopeNote: BROWSER_LIMIT_NOTE,
        reason: "下载包 wholeBundlePackSha256(" + inPkg.slice(0, 12) + "…) ≠ 已核验 manifest(" +
                String(mv.stored).slice(0, 12) + "…)",
      };
    }
    return {
      ok: true, status: "一致", manifestVerified: true, inPackage: inPkg,
      verifiedManifest: mv.stored, onChainAnchored: false,
      scopeNote: BROWSER_LIMIT_NOTE,
      reason: "整包清单与下载包哈希一致：下载包 wholeBundlePackSha256 == 按 build_evidence（pack-hash-v2）"
              + "规则独立重算并通过的 manifest 值（本地离线核验；整包哈希未上链）",
    };
  }

                 
                                                                     
                                                     
                                      
                                                      
                                              
  function evaluateSourceFileVerification(opts) {
    const pkg = opts.pkg || null;
    const sb = opts.sourceBinding || null;
    const mv = opts.manifestVerify || null;
    const recordId = pkg && pkg.payload ? pkg.payload.recordId : null;

    if (!sb || typeof sb !== "object") {
      return { key: "sourceFiles", label: "源文件逐项核验", status: "未核验", ok: false,
        source: "python:verify_record_source_binding.py",
        reason: "未取得 Python verify_record_source_binding.py 的运行结果文件；"
                + "浏览器无法自行逐文件核对，故不得称通过" };
    }
    if (sb.ok !== true) {
      return { key: "sourceFiles", label: "源文件逐项核验", status: "未核验", ok: false,
        source: "python:verify_record_source_binding.py",
        reason: "Python verify_record_source_binding.py 未通过（ok=false）："
                + String((sb.details && sb.details.join("；")) || sb.error || "见其输出") };
    }
    if (recordId && sb.recordId && sb.recordId !== recordId) {
      return { key: "sourceFiles", label: "源文件逐项核验", status: "未核验", ok: false,
        source: "python:verify_record_source_binding.py",
        reason: "该结果属于记录 " + sb.recordId + "，与当前下载包 " + recordId + " 不是同一条记录" };
    }
                                                
    const sbPack = sb.manifest ? (sb.manifest.recomputedPackSha256 || sb.manifest.packSha256) : null;
    if (mv && mv.ok && mv.stored && sbPack && sbPack !== mv.stored) {
      return { key: "sourceFiles", label: "源文件逐项核验", status: "不一致", ok: false,
        source: "python:verify_record_source_binding.py",
        reason: "结果所属整包哈希(" + String(sbPack).slice(0, 12) + "…) ≠ 已核验 manifest("
                + String(mv.stored).slice(0, 12) + "…)，结果已过期或不属于本包" };
    }
    const inputsCurrent = sb.manifest ? sb.manifest.inputsCurrent : null;
    if (inputsCurrent === false) {
      return { key: "sourceFiles", label: "源文件逐项核验", status: "不一致", ok: false,
        source: "python:verify_record_source_binding.py",
        reason: "Python 报告 manifest 输入文件哈希已过期：" + String((sb.manifest.staleInputs || []).join("、")) };
    }
    const nRec = sb.verifyFile ? sb.verifyFile.recordCount : null;
    return {
      key: "sourceFiles", label: "源文件逐项核验", status: "通过", ok: true,
      source: "python:verify_record_source_binding.py",
      recordId: sb.recordId || null,
      verifyFileOk: sb.verifyFile ? sb.verifyFile.ok : null,
      recordCount: nRec,
      manifestRecomputeOk: sb.manifest ? sb.manifest.packSha256RecomputeOk : null,
      inputsCurrent: inputsCurrent,
      onChainAnchored: false,
      reason: "Python verify_record_source_binding.py 实际运行并通过：源 CSV 全量重算"
              + (nRec ? " " + String(nRec) + " 条" : "（条数见 Python 输出）")
              + "、所选记录 npp/sourceHash/evidenceRef 逐项对齐、manifest 声明的输入哈希"
              + "与盘上逐文件一致（离线核验，未上链）",
    };
  }

                                 
                                                         
                                                        
                               
                                                                                 
                                          
                  
  function evaluateVerificationStates(opts) {
    opts = opts || {};
    const pkg = opts.pkg || null;

    let single;
    if (!pkg) {
      single = { key: "single", label: "单条内容哈希", status: "未核验", ok: false,
                 reason: "尚未生成下载包" };
    } else {
      const r = verifyLocal(pkg);
      single = {
        key: "single", label: "单条内容哈希", status: r.ok ? "通过" : "失败", ok: r.ok,
        reason: r.ok ? "单条 payload keccak256 重算一致（链上锚定的就是它）"
                     : "单条 payload keccak256 重算与包内 packHash 不符（包内容已被改动）",
        recomputed: r.recomputed, stored: r.stored,
      };
    }

    const wbRaw = verifyPackageSourceBinding(pkg, opts.manifestVerify);
    const wholeBundle = {
      key: "wholeBundle", label: "整包清单与下载包哈希", status: wbRaw.status, ok: wbRaw.ok,
      reason: wbRaw.reason, scopeNote: wbRaw.scopeNote, inPackage: wbRaw.inPackage,
      verifiedManifest: wbRaw.verifiedManifest,
      onChainAnchored: false,
    };

    let chain;
    if (!pkg || opts.chainAnchor === undefined || opts.chainAnchor === null) {
      chain = { key: "chain", label: "链上登记", status: "未登记", ok: false,
                reason: "尚未在链上登记并读回（本轮未发送任何交易）" };
    } else {
      const c = verifyAgainstChain(pkg, opts.chainAnchor);
      chain = { key: "chain", label: "链上登记", status: c.ok ? "已核验" : "未登记", ok: c.ok, reason: c.reason };
    }

    const sourceFiles = evaluateSourceFileVerification({
      pkg: pkg, sourceBinding: opts.sourceBinding, manifestVerify: opts.manifestVerify,
    });

    return { single: single, wholeBundle: wholeBundle, chain: chain, sourceFiles: sourceFiles };
  }

  return {
    METHOD_VERSION: METHOD_VERSION,
    PACK_HASH_VERSION: PACK_HASH_VERSION,
    sha256HexUtf8: sha256HexUtf8,
    pyCanonicalJson: pyCanonicalJson,
    recomputeManifestPackSha256: recomputeManifestPackSha256,
    verifyManifestSource: verifyManifestSource,
    verifyPackageSourceBinding: verifyPackageSourceBinding,
    evaluateSourceFileVerification: evaluateSourceFileVerification,
    evaluateVerificationStates: evaluateVerificationStates,
    BROWSER_LIMIT_NOTE: BROWSER_LIMIT_NOTE,
    DECLARATION: DECLARATION,
    SEPOLIA_CHAIN_ID: SEPOLIA_CHAIN_ID,
    PAYLOAD_FIELDS: PAYLOAD_FIELDS,
    REVIEW_SCHEMA: REVIEW_SCHEMA,
    REVIEW_OPINION_TYPES: REVIEW_OPINION_TYPES,
    canonicalize: canonicalize,
    keccakHex: keccakHex,
    normalizeMl: normalizeMl,
    buildPayload: buildPayload,
    buildPackage: buildPackage,
    verifyLocal: verifyLocal,
    verifyAgainstChain: verifyAgainstChain,
    buildReviewRecord: buildReviewRecord,
    verifyReviewRecord: verifyReviewRecord,
    shortHash: shortHash,
    reviewVersionStatus: reviewVersionStatus,
    checkRegisterEnv: checkRegisterEnv,
    checkReadEnv: checkReadEnv,
  };
});
