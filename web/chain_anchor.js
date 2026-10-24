                                      
  
                      
                                                          
                                        
                                                                                 
                                                                
                                    
                                                 
               
                                                                
                                         
"use strict";

(function () {
  var CFG_URL = "chain_anchor_config.json";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function mono(s) { return '<span class="mono">' + esc(s) + "</span>"; }
  function link(url, text) {
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + "</a>";
  }

  function renderBlock(cfg) {
    var b = cfg.boundary || {};
    var rows =
      '<div class="kv"><div class="k">网络 / chainId</div><div class="v">' +
        esc(String(cfg.network).toUpperCase()) + " · " + esc(cfg.chainId) +
        ' <span class="badge b-info">公共测试网</span></div></div>' +
      '<div class="kv"><div class="k">EvidenceAnchor 合约地址（可公开查询）</div>' +
        '<div class="v mono">' + esc(cfg.contractAddress) + "</div>" +
        "<div class=\"k\">" + link(cfg.links.contract, "Sepolia Etherscan · 合约") + "</div></div>" +
      '<div class="kv"><div class="k">部署交易（区块 ' + esc(cfg.deployBlock) + "）</div>" +
        '<div class="v mono dim">' + esc(cfg.deployTxHash) + "</div>" +
        "<div class=\"k\">" + link(cfg.links.deployTx, "Sepolia Etherscan · 部署交易") + "</div></div>" +
      '<div class="kv"><div class="k">登记交易（区块 ' + esc(cfg.registerBlock) + "）</div>" +
        '<div class="v mono dim">' + esc(cfg.registerTxHash) + "</div>" +
        "<div class=\"k\">" + link(cfg.links.registerTx, "Sepolia Etherscan · 登记交易") + "</div></div>" +
      '<div class="kv"><div class="k">链上登记内容（<b>仅单条</b>：' + esc(cfg.recordId) + "）</div>" +
        '<div class="v mono">' + esc(cfg.packHash) + "</div>" +
        '<div class="k">methodVersion = ' + mono(cfg.methodVersion) +
          " · declarationCategory = <b>" + esc(cfg.declarationCategory) + "</b></div></div>" +
      '<div class="kv"><div class="k">提交者（公开地址）</div><div class="v mono">' +
        esc(cfg.submitter) + "</div></div>" +
      '<div class="kv"><div class="k">独立只读核验</div><div class="v" style="font-weight:400;font-size:11px">' +
        "ok=true · 核验脚本发送交易数=<b>0</b> · 核验时间 " + esc(cfg.verifiedAtUTC) +
        " · 报告 " + mono(cfg.verificationReport) + "</div></div>" +
      '<div class="kv"><div class="k" style="color:#34613f">边界（勿混淆）</div>' +
        '<div class="v" style="font-weight:400;font-size:11px;line-height:1.55">' +
        esc(b.statement) +
        "<br/><b>链上仅锚定字段</b>：" + esc((b.onChainAnchoredFields || []).join(" / ")) +
        "<br/><b>整包已上链</b>=" + esc(b.wholeBundleOnChainAnchored) +
        " · <b>A2 已上链</b>=" + esc(b.a2StreamOnChainAnchored) +
        " · <b>源文件核验已上链</b>=" + esc(b.sourceFileVerificationOnChainAnchored) +
        " · <b>IPFS</b>=" + esc(b.ipfsUsed) +
        "<br/><b>归因</b>=" + esc(b.attributionStatus) +
        " · 主张 9 条全 REVIEW · REMOVAL=" + esc(b.removal) +
        " · 816↔9 链接数=" + esc(b.linksEstablished) + "</div></div>" +
      '<div class="kv"><div class="k">历史阶段说明</div>' +
        '<div class="v" style="font-weight:400;font-size:10.5px;line-height:1.5;color:#667">' +
        esc(cfg.localStageNote) + "</div></div>";

    return '<div class="config" id="pubChainCard">' +
      '<div class="ct">公共链上存证（已发生 · 只读展示）</div>' +
      '<div class="k" style="margin-bottom:6px">' +
        "当前阶段：<b>仅单条描述性证据（" + esc(cfg.recordId) + "）已在 Sepolia 登记</b>。" +
        "本机不再部署、不再登记，不读取私钥；本轮只做链上读回核验。" +
      "</div>" + rows + "</div>";
  }

  function init() {
    fetch(CFG_URL)
      .then(function (r) {
        if (r.ok === false) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (cfg) {
        window.__chainAnchorConfig = cfg;

                                           
        var addr = document.getElementById("cfgAddr");
        if (addr && !addr.value) addr.value = cfg.contractAddress;
        var rpc = document.getElementById("cfgRpc");
        if (rpc && !rpc.value) rpc.value = cfg.rpc.verifiedReadbackRpcUrl;

        var st = document.getElementById("cfgSt");
        if (st) {
          st.className = "chainst ok";
          st.textContent = "已预填 Sepolia 合约地址（公共链已独立核验，只读）";
        }

                           
        var host = document.getElementById("pubChain");
        if (host) host.innerHTML = renderBlock(cfg);

                                  
        var tip = document.getElementById("pubChainTip");
        if (tip) {
          tip.textContent = "提示：选中 " + cfg.recordId +
            " 后，点『① 生成可下载证据包』再点『⑥ 从链上读回核验（只读 RPC）』即可复现公共读回；" +
            "本轮不要点『⑤ 在测试网登记』。";
        }
      })
      .catch(function (e) {
                       
        var st = document.getElementById("cfgSt");
        if (st) {
          st.className = "chainst bad";
          st.textContent = "未取得公共链上存证配置（不回填、不推断）";
        }
        var host = document.getElementById("pubChain");
        if (host) {
          host.innerHTML = '<div class="config"><div class="ct">公共链上存证</div>' +
            '<div class="k" style="color:#b03030">未取得 chain_anchor_config.json：' +
            esc(String((e && e.message) || e)) +
            "。地址与链接一律不显示，避免用手工转录值代替可核验来源。</div></div>";
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
