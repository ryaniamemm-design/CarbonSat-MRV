"use strict";
                                                                                        
const fs=require("fs"),path=require("path"),assert=require("assert/strict");
const {execFileSync}=require("child_process");
const ethers=require("ethers"),core=require("../web/e2e_core.js");
const root=path.resolve(__dirname,".."),out=path.join(root,"audit/one_record_anchor");
async function main(){
 const report=JSON.parse(fs.readFileSync(path.join(out,"sepolia_anchor_result.json"),"utf8"));
 const artifact=JSON.parse(fs.readFileSync(path.join(root,"artifacts/contracts/EvidenceAnchor.sol/EvidenceAnchor.json"),"utf8"));
 const source=JSON.parse(fs.readFileSync(path.join(root,"evidence/npp_evidence_records.json"),"utf8"));
 const rec=source.records.find(r=>r.recordId===report.recordId);
 assert(rec,"source record missing");
 assert.equal(rec.claimClass,"DESCRIPTIVE_NPP_ONLY");
 const expected=core.buildPackage({...rec,declarationCategory:rec.claimClass});
 assert.equal(expected.packHash,report.packHash,"report hash differs from current local evidence");
 const py=path.join(root,".venv-ee/Scripts/python.exe");
 const binding=JSON.parse(execFileSync(py,[path.join(__dirname,"verify_record_source_binding.py"),"--record",rec.recordId],{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
 assert.equal(binding.ok,true,"current local sources failed verification");
 assert.equal(binding.manifest.recomputedPackSha256,report.wholeBundlePackSha256);
 const req=new ethers.FetchRequest("https://ethereum-sepolia-rpc.publicnode.com");req.timeout=15000;
 const provider=new ethers.JsonRpcProvider(req);
 try{
  const net=await provider.getNetwork();assert.equal(Number(net.chainId),11155111);
  const [dr,rr,dt,rt,code,head]=await Promise.all([
   provider.getTransactionReceipt(report.deployTxHash),provider.getTransactionReceipt(report.registerTxHash),
   provider.getTransaction(report.deployTxHash),provider.getTransaction(report.registerTxHash),
   provider.getCode(report.contractAddress),provider.getBlockNumber()]);
  assert(dr&&rr&&dt&&rt,"receipt/transaction unavailable");
  assert.equal(dr.status,1);assert.equal(rr.status,1);
  assert.equal(dr.contractAddress.toLowerCase(),report.contractAddress.toLowerCase());
  assert.equal(dt.to,null);assert.equal(dt.data.toLowerCase(),artifact.bytecode.toLowerCase());
  assert.equal(rt.to.toLowerCase(),report.contractAddress.toLowerCase());
  const wallet="0xD1009F9Ee57EeF40C33822326Caf32Fa6C2E4b88";
  for(const tx of [dt,rt,dr,rr]) assert.equal(tx.from.toLowerCase(),wallet.toLowerCase());
  assert.equal(code.toLowerCase(),artifact.deployedBytecode.toLowerCase());
  const iface=new ethers.Interface(artifact.abi),decoded=iface.parseTransaction({data:rt.data,value:rt.value});
  assert.equal(decoded.name,"anchorEvidence");
  assert.equal(decoded.args[0],expected.packHash);assert.equal(decoded.args[1],expected.payload.methodVersion);
  assert.equal(decoded.args[2],"DESCRIPTIVE_NPP_ONLY");
  const contract=new ethers.Contract(report.contractAddress,artifact.abi,provider);
  const onchain=await contract.getAnchor(expected.packHash);
  assert.equal(onchain[0],expected.packHash);assert.equal(onchain[1],expected.payload.methodVersion);
  assert.equal(onchain[2],"DESCRIPTIVE_NPP_ONLY");assert.equal(onchain[3].toLowerCase(),wallet.toLowerCase());assert.equal(onchain[5],true);
  assert.equal(await contract.isAllowedCategory("REMOVAL"),false);
  const result={verifiedAtUTC:new Date().toISOString(),ok:true,chainId:Number(net.chainId),recordId:rec.recordId,
   contractAddress:report.contractAddress,deployTxHash:report.deployTxHash,registerTxHash:report.registerTxHash,
   deployReceipt:dr.toJSON(),registerReceipt:rr.toJSON(),headBlock:head,
   deployConfirmations:head-dr.blockNumber+1,registerConfirmations:head-rr.blockNumber+1,
   checks:{localSourceBinding:true,localPackHashMatch:true,deployCalldataMatch:true,registerCalldataMatch:true,
    runtimeBytecodeMatch:true,receiptsSuccessful:true,submitterMatch:true,readbackMatch:true,removalRejected:true},
   readback:{packHash:onchain[0],methodVersion:onchain[1],declarationCategory:onchain[2],submitter:onchain[3],timestamp:Number(onchain[4]),exists:onchain[5]},
   wholeBundlePackSha256:report.wholeBundlePackSha256,wholeBundleOnChainAnchored:false,
   transactionsSentByVerifier:0};
  fs.writeFileSync(path.join(out,"sepolia_independent_verification.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:true,chainId:result.chainId,contractAddress:result.contractAddress,
   deployStatus:dr.status,registerStatus:rr.status,registerConfirmations:result.registerConfirmations,
   runtimeBytecodeMatch:true,readbackMatch:true,transactionsSentByVerifier:0}));
 }finally{provider.destroy();}
}
if(require.main===module)main().catch(()=>{console.error("Read-only verification failed. No transaction sent; do not redeploy.");process.exitCode=1;});
