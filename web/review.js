                                                
                                                                                                    
(function () {
  "use strict";

  var state = {
    targets: null,                                       
    index: null,                                         
    currentPack: null,                                     
    selected: null,                           
    currentReview: null,                                                           
    historical: null,                               
    lastVerify: null,
  };
  window.__review = state;                      

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function fmt(v, d) { return (v == null) ? "—" : (typeof v === "number" ? v.toFixed(d == null ? 4 : d) : v); }
  function opinionLabel(code) {
    var m = (window.E2ECore && E2ECore.REVIEW_OPINION_TYPES) || {};
    return (m[code] && m[code].label) || code;
  }
  function shortHash(h) { return window.E2ECore ? window.E2ECore.shortHash(h) : h; }

                                 
  function loadJSON(url) { return fetch(url).then(function (r) { return r.json(); }); }

  Promise.all([
    loadJSON("review_targets.json"),
    loadJSON("review_index.json"),
    loadJSON("current_pack.json"),
  ]).then(function (arr) {
    state.targets = arr[0].records;
    state.index = arr[1].records;
    state.currentPack = arr[2];
    renderSelector();
    var now = new Date();
    $("ts").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0") + "T" + String(now.getHours()).padStart(2, "0") + ":" +
      String(now.getMinutes()).padStart(2, "0");
    $("btnReReview").disabled = true;
  }).catch(function (e) {
    $("selector").innerHTML = "<div class='panel bad'>加载数据失败：" + e + "</div>";
  });

                                 
  function renderSelector() {
    var box = $("selector");
    box.innerHTML = "";
    state.targets.forEach(function (rec, i) {
      var card = el("div", "card");
      var isStruct = rec.mlReview.interpretationStatus === "结构性断点待核";
      card.innerHTML =
        "<div class='rid'>验收案例 " + (i + 1) + " · " + rec.recordId + "</div>" +
        "<div class='sub'>year=" + rec.year + " · " + fmt(rec.npp, 6) + " " + rec.nppUnit + "</div>" +
        "<span class='tag " + (isStruct ? "s" : "b") + "'>" + rec.mlReview.interpretationStatus + "</span>";
      card.addEventListener("click", function () { selectRecord(rec); });
      box.appendChild(card);
    });
  }

                               
  function doSearch() {
    var q = ($("searchInput").value || "").trim().toLowerCase();
    var box = $("searchResults");
    box.innerHTML = "";
    if (!q) { box.innerHTML = "<div class='sub'>请输入检索词。</div>"; return; }
    var yearTok = null;
    var m = q.match(/(\d{4})$/);                
    if (m) { yearTok = parseInt(m[1], 10); q = q.replace(/(\d{4})$/, "").trim(); }
    var hits = state.index.filter(function (r) {
      var rid = (r.recordId || "").toLowerCase();
      var cell = (r.cellId || "").toLowerCase();
      if (yearTok != null && r.year !== yearTok) return false;
      if (!q) return true;               
      return rid.indexOf(q) >= 0 || cell.indexOf(q) >= 0;
    }).slice(0, 50);
    if (!hits.length) { box.innerHTML = "<div class='sub'>无匹配记录。</div>"; return; }
    hits.forEach(function (rec) {
      var card = el("div", "card");
      var isStruct = rec.mlReview.interpretationStatus === "结构性断点待核";
      var cls = rec.year === 2012 ? "s" : (rec.mlReview.flag === 1 ? "b" : "n");
      card.innerHTML =
        "<div class='rid'>" + rec.recordId + "</div>" +
        "<div class='sub'>year=" + rec.year + " · " + fmt(rec.npp, 6) + " " + rec.nppUnit + "</div>" +
        "<span class='tag " + cls + "'>" + rec.mlReview.interpretationStatus + "</span>";
      card.addEventListener("click", function () { selectRecord(rec); });
      box.appendChild(card);
    });
    var more = state.index.filter(function (r) {
      if (yearTok != null && r.year !== yearTok) return false;
      if (!q) return true;
      return ((r.recordId || "").toLowerCase().indexOf(q) >= 0 || (r.cellId || "").toLowerCase().indexOf(q) >= 0);
    }).length;
    if (more > hits.length) {
      box.appendChild(el("div", "sub", "（仅显示前 50 条，共 " + more + " 条匹配）"));
    }
  }
  $("btnSearch").addEventListener("click", doSearch);
  $("searchInput").addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });

                               
  function selectRecord(rec) {
    state.selected = rec;
    state.currentReview = null;
    state.historical = null;
    var cards = document.querySelectorAll("#selector .card, #searchResults .card");
    cards.forEach(function (c) { c.classList.remove("sel"); });
    renderDetail(rec);
    $("reviewHashBox").textContent = "";
    $("versionStatus").innerHTML = "";
    $("historicalPanel").innerHTML = "";
    $("btnReReview").disabled = true;
    $("out").textContent = "（已选择 " + rec.recordId + "，请填写审查意见后点击「生成审查记录」）";
  }

  function contextFromTarget(rec) {
    return {
      recordId: rec.recordId, cellId: rec.cellId, year: rec.year, lon: rec.lon, lat: rec.lat,
      npp: rec.npp, nppUnit: rec.nppUnit, prevNpp: rec.prevNpp, jump: rec.jump,
      rulePrescreen: rec.rulePrescreen, mlReview: rec.mlReview,
      sourceHash: rec.sourceHash, evidenceRef: rec.evidenceRef,
      modelVersion: rec.modelVersion, declarationCategory: rec.declarationCategory,
      attributionStatus: rec.attributionStatus, knownLimitations: rec.knownLimitations,
      wholeBundlePackSha256: rec.wholeBundlePackSha256,               
    };
  }

  function renderDetail(rec) {
    var ml = rec.mlReview, rp = rec.rulePrescreen;
    var h = "";
    h += "<div class='kv'>";
    h += "<b>记录</b><span>" + rec.recordId + "（" + rec.cellId + " · " + rec.year + "）</span>";
    h += "<b>坐标</b><span>" + fmt(rec.lon, 5) + ", " + fmt(rec.lat, 5) + "</span>";
    h += "<b>原始 NPP</b><span>" + fmt(rec.npp, 6) + " " + rec.nppUnit + "</span>";
    h += "<b>前一年值</b><span>" + fmt(rec.prevNpp, 6) + "</span>";
    h += "<b>跳变 (Δ)</b><span>" + fmt(rec.jump, 6) + "</span>";
    h += "</div>";

    h += "<div class='kv' style='margin-top:8px'>";
    h += "<b>规则预审</b><span>method=" + (rp.method || "—") + "；score=" + fmt(rp.score, 3) + "；flag=" + rp.flag +
         "；reasons=" + (rp.reasons && rp.reasons.length ? rp.reasons.join("; ") : "（空）") + "</span>";
    h += "<b>ML 结果</b><span>method=" + (ml.method || "—") + "；score(decision_function)=" + fmt(ml.score, 5) +
         "；flag=" + ml.flag + "；eraFlag=" + ml.eraFlag + "；解释状态=" + ml.interpretationStatus + "</span>";
    h += "<b>模型版本</b><span>" + (ml.modelVersion || "—") + "（feature=" + (ml.featureVersion || "—") + "）</span>";
    h += "<b>训练集哈希</b><span class='hash'>" + (ml.trainingCsvSha256 || "—") + "</span>";
    h += "<b>来源锚点 sourceHash</b><span class='hash'>" + rec.sourceHash + "</span>";
    h += "<b>来源锚点 evidenceRef</b><span class='hash'>" + rec.evidenceRef + "</span>";
    h += "<b>声明类别 / 归因</b><span>" + rec.declarationCategory + " / " + rec.attributionStatus + "</span>";
    h += "<b>绑定整包哈希</b><span class='hash'>" + (rec.wholeBundlePackSha256 || "（无）") + "</span>";
    h += "</div>";

    h += "<div class='lim'><b>适用限制：</b><ul style='margin:4px 0 0;padding-left:18px'>";
    (rec.knownLimitations || []).forEach(function (t) { h += "<li>" + t + "</li>"; });
    h += "</ul></div>";
    $("detail").innerHTML = h;
  }

                                 
  function buildReview() {
    if (!state.selected) { alert("请先选择一条证据记录"); return null; }
    var code = (document.querySelector('input[name=opinion]:checked') || {}).value;
    if (!code) { alert("请选择一种审查意见"); return null; }
    var ctx = contextFromTarget(state.selected);
    var review = {
      opinionCode: code,
      basis: $("basis").value,
      reviewer: $("reviewer").value,
      timestamp: $("ts").value ? new Date($("ts").value).toISOString() : new Date().toISOString(),
    };
    var rec = E2ECore.buildReviewRecord(ctx, review);
    state.currentReview = rec;
    state.historical = null;
    $("reviewHashBox").innerHTML = "<b>reviewHash (keccak256)：</b><br>" + rec.reviewHash;
    renderVersionStatus(rec);
    $("historicalPanel").innerHTML = "";
    $("btnReReview").disabled = true;
    $("out").innerHTML = "<span class='ok'>已生成审查记录（绑定 evidenceRef / 模型版本 / 整包哈希）</span>\n" +
      "opinion=" + rec.review.opinion + "（" + rec.review.opinionLabel + "）\n" +
      "reviewer=" + (rec.review.reviewer || "（未填）") + "\n" +
      "timestamp=" + rec.review.timestamp + "\n" +
      "evidenceContext.attributionStatus=" + rec.evidenceContext.attributionStatus + "\n" +
      "bound wholeBundlePackSha256=" + shortHash(rec.evidenceContext.wholeBundlePackSha256) + "\n" +
      "（点击「本地核验」重算哈希；「下载审查记录」导出 JSON）";
    return rec;
  }

                                             
  function currentPackOverride() {
    var v = ($("simPack").value || "").trim();
    if (!v) return null;
    return { wholeBundlePackSha256: v };                 
  }

  function renderVersionStatus(rec) {
    if (!rec || !rec.evidenceContext) { $("versionStatus").innerHTML = ""; return; }
    var ov = currentPackOverride();
    var current = Object.assign({}, state.currentPack, ov || {});
    var vs = E2ECore.reviewVersionStatus(rec, current);
    var box = $("versionStatus");
    if (!vs.stale) {
      box.innerHTML = "<div class='fresh'>✓ 版本一致：本审查意见所依据的证据包（" +
        shortHash(rec.evidenceContext.wholeBundlePackSha256) + "）与当前证据包（" +
        shortHash(current.wholeBundlePackSha256) + "）相同，可参考。</div>";
    } else {
      box.innerHTML = "<div class='stale'>⚠️ <b>版本过期</b>：本审查意见所依据的版本已不是当前证据包，<b>结论不得静默套用到当前证据</b>。<ul style='margin:4px 0 0;padding-left:18px'>" +
        vs.reasons.map(function (r) { return "<li>" + r + "</li>"; }).join("") +
        "</ul>如须采用，请点击「基于当前证据重新复核」生成绑定当前包的新意见。</div>";
    }
  }
  $("simPack").addEventListener("input", function () {
    if (state.currentReview) renderVersionStatus(state.currentReview);
    if (state.historical) renderHistorical(state.historical);
  });

                               
  function verifyClean() {
    if (!state.currentReview) { $("out").textContent = "请先生成审查记录"; return; }
    var r = E2ECore.verifyReviewRecord(state.currentReview);
    state.lastVerify = r;
    $("out").innerHTML = (r.ok ? "<span class='ok'>[本地核验通过]</span> " : "<span class='bad'>[本地核验失败]</span> ") +
      r.reason + "\nrecomputed=" + r.recomputed + "\nstored    =" + r.stored;
  }

                               
  function tamperDemo() {
    if (!state.currentReview) { $("out").textContent = "请先生成审查记录"; return; }
    var clone = JSON.parse(JSON.stringify(state.currentReview));
    var others = ["DATA_ISSUE_PENDING", "INSUFFICIENT_EVIDENCE", "VERIFIED_NO_ATTRIBUTION"];
    var next = others.filter(function (c) { return c !== clone.review.opinion; })[0];
    clone.review.opinion = next;
    clone.review.opinionLabel = opinionLabel(next);
    var r = E2ECore.verifyReviewRecord(clone);
    var orig = E2ECore.verifyReviewRecord(state.currentReview);
    $("out").innerHTML =
      "<span class='ok'>[原记录]</span> " + (orig.ok ? "核验通过" : "核验失败") + "\n" +
      "<span class='bad'>[篡改副本]</span> 已将 opinion 改为 " + next + " → " + (r.ok ? "仍通过（异常！）" : "核验失败（符合预期）") + "\n" +
      "reason=" + r.reason + "\nrecomputed=" + r.recomputed + "\nstored    =" + r.stored;
  }

                             
  function download() {
    if (!state.currentReview) { alert("请先生成审查记录"); return; }
    var blob = new Blob([JSON.stringify(state.currentReview, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = state.currentReview.evidenceContext.recordId + ".human-review.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

                                                
  function loadReviewText(text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { $("historicalPanel").innerHTML = "<div class='stale'>JSON 解析失败：" + e + "</div>"; return; }
    var v = E2ECore.verifyReviewRecord(parsed);
    state.historical = parsed;
    if (!v.ok) {
      $("historicalPanel").innerHTML = "<div class='stale'>⚠️ 完整性校验失败：该审查记录（证据上下文或人工意见）已被改动，<b>不可使用</b>。<br>reason=" + v.reason + "</div>";
      $("btnReReview").disabled = true;
      return;
    }
    renderHistorical(parsed);
    $("btnReReview").disabled = false;
  }

  function renderHistorical(rec) {
    var ov = currentPackOverride();
    var current = Object.assign({}, state.currentPack, ov || {});
    var vs = E2ECore.reviewVersionStatus(rec, current);
    var p = $("historicalPanel");
    var html = "<div class='kv'><b>历史意见</b><span>" + (rec.review.opinionLabel || rec.review.opinion) + "</span>" +
      "<b>依据</b><span>" + (rec.review.basis || "（无）") + "</span>" +
      "<b>审查人 / 时间</b><span>" + (rec.review.reviewer || "（未填）") + " · " + rec.review.timestamp + "</span>" +
      "<b>绑定整包哈希</b><span class='hash'>" + (rec.evidenceContext.wholeBundlePackSha256 || "（无）") + "</span>" +
      "<b>绑定 evidenceRef</b><span class='hash'>" + (rec.evidenceContext.evidenceRef || "（无）") + "</span></div>";
    if (!vs.stale) {
      html += "<div class='fresh'>✓ 版本一致：该意见依据的证据包与当前相同，可参考（仍建议基于当前证据重新复核）。</div>";
    } else {
      html += "<div class='stale'>⚠️ <b>版本过期</b>：该意见依据的证据包已不是当前版本，<b>结论不得静默套用到当前证据</b>。<ul style='margin:4px 0 0;padding-left:18px'>" +
        vs.reasons.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul></div>";
    }
    p.innerHTML = html;
  }

  $("fileLoad").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { loadReviewText(rd.result); };
    rd.readAsText(f);
  });

                                                  
  $("btnReReview").addEventListener("click", function () {
    state.historical = null;
    $("historicalPanel").innerHTML = "";
    $("btnReReview").disabled = true;
    if (state.selected) {
      $("out").textContent = "已清空历史意见。请基于当前证据（" + shortHash(state.currentPack.wholeBundlePackSha256) +
        "）重新选择审查意见并生成新记录。";
    }
  });

                       
  window.__review.selectByRecordId = function (id) {
    var rec = state.index.find(function (r) { return r.recordId === id; }) ||
              state.targets.find(function (r) { return r.recordId === id; });
    if (!rec) { alert("未找到 " + id); return false; }
    selectRecord(rec); return true;
  };
  window.__review.buildWith = function (code, basis, reviewer) {
    var radio = document.querySelector('input[name=opinion][value="' + code + '"]');
    if (radio) radio.click();
    $("basis").value = basis || "自动驱动测试依据";
    $("reviewer").value = reviewer || "auto-driver";
    return buildReview();
  };
  window.__review.loadReviewText = loadReviewText;
  window.__review.setSimPack = function (h) { $("simPack").value = h || ""; if (state.currentReview) renderVersionStatus(state.currentReview); if (state.historical) renderHistorical(state.historical); };
  window.__review.getVersionStatusText = function () { return $("versionStatus").innerText + " || " + $("historicalPanel").innerText; };

  $("btnBuild").addEventListener("click", buildReview);
  $("btnVerify").addEventListener("click", verifyClean);
  $("btnTamper").addEventListener("click", tamperDemo);
  $("btnDownload").addEventListener("click", download);
})();
