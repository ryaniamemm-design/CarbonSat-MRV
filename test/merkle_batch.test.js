                                                                         
  
                                                
  
                                                                        
  
                                                                       
                               
                                               
                                                             
                                                               
  
                
                                                       
                                                            
                                                      
                                                                         

const { expect } = require("chai");
const hre = require("hardhat");
const ethers = require("ethers");
const fs = require("fs");
const path = require("path");
const MerkleCore = require("../web/merkle_core.js");

const REC_PATH = path.join(__dirname, "..", "evidence", "npp_evidence_records.json");
const METHOD_VERSION = "CarbonSat-NPP-Evidence-v1.0";
const DECLARATION = "DESCRIPTIVE_NPP_ONLY";
const ONCHAIN_PACK_HASH = "0xb3cd7107866918846f3a99f04350c037f046ae7864e7c045f8b0108c2cc75402";
const ONCHAIN_RECORD_ID = "cell_0030_2012";

let pass = 0, fail = 0;
function check(ok, label, extra) {
  if (ok) pass++; else fail++;
  console.log("  [" + (ok ? "PASS" : "FAIL") + "] " + label + (extra ? "  " + extra : ""));
  return ok;
}

                                                                 
                                                                        
async function expectRevert(thunk, label, reasonSubstr) {
  try {
    await thunk();
    return check(false, label + "：未 revert");
  } catch (e) {
    const msg = e.shortMessage || e.message || String(e);
    return check(!reasonSubstr || msg.includes(reasonSubstr), label, "revert -> " + msg.slice(0, 70));
  }
}

