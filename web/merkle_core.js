                                                               
  
                                                                    
  
                                      
                                                                  
                                             
                                      
                                       
  
                                                           
                                                                 
                                                     
                                                        
                                       
  
                     
                                                   
                                                            
                                                    
                                                                                  
                                            
  
                                                
                                                               
                                                                            
                                                                
                                                                           
  
                                                                    

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("ethers"), require("./e2e_core.js"));
  } else {
    root.MerkleCore = factory(
      typeof ethers !== "undefined" ? ethers : null,
      (typeof E2ECore !== "undefined" ? E2ECore : null)
    );
  }
})(typeof self !== "undefined" ? self : this, function (ETH, E2ECore) {
  "use strict";

  if (!ETH || !ETH.keccak256 || !ETH.toUtf8Bytes || !ETH.hexlify) {
    throw new Error("ethers 不可用（keccak256/toUtf8Bytes/hexlify 缺失）");
  }
  if (!E2ECore || !E2ECore.buildPayload || !E2ECore.keccakHex || !E2ECore.sha256HexUtf8) {
    throw new Error("E2ECore 不可用（冻结件 web/e2e_core.js 未加载）");
  }

                                                           
  const MERKLE_SPEC_VERSION = "npp-merkle-batch-v2";
  const HASH_ALGO = "keccak256";
  const LEAF_SCHEME = "packHash-v1 (e2e_core.buildPayload + ECMA_JSON.stringify, 15 fields)";
  const LEAF_ORDER_SPEC = "cellId asc (code point), then year asc (numeric)";
  const INTERNAL_NODE_SPEC = "keccak256(left || right) (ordered by position, non-commutative); node = H(child_even, child_odd)";
  const PATH_FOLD_SPEC = "cur := ((index >> k) & 1) == 0 ? H(cur, sib_k) : H(sib_k, cur)";
  const PAD_PREIMAGE = "CarbonSat-MRV|merkle-pad|v2";
  const RECORD_SET_PREFIX = "CarbonSat-MRV|record-set-v2\n";

                          
  const EXPECTED_LEAF_COUNT = 816;
  const EXPECTED_DISTINCT_CELLS = 34;
  const MIN_YEAR = 2001;
  const MAX_YEAR = 2024;

                                           
  function normHex(h) {
    if (typeof h !== "string") return h;
    return h.toLowerCase();
  }

  function isHex32(h) {
    return typeof h === "string" && /^0x[0-9a-f]{64}$/.test(h);
  }

                                                          
  function keccakOfUtf8(str) {
    if (typeof str !== "string") throw new Error("keccakOfUtf8 只接受字符串");
    return normHex(ETH.keccak256(ETH.toUtf8Bytes(str)));
  }

  function padLeaf() {
    return keccakOfUtf8(PAD_PREIMAGE);
  }

                                                              
  function leafOfPayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("leafOfPayload: payload 缺失（必须显式提供 15 字段 payload）");
    }
    const l = normHex(E2ECore.keccakHex(payload));
    if (!isHex32(l)) throw new Error("leafOfPayload: 结果不是 32 字节十六进制");
    return l;
  }

                                                   
  function leafOfRecord(rec) {
    if (!rec || typeof rec !== "object" || !rec.recordId || !rec.cellId || rec.year === undefined) {
      throw new Error("leafOfRecord: 记录缺 recordId/cellId/year");
    }
    return leafOfPayload(E2ECore.buildPayload(rec));
  }

                                                  
  function compareLeafOrder(a, b) {
    if (a.cellId !== b.cellId) return a.cellId < b.cellId ? -1 : 1;
    const ya = Number(a.year), yb = Number(b.year);
    if (ya !== yb) return ya < yb ? -1 : 1;
    return 0;
  }

  function sortRecords(records) {
    return records.slice().sort(function (a, b) { return compareLeafOrder(a, b); });
  }

                                                                           
  function buildLeafTable(records) {
    if (!Array.isArray(records)) throw new Error("buildLeafTable: records 必须是数组");
    if (records.length !== EXPECTED_LEAF_COUNT) {
      throw new Error("叶集条数 " + records.length + " ≠ 期望 " + EXPECTED_LEAF_COUNT + "（记录文件已变或截断）");
    }
    const sorted = sortRecords(records);
    const table = [];
    const seenKey = new Set();
    const seenLeaf = new Set();
    const cells = new Set();
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i];
      const y = Number(r.year);
      if (!Number.isInteger(y) || y < MIN_YEAR || y > MAX_YEAR) {
        throw new Error("年份越界/非整数: " + r.recordId + " year=" + r.year);
      }
      const key = r.cellId + "|" + y;
      if (seenKey.has(key)) throw new Error("重复叶序键 (cellId, year) = " + key + " —— 拒绝静默去重");
      seenKey.add(key);
      const leaf = leafOfRecord(r);
      if (seenLeaf.has(leaf)) throw new Error("重复叶值（两条记录 payload 摘要相同）: " + leaf);
      seenLeaf.add(leaf);
      cells.add(r.cellId);
      table.push({ index: i, recordId: r.recordId, cellId: r.cellId, year: y, leaf: leaf });
    }
    if (cells.size !== EXPECTED_DISTINCT_CELLS) {
      throw new Error("覆盖格数 " + cells.size + " ≠ 期望 " + EXPECTED_DISTINCT_CELLS);
    }
    return table;
  }

                                                                  
                                                                     
                                           
                      
  function hashNode(left, right) {
    const l = normHex(left), r = normHex(right);
    if (!isHex32(l) || !isHex32(r)) throw new Error("hashNode: 参数必须是 32 字节十六进制");
    return normHex(ETH.keccak256(ETH.concat([l, r])));
  }

  function paddedCountFor(n) {
    if (!Number.isInteger(n) || n <= 0) throw new Error("paddedCountFor: n 必须为正整数");
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  function depthFor(padded) {
    let d = 0, p = padded;
    while (p > 1) { p = p >> 1; d++; }
    return d;
  }

                                                                         
                                                               
  function buildTree(leaves) {
    if (!Array.isArray(leaves) || leaves.length === 0) throw new Error("buildTree: leaves 为空");
    const leafCount = leaves.length;
    const paddedCount = paddedCountFor(leafCount);
    const depth = depthFor(paddedCount);
    const pad = padLeaf();
    const level0 = leaves.map(normHex).concat(new Array(paddedCount - leafCount).fill(pad));
    const levels = [level0];
    let cur = level0;
    while (cur.length > 1) {
      const next = [];
      for (let i = 0; i < cur.length; i += 2) next.push(hashNode(cur[i], cur[i + 1]));
      levels.push(next);
      cur = next;
    }
    return {
      leafCount: leafCount, paddedCount: paddedCount, depth: depth,
      pad: pad, root: cur[0], levels: levels,
    };
  }

  function rootOfLeaves(leaves) {
    return buildTree(leaves).root;
  }

                                                 
  function proofForIndex(index, tree) {
    if (!Number.isInteger(index) || index < 0 || index >= tree.leafCount) {
      throw new Error("proofForIndex: index 越界（必须 < leafCount=" + tree.leafCount + "）");
    }
    return siblingChainAt(index, tree);
  }

                                                        
                                     
  function siblingChainAt(pos, tree) {
    if (!Number.isInteger(pos) || pos < 0 || pos >= tree.paddedCount) {
      throw new Error("siblingChainAt: pos 越界（必须 < paddedCount=" + tree.paddedCount + "）");
    }
    const proof = [];
    let i = pos;
    for (let k = 0; k < tree.depth; k++) {
      proof.push(tree.levels[k][i ^ 1]);
      i = i >> 1;
    }
    return proof;
  }

                                                       
  function processProof(leaf, index, proof) {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error("processProof: index 必须是 ≥0 的整数（位置绑定必需：只给叶与证明不足以判定归属）");
    }
    let cur = normHex(leaf);
    for (let k = 0; k < proof.length; k++) {
      const sib = normHex(proof[k]);
      cur = ((index >> k) & 1) === 0 ? hashNode(cur, sib) : hashNode(sib, cur);
    }
    return cur;
  }

                                              
                                                 
                                                       
  function verifyLeafAgainstRoot(leaf, index, proof, root, leafCount, depth) {
    const n = Number(leafCount);
    if (!Number.isInteger(index) || index < 0 || index >= n) {
      return { ok: false, reason: "index 越界或非整数（必须满足 0 ≤ index < leafCount）" };
    }
    if (!Array.isArray(proof) || proof.length !== Number(depth)) {
      return { ok: false, reason: "证明长度 ≠ depth（当前 " + (Array.isArray(proof) ? proof.length : "非数组") + "，期望 " + depth + "）" };
    }
    for (let i = 0; i < proof.length; i++) {
      if (!isHex32(normHex(proof[i]))) return { ok: false, reason: "证明第 " + i + " 项不是 32 字节十六进制" };
    }
    if (!isHex32(normHex(leaf)) || !isHex32(normHex(root))) {
      return { ok: false, reason: "leaf/root 不是 32 字节十六进制" };
    }
    const recomputed = processProof(leaf, index, proof);
    if (recomputed !== normHex(root)) {
      return { ok: false, reason: "按 index=" + index + " 的路径位折叠得 " + recomputed.slice(0, 12)
               + "… ≠ 给定根 " + normHex(root).slice(0, 12) + "…" };
    }
    return { ok: true, reason: "叶属于该根的第 " + index + " 位（位置绑定的成员证明通过）" };
  }

  function supportedMeta(meta) {
    if (!meta || typeof meta !== "object") return "缺少 batchMeta（不接受「只给 root」的调用）";
    if (meta.merkleSpecVersion !== MERKLE_SPEC_VERSION) return "merkleSpecVersion 不受支持: " + meta.merkleSpecVersion;
    if (meta.hashAlgo !== HASH_ALGO) return "hashAlgo 不受支持: " + meta.hashAlgo;
    if (meta.leafOrderSpec !== LEAF_ORDER_SPEC) return "leafOrderSpec 不受支持: " + meta.leafOrderSpec;
    if (meta.leafScheme !== LEAF_SCHEME) return "leafScheme 不受支持: " + meta.leafScheme;
    if (meta.internalNodeSpec !== undefined && meta.internalNodeSpec !== INTERNAL_NODE_SPEC) {
      return "internalNodeSpec 不受支持: " + meta.internalNodeSpec;
    }
    if (meta.pathFoldSpec !== undefined && meta.pathFoldSpec !== PATH_FOLD_SPEC) {
      return "pathFoldSpec 不受支持: " + meta.pathFoldSpec;
    }
    return null;
  }

                                                                 
  function verifyRecordMembership(opts) {
    const meta = opts.meta;
    const bad = supportedMeta(meta);
    if (bad) return { ok: false, status: "未核验", reason: bad };
    if (Number(meta.leafCount) !== Number(opts.leafCount) || Number(meta.depth) !== Number(opts.depth)) {
      return { ok: false, status: "未核验", reason: "调用参数与 batchMeta 的 leafCount/depth 不一致" };
    }
    let leaf;
    try { leaf = leafOfRecord(opts.record); }
    catch (e) { return { ok: false, status: "未核验", reason: "叶重算失败: " + ((e && e.message) || e) }; }
    const r = verifyLeafAgainstRoot(leaf, opts.index, opts.proof, meta.root, meta.leafCount, meta.depth);
    if (!r.ok) return { ok: false, status: "失败", reason: r.reason, leaf: leaf };
    return { ok: true, status: "通过", leaf: leaf,
             reason: "由记录体重算叶 → 10 项兄弟哈希按 index 的第 0..9 位折叠得同一根（离线核验，根未上链）" };
  }

                                                               
  function recordSetSha256(leafTable) {
    const parts = [RECORD_SET_PREFIX];
    leafTable.forEach(function (t) {
      parts.push(t.cellId + "|" + t.year + "|" + t.leaf + "\n");
    });
    return E2ECore.sha256HexUtf8(parts.join(""));
  }

                                                                  
                                                        
                     
  const MERKLE_NUMERIC_VECTORS = [
    [0, "0"], [-0, "0"], [1, "1"], [-1, "-1"], [12, "12"],
    [1.0, "1"], [12.0, "12"], [1.5, "1.5"], [-2.25, "-2.25"],
    [0.1, "0.1"], [0.1 + 0.2, "0.30000000000000004"],
    [0.1386160279805352, "0.1386160279805352"],
    [40.099999999999966, "40.099999999999966"],
    [107.94999999999997, "107.94999999999997"],
    [1e-7, "1e-7"], [1.5e-7, "1.5e-7"], [1e-6, "0.000001"], [1e-5, "0.00001"],
    [1e15, "1000000000000000"], [1e16, "10000000000000000"],
    [1e20, "100000000000000000000"], [1e21, "1e+21"], [1.5e21, "1.5e+21"],
    [123456789, "123456789"], [2012, "2012"], [2001, "2001"],
  ];

                                                  
  function jsNumberString(v) {
    if (typeof v !== "number") throw new Error("jsNumberString 只接受 number");
    if (!Number.isFinite(v)) throw new Error("NaN/Infinity 不允许（本项目失败关闭，不静默转 null）");
    return JSON.stringify(v);
  }

  function assertNumericVectors() {
    const bad = [];
    MERKLE_NUMERIC_VECTORS.forEach(function (pair, i) {
      const got = jsNumberString(pair[0]);
      if (got !== pair[1]) bad.push("#" + i + " " + pair[0] + " → " + got + "（期望 " + pair[1] + "）");
    });
    return { ok: bad.length === 0, count: MERKLE_NUMERIC_VECTORS.length, failures: bad };
  }

  return {
    MERKLE_SPEC_VERSION: MERKLE_SPEC_VERSION,
    HASH_ALGO: HASH_ALGO,
    LEAF_SCHEME: LEAF_SCHEME,
    LEAF_ORDER_SPEC: LEAF_ORDER_SPEC,
    INTERNAL_NODE_SPEC: INTERNAL_NODE_SPEC,
    PATH_FOLD_SPEC: PATH_FOLD_SPEC,
    PAD_PREIMAGE: PAD_PREIMAGE,
    RECORD_SET_PREFIX: RECORD_SET_PREFIX,
    EXPECTED_LEAF_COUNT: EXPECTED_LEAF_COUNT,
    EXPECTED_DISTINCT_CELLS: EXPECTED_DISTINCT_CELLS,
    normHex: normHex,
    isHex32: isHex32,
    keccakOfUtf8: keccakOfUtf8,
    padLeaf: padLeaf,
    leafOfPayload: leafOfPayload,
    leafOfRecord: leafOfRecord,
    compareLeafOrder: compareLeafOrder,
    sortRecords: sortRecords,
    buildLeafTable: buildLeafTable,
    hashNode: hashNode,
    paddedCountFor: paddedCountFor,
    depthFor: depthFor,
    buildTree: buildTree,
    rootOfLeaves: rootOfLeaves,
    proofForIndex: proofForIndex,
    siblingChainAt: siblingChainAt,
    processProof: processProof,
    verifyLeafAgainstRoot: verifyLeafAgainstRoot,
    verifyRecordMembership: verifyRecordMembership,
    recordSetSha256: recordSetSha256,
    MERKLE_NUMERIC_VECTORS: MERKLE_NUMERIC_VECTORS,
    jsNumberString: jsNumberString,
    assertNumericVectors: assertNumericVectors,
  };
});