describe("EvidenceMerkleAnchor — NPP 批量成员证明 + 位置绑定 (本地 EVM)", function () {
  this.timeout(180000);

  let owner, anchor, table, tree, meta, proofOf, regIndex;

  before(async () => {
    const provider = new ethers.BrowserProvider(hre.network.provider);
    owner = await provider.getSigner(0);

    const records = JSON.parse(fs.readFileSync(REC_PATH, "utf-8")).records;
    table = MerkleCore.buildLeafTable(records);
    tree = MerkleCore.buildTree(table.map((t) => t.leaf));
    meta = {
      merkleSpecVersion: MerkleCore.MERKLE_SPEC_VERSION,
      hashAlgo: MerkleCore.HASH_ALGO,
      leafScheme: MerkleCore.LEAF_SCHEME,
      leafOrderSpec: MerkleCore.LEAF_ORDER_SPEC,
      internalNodeSpec: MerkleCore.INTERNAL_NODE_SPEC,
      pathFoldSpec: MerkleCore.PATH_FOLD_SPEC,
      leafCount: tree.leafCount,
      depth: tree.depth,
      root: tree.root,
    };
    proofOf = (i) => MerkleCore.proofForIndex(i, tree);
    regIndex = table.find((t) => t.recordId === ONCHAIN_RECORD_ID).index;

                                               
    const reg = table[regIndex];
    check(MerkleCore.normHex(reg.leaf) === MerkleCore.normHex(ONCHAIN_PACK_HASH),
      "桥：" + ONCHAIN_RECORD_ID + " 的叶 == 链上已登记 packHash（不发送新交易）");
    check(MerkleCore.assertNumericVectors().ok, "数值向量表（26 项）自检");
    check(tree.leafCount === 816 && tree.paddedCount === 1024 && tree.depth === 10,
      "叶集 816 → 补位 1024 → depth 10", tree.leafCount + "/" + tree.paddedCount + "/" + tree.depth);
    check(MerkleCore.MERKLE_SPEC_VERSION === "npp-merkle-batch-v2", "规范版本显式升 v2");
  });

  beforeEach(async function () {
    const artifact = await hre.artifacts.readArtifact("EvidenceMerkleAnchor");
    const F = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    anchor = await F.deploy();
    await anchor.waitForDeployment();
  });

  async function anchorRoot() {
    const rs = "0x" + MerkleCore.recordSetSha256(table);
    const tx = await anchor.anchorBatch(tree.root, tree.leafCount, tree.depth, rs, METHOD_VERSION, DECLARATION);
    await tx.wait();
    return rs;
  }

  it("锚定批次根并回读（本地 EVM；零公共交易）", async function () {
    const rs = await anchorRoot();
    const a = await anchor.getBatchAnchor(tree.root);
    check(a[0] === tree.root, "回读 root 一致");
    check(Number(a[1]) === 816 && Number(a[2]) === 10, "回读 leafCount/depth", a[1] + "/" + a[2]);
    check(a[3] === rs, "回读 recordSetSha256 一致");
    check(a[4] === METHOD_VERSION && a[5] === DECLARATION, "回读 methodVersion / 声明类别");
    check(a[8] === true, "exists = true");
    const d = await anchor.depthFor(816);
    check(Number(d) === 10, "合约 depthFor(816) = 10");
  });

  it("合约自描述的规范串与 JS 侧逐字一致（跨语言同串）", async function () {
    check((await anchor.MERKLE_SPEC_VERSION()) === MerkleCore.MERKLE_SPEC_VERSION,
      "MERKLE_SPEC_VERSION 一致", MerkleCore.MERKLE_SPEC_VERSION);
    check((await anchor.INTERNAL_NODE_SPEC()) === MerkleCore.INTERNAL_NODE_SPEC,
      "INTERNAL_NODE_SPEC 一致");
    check((await anchor.PATH_FOLD_SPEC()) === MerkleCore.PATH_FOLD_SPEC,
      "PATH_FOLD_SPEC 一致");
  });

  it("合约 foldPositional 与 JS processProof 同算法（抽样逐条一致）", async function () {
    await anchorRoot();
    let ok = 0, n = 0;
    for (const i of [0, 1, 35, 189, 408, 815]) {
      const onChain = await anchor.foldPositional(table[i].leaf, i, proofOf(i));
      const js = MerkleCore.processProof(table[i].leaf, i, proofOf(i));
      n++; if (onChain === js && js === tree.root) ok++;
    }
    check(ok === n && n === 6, "foldPositional 一致 " + ok + "/" + n);
  });

  it("正例：样本叶在正确 index 上的成员证明通过", async function () {
    await anchorRoot();
    for (const i of [0, 35, 408, 815, 189]) {
      const ok = await anchor.verifyLeaf(tree.root, table[i].leaf, i, tree.leafCount, tree.depth, proofOf(i));
      check(ok === true, "verifyLeaf(index=" + i + ", " + table[i].recordId + ")");
    }
  });

  it("正例：现场生成 24 条证明全部通过（跨 34 格抽样）", async function () {
    await anchorRoot();
    let ok = 0, n = 0;
    for (let i = 0; i < tree.leafCount; i += 34) {
      const r = await anchor.verifyLeaf(tree.root, table[i].leaf, i, tree.leafCount, tree.depth, proofOf(i));
      n++; if (r === true) ok++;
    }
    check(ok === n && n >= 24, "链上通过 " + ok + "/" + n);
  });

                                                                       
                                            
                                                                       
  it("PB1 反例：合法证明仅改范围内 index → 链上拒绝（位置绑定核心）", async function () {
    await anchorRoot();
    const reg = table[regIndex];
    const proof = proofOf(regIndex);

                       
    check(await anchor.verifyLeaf(tree.root, reg.leaf, regIndex, tree.leafCount, tree.depth, proof) === true,
      "对照：正确 index=" + regIndex + " 通过");

                                           
    const claimed = [...new Set([0, 1, regIndex - 1, regIndex + 1, regIndex ^ 1, 100, 815])]
      .filter((j) => j >= 0 && j < tree.leafCount && j !== regIndex);
    let rejected = 0;
    for (const j of claimed) {
      const r = await anchor.verifyLeaf(tree.root, reg.leaf, j, tree.leafCount, tree.depth, proof);
      if (r === false) rejected++;
      else check(false, "PB1 index=" + j + " 竟通过（位置未绑定）");
    }
    check(rejected === claimed.length, "PB1：改 index 全部被拒 " + rejected + "/" + claimed.length,
      "claimed=" + JSON.stringify(claimed));

                                   
    let multi = 0, multiN = 0;
    for (const i of [0, 408, 815]) {
      multiN++;
      const r = await anchor.verifyLeaf(tree.root, table[i].leaf, i ^ 1, tree.leafCount, tree.depth, proofOf(i));
      if (r === false) multi++;
    }
    check(multi === multiN, "PB1 抽样(index^1)全部被拒 " + multi + "/" + multiN);
  });

                                                                       
                                               
                                                                       
  it("PB2 反例：补位叶 + 真实补位证明 + 伪报 index → 链上拒绝（位置绑定核心）", async function () {
    await anchorRoot();
    const padPos = tree.paddedCount - 1;                        
    const padProof = MerkleCore.siblingChainAt(padPos, tree);
    check(padProof.length === tree.depth && MerkleCore.normHex(padProof[0]) === MerkleCore.normHex(tree.levels[0][padPos ^ 1]),
      "补位位置的兄弟链取自层结构（长度 " + padProof.length + "）");

                                                 
                                              
    const claimed = [0, 35, 815];
    let rejected = 0;
    for (const j of claimed) {
      const r = await anchor.verifyLeaf(tree.root, tree.pad, j, tree.leafCount, tree.depth, padProof);
      if (r === false) rejected++;
      else check(false, "PB2 伪报 index=" + j + " 竟通过（位置未绑定）");
    }
    check(rejected === claimed.length, "PB2：伪报 index 全部被拒 " + rejected + "/" + claimed.length,
      "claimed=" + JSON.stringify(claimed));

                              
    const rPadPos = await anchor.verifyLeaf(tree.root, tree.pad, padPos, tree.leafCount, tree.depth, padProof);
    check(rPadPos === false, "PB2：补位位置 " + padPos + " 本身也不是合法 index");
  });

  it("反例：篡改叶 → 链上拒绝", async function () {
    await anchorRoot();
    const bad = MerkleCore.keccakOfUtf8("tampered");
    const r = await anchor.verifyLeaf(tree.root, bad, 0, tree.leafCount, tree.depth, proofOf(0));
    check(r === false, "篡改叶被拒");
  });

  it("反例：用另一条记录的叶 + 本条的 index/proof → 链上拒绝", async function () {
    await anchorRoot();
    const r = await anchor.verifyLeaf(tree.root, table[1].leaf, 0, tree.leafCount, tree.depth, proofOf(0));
    check(r === false, "错配叶被拒");
  });

  it("反例：篡改记录体（npp+1）重算的叶 → 链上拒绝", async function () {
    await anchorRoot();
    const records = JSON.parse(fs.readFileSync(REC_PATH, "utf-8")).records;
    const target = table[regIndex];
    const rec = records.find((x) => x.recordId === target.recordId);
    const clone = Object.assign({}, rec, { npp: rec.npp + 1 });
    const badLeaf = MerkleCore.leafOfRecord(clone);
    check(badLeaf !== target.leaf, "改 npp ⇒ 叶变化");
    const r = await anchor.verifyLeaf(tree.root, badLeaf, regIndex, tree.leafCount, tree.depth, proofOf(regIndex));
    check(r === false, "被改记录的证明被拒");
  });

  it("反例：补位叶 index（816..1023）→ 链上拒绝", async function () {
    await anchorRoot();
    const r1 = await anchor.verifyLeaf(tree.root, tree.pad, 900, tree.leafCount, tree.depth, proofOf(0));
    const r2 = await anchor.verifyLeaf(tree.root, table[0].leaf, 816, tree.leafCount, tree.depth, proofOf(0));
    check(r1 === false && r2 === false, "index ≥ leafCount 一律拒绝（规范 V2）");
  });

  it("反例：证明长度 ≠ depth → 链上拒绝", async function () {
    await anchorRoot();
    const short = proofOf(0).slice(0, -1);
    const long = proofOf(0).concat([tree.pad]);
    const r1 = await anchor.verifyLeaf(tree.root, table[0].leaf, 0, tree.leafCount, tree.depth, short);
    const r2 = await anchor.verifyLeaf(tree.root, table[0].leaf, 0, tree.leafCount, tree.depth, long);
    check(r1 === false && r2 === false, "长度 9 / 11 均被拒（规范 V3）");
  });

  it("反例：篡改任一兄弟哈希 → 链上拒绝", async function () {
    await anchorRoot();
    const p = proofOf(408).slice();
    p[3] = MerkleCore.keccakOfUtf8("sibling-tampered");
    const r = await anchor.verifyLeaf(tree.root, table[408].leaf, 408, tree.leafCount, tree.depth, p);
    check(r === false, "篡改第 4 个兄弟被拒");
  });

  it("反例：未锚定的根 / leafCount·depth 与锚定不符 → 链上拒绝", async function () {
    await anchorRoot();
    const otherRoot = ethers.hexlify(ethers.randomBytes(32));
    const r1 = await anchor.verifyLeaf(otherRoot, table[0].leaf, 0, tree.leafCount, tree.depth, proofOf(0));
    const r2 = await anchor.verifyLeaf(tree.root, table[0].leaf, 0, 815, tree.depth, proofOf(0));
    const r3 = await anchor.verifyLeaf(tree.root, table[0].leaf, 0, tree.leafCount, 9, proofOf(0));
    check(r1 === false && r2 === false && r3 === false, "未知根 / 参数不符一律 false（规范 V4、V6）");
  });

  it("叶集绑定：删 1 条或叶序颠倒 ⇒ 根变化，原证明在新根下失效", async function () {
    await anchorRoot();
    const t815 = MerkleCore.buildTree(table.slice(0, -1).map((t) => t.leaf));
    const rev = MerkleCore.buildTree(table.slice().sort((a, b) => (a.cellId === b.cellId ? b.year - a.year : (a.cellId < b.cellId ? -1 : 1))).map((t) => t.leaf));
    check(t815.root !== tree.root, "删 1 条 ⇒ 根变化（规范 §4 E9）");
    check(rev.root !== tree.root, "叶序颠倒 ⇒ 根变化（规范 §4 E10）");
    const r = await anchor.verifyLeaf(t815.root, table[0].leaf, 0, 815, MerkleCore.depthFor(1024), proofOf(0));
    check(r === false, "未锚定的新根上验证 → false");
  });

  it("合约红线：非 DESCRIPTIVE_NPP_ONLY 一律 revert", async function () {
    const q = ethers.keccak256(ethers.toUtf8Bytes("candidate-batch-root"));
    const rs = ethers.keccak256(ethers.toUtf8Bytes("record-set-digest"));
    await expectRevert(
      () => anchor.anchorBatch.staticCall(q, 816, 10, rs, METHOD_VERSION, "REMOVAL"),
      "类别 REMOVAL", "only DESCRIPTIVE_NPP_ONLY allowed");
    await expectRevert(
      () => anchor.anchorBatch.staticCall(q, 816, 10, rs, METHOD_VERSION, "CARBON_CREDIT"),
      "类别 CARBON_CREDIT", "only DESCRIPTIVE_NPP_ONLY allowed");
    await expectRevert(
      () => anchor.anchorBatch.staticCall(q, 816, 10, rs, METHOD_VERSION, "GOVERNANCE_INCREMENT"),
      "类别 GOVERNANCE_INCREMENT", "only DESCRIPTIVE_NPP_ONLY allowed");
    await expectRevert(
      () => anchor.anchorBatch.staticCall(q, 816, 10, rs, METHOD_VERSION, ""),
      "类别空串", "only DESCRIPTIVE_NPP_ONLY allowed");
  });

  it("合约护栏：同根重复锚定 / 深度不自洽 / 零根 → revert", async function () {
    const rs = "0x" + MerkleCore.recordSetSha256(table);
    await anchorRoot();
    await expectRevert(
      () => anchor.anchorBatch.staticCall(tree.root, 816, 10, rs, METHOD_VERSION, DECLARATION),
      "同根重复锚定", "already anchored");
    const r2 = await anchor.verifyLeaf(tree.root, table[0].leaf, 0, tree.leafCount, tree.depth, proofOf(0));
    check(r2 === true, "拒绝重复锚定后，原锚定仍可用");
    const other = ethers.keccak256(ethers.toUtf8Bytes("another-root"));
    await expectRevert(
      () => anchor.anchorBatch.staticCall(other, 816, 3, rs, METHOD_VERSION, DECLARATION),
      "depth 与 leafCount 不自洽", "depth/leafCount mismatch");
    await expectRevert(
      () => anchor.anchorBatch.staticCall(ethers.ZeroHash, 816, 10, rs, METHOD_VERSION, DECLARATION),
      "零根", "zero root");
    await expectRevert(
      () => anchor.anchorBatch.staticCall(other, 0, 10, rs, METHOD_VERSION, DECLARATION),
      "leafCount=0", "empty leafCount");
    await expectRevert(
      () => anchor.anchorBatch.staticCall(other, 816, 10, rs, "", DECLARATION),
      "空 methodVersion", "empty methodVersion");
  });

  after(function () {
    console.log("\n  merkle_batch 测试计数：" + pass + " passed / " + fail + " failed");
    expect(fail, "存在失败断言").to.equal(0);
  });
});
