(function () {
  'use strict';
  const C=window.ParcelCore, $=id=>document.getElementById(id);
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  const KEY='CarbonSat-ParcelIntake-v1.0';
  let record=C.blankRecord(today()), geometryError='', busy=0, currentPackage=null, importedPackage=null, generation=0, attachmentEpoch=0;
  const checkedAttachments=new Map();
  const binding={parcelId:['parcel','parcelId'],parcelName:['parcel','name'],administrativeArea:['parcel','administrativeArea'],projectOwner:['parcel','projectOwner'],crs:['boundary','crs'],startDate:['commencement','startDate'],activityType:['activity','type'],measures:['activity','measures'],species:['activity','species'],density:['activity','density'],landOwner:['ownership','landOwner'],treeOwner:['ownership','treeOwner'],reductionRightHolder:['ownership','reductionRightHolder'],transferStatus:['ownership','transferStatus'],validityEnd:['ownership','validityEnd'],windowStart:['preProjectLand','windowStart'],windowEnd:['preProjectLand','windowEnd']};
  const sourceFields={referenceId:'来源编号',title:'文件名称',issuer:'出具单位',issuedOn:'出具日期',documentNumber:'文件编号（可无）',locator:'页码 / 表号 / 路径定位',attachmentId:'关联附件'};
  function node(tag,text,cls) {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function clearAttachmentResult(){attachmentEpoch++;$('attachmentCheckResult').textContent='';}
  function markSources(){
    document.querySelectorAll('[data-source-group]').forEach(card=>{
      const g=card.dataset.sourceGroup,index=Number(card.dataset.index),refs=record.evidence[g].references;
      const ref=refs[index],input=card.querySelector('[data-ref-field="referenceId"]');
      const bad=!ref.referenceId.replace(/[\u200b-\u200d\u2060\ufeff]/g,'').trim()||refs.filter(r=>r.referenceId===ref.referenceId).length>1;
      card.className=bad?'source source-invalid':'source';input.setAttribute('aria-invalid',String(bad));
      if(bad)document.querySelector('details[data-group="'+g+'"]').open=true;
    });
  }
  function refsUI() {
    const parent=$('evidenceCards');parent.replaceChildren();
    C.GROUPS.forEach(g=>{
      const e=record.evidence[g], d=node('details');d.dataset.group=g;
      d.append(node('summary',C.LABELS[g]));const inside=node('div',undefined,'inside');
      const label=node('label','资料状态'), select=node('select');select.dataset.statusGroup=g;
      [['NOT_PROVIDED','未提供'],['PARTIAL','已提供部分'],['PROVIDED','已提供，内容待核'],['NOT_APPLICABLE','申报不适用，理由须审阅']].forEach(([v,t])=>{const o=node('option',t);o.value=v;select.append(o);});
      select.value=e.status;label.append(select);inside.append(label);
      const reasonLabel=node('label','缺项 / 不适用理由'), reason=node('textarea');reason.dataset.reasonGroup=g;reason.value=e.reason;reasonLabel.append(reason);inside.append(reasonLabel);
      e.references.forEach((ref,index)=>{
        const card=node('div',undefined,'source');card.dataset.sourceGroup=g;card.dataset.index=String(index);
        const h=node('div',undefined,'sourcehead');h.append(node('span','来源 '+(index+1)));const remove=node('button','移除此来源');remove.type='button';
        remove.addEventListener('click',()=>{if(!sync())return;record.evidence[g].references.splice(index,1);refsUI();edited();});h.append(remove);card.append(h);
        const grid=node('div',undefined,'grid');Object.entries(sourceFields).forEach(([k,title])=>{
          const l=node('label',title);let input;
          if(k==='attachmentId') {
            input=node('select');const empty=node('option','无附件，仅登记出处');empty.value='';input.append(empty);
            record.attachments.forEach(a=>{const o=node('option',a.fileName);o.value=a.attachmentId;input.append(o);});
          } else {input=node('input');input.type=k==='issuedOn'?'date':'text';input.maxLength=5000;}
          input.dataset.refField=k;input.value=ref[k];l.append(input);grid.append(l);
        });card.append(grid);inside.append(card);
      });
      const add=node('button','添加来源');add.type='button';add.addEventListener('click',()=>{
        if(!sync())return;const ids=new Set(record.evidence[g].references.map(r=>r.referenceId));let i=1;while(ids.has(g+'-ref-'+i))i++;
        record.evidence[g].references.push({referenceId:g+'-ref-'+i,title:'',issuer:'',issuedOn:'',documentNumber:'',locator:'',attachmentId:''});refsUI();
        document.querySelector('details[data-group="'+g+'"]').open=true;edited();
      });inside.append(add);d.append(inside);parent.append(d);
    });
  }
  function load(r) {
    const v=C.validateRecord(r);if(!v.ok)throw new Error(v.errors.join('；'));
    generation++;record=JSON.parse(JSON.stringify(r));geometryError='';currentPackage=null;checkedAttachments.clear();
    Object.entries(binding).forEach(([id,[parent,key]])=>{$(id).value=record[parent][key];});
    $('asOfDate').value=record.asOfDate;$('phased').checked=record.commencement.phased;
    $('batches').value=JSON.stringify(record.commencement.batches,null,2);$('components').value=record.activity.components.join('\n');$('notes').value=record.notes;
    $('modeBadge').textContent=record.mode==='SYNTHETIC'?'SYNTHETIC · 软件演示，非项目事实':'真实资料登记 · 内容仍待核';
    $('geometrySummary').textContent=record.boundary.geometry?'已登记 '+record.boundary.geometry.type+'；实际边界、拓扑和坐标系仍待专业核查。':'尚无边界。采样方框不能替代真实项目地块。';
    refsUI();refreshAttachments();update();
  }
  function sync() {
    Object.entries(binding).forEach(([id,[parent,key]])=>{record[parent][key]=$(id).value;});
    record.asOfDate=$('asOfDate').value;record.commencement.phased=$('phased').checked;
    record.activity.components=$('components').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);record.notes=$('notes').value;
    C.GROUPS.forEach(g=>{
      record.evidence[g].status=document.querySelector('[data-status-group="'+g+'"]').value;
      record.evidence[g].reason=document.querySelector('[data-reason-group="'+g+'"]').value;
    });
    document.querySelectorAll('[data-source-group]').forEach(card=>{
      const ref=record.evidence[card.dataset.sourceGroup].references[Number(card.dataset.index)];
      card.querySelectorAll('[data-ref-field]').forEach(input=>{ref[input.dataset.refField]=input.value;});
    });
    try {record.commencement.batches=JSON.parse($('batches').value);return true;}
    catch(e){showInvalid('批次清单须为合法 JSON 数组');return false;}
  }
  function showInvalid(message) {
    markSources();$('contentWarnings').replaceChildren();
    currentPackage=null;$('validationErrors').textContent=message;$('btnDownload').disabled=true;
    $('verdict').className='notice bad';$('verdict').textContent='输入有误，不能生成核验包';$('groupCount').textContent='— / 5';
    $('groupStates').replaceChildren();$('tasks').replaceChildren();$('hashDetails').textContent='输入未通过，不生成摘要。';
  }
  function update() {
    if(!sync())return;
    if(geometryError){showInvalid(geometryError);return;}
    try {
      const a=C.evaluate(record);currentPackage=C.buildPackage(record,new Date().toISOString());
      markSources();const warnings=C.placeholderWarnings(record);$('contentWarnings').replaceChildren();warnings.forEach(w=>$('contentWarnings').append(node('li',w.message)));
      $('validationErrors').textContent='';$('groupCount').textContent=a.registeredGroups+' / 5';$('btnDownload').disabled=busy>0;
      $('verdict').className=a.canProceedToDocumentReview?'notice good':'notice';
      $('verdict').textContent=a.canProceedToDocumentReview?'资料登记齐备，可开始文件内容审阅；资格仍未评估':'资料不足，请补齐下列信息；不作肯定资格判断';
      if(warnings.length){$('verdict').className='notice';$('verdict').textContent+=(a.canProceedToDocumentReview?'；存在占位文字，请先补实质内容':'；另有占位文字需补充');}
      if(record.mode==='SYNTHETIC')$('verdict').textContent='SYNTHETIC 演示 · '+$('verdict').textContent;
      $('groupStates').replaceChildren();a.groups.forEach(g=>{const line=node('div',undefined,'statusline');line.append(node('span',g.label),node('span',g.state==='REGISTERED_PENDING_REVIEW'?'已登记 · 待审阅':g.state==='NOT_APPLICABLE_PENDING'?'不适用 · 待核':'缺项'));$('groupStates').append(line);});
      $('tasks').replaceChildren();a.tasks.forEach(t=>$('tasks').append(node('li',t.message)));
      if(!a.tasks.length)$('tasks').append(node('li','请专业人员核查内容真实性、权属与适用条件；资料齐备不等于审查通过。'));
      $('professionalChecks').replaceChildren();a.professionalChecks.forEach(t=>$('professionalChecks').append(node('li',t)));
      $('hashDetails').textContent='记录摘要：'+currentPackage.recordSha256+'\n包摘要：'+currentPackage.packageSha256+'\n\n'+C.SCOPE;
    }catch(e){showInvalid(e.message);}
  }
  function refreshAttachments() {
    clearAttachmentResult();
    $('attachmentList').replaceChildren();$('attachmentToCheck').replaceChildren();
    const empty=node('option','请选择已登记附件');empty.value='';$('attachmentToCheck').append(empty);
    record.attachments.forEach(a=>{
      const status=checkedAttachments.has(a.attachmentId)?'本次字节已匹配（内容真伪待核）':'未读取附件原件';
      const li=node('li',a.fileName+' · '+a.byteLength+' B · '+status+' · SHA256 '+a.sha256);
      const remove=node('button','移除');remove.type='button';remove.addEventListener('click',()=>{
        if(!sync())return;record.attachments=record.attachments.filter(x=>x.attachmentId!==a.attachmentId);
        C.GROUPS.forEach(g=>record.evidence[g].references.forEach(ref=>{if(ref.attachmentId===a.attachmentId)ref.attachmentId='';}));
        checkedAttachments.delete(a.attachmentId);refsUI();refreshAttachments();edited();
      });li.append(document.createTextNode(' '),remove);$('attachmentList').append(li);
      const o=node('option',a.fileName);o.value=a.attachmentId;$('attachmentToCheck').append(o);
    });
  }
  async function readFile(file,limit) {if(!file)throw new Error('请选择文件');if(file.size>limit)throw new Error('文件超过大小限制');return new Uint8Array(await file.arrayBuffer());}
  async function registerAttachment(file) {
    const started=generation;const bytes=await readFile(file,25*1024*1024);
    if(started!==generation)throw new Error('当前地块已切换，拒绝把旧附件写入新登记');
    if(record.attachments.length>=50)throw new Error('最多登记 50 个附件');
    const ids=new Set(record.attachments.map(a=>a.attachmentId));let n=1;while(ids.has('attachment-'+n))n++;
    const a={attachmentId:'attachment-'+n,fileName:file.name,byteLength:bytes.length,sha256:C.attachmentDigest(bytes)};
    record.attachments.push(a);checkedAttachments.set(a.attachmentId,a.sha256);return a;
  }
  $('intakeForm').addEventListener('submit',e=>e.preventDefault());
  const edited=()=>{clearAttachmentResult();importedPackage=null;$('packageVerdict').className='small';$('packageVerdict').textContent='登记内容已变化，请重新核验或下载。';update();};
  $('intakeForm').addEventListener('input',e=>{if(e.target.type!=='file')edited();});
  $('intakeForm').addEventListener('change',e=>{if(e.target.type!=='file')edited();});
  $('btnBlank').addEventListener('click',()=>{importedPackage=null;load(C.blankRecord(today()));$('packageVerdict').textContent='已新建空白登记；尚无真实地块资料。';});
  $('btnDemo').addEventListener('click',()=>{
    const r=C.syntheticRecord(today()),kind=$('demoCase').value;
    if(kind==='missing')r.evidence.preProjectLand={status:'NOT_PROVIDED',references:[],reason:'合成反例：缺治理前资料'};
    if(kind==='na')r.evidence.ownership.status='NOT_APPLICABLE';
    if(kind==='mixed')r.activity.type='MIXED';
    importedPackage=null;load(r);$('packageVerdict').textContent='合成资料仅用于演示软件；不代表真实地块。';
  });
  $('btnClearGeometry').addEventListener('click',()=>{record.boundary.geometry=null;geometryError='';$('geometryFile').value='';$('geometrySummary').textContent='尚无边界。';edited();});
  $('geometryFile').addEventListener('change',async()=>{
    const started=generation;
    busy++;$('btnDownload').disabled=true;
    try {
      if(!sync())throw new Error('先修正批次 JSON');const f=$('geometryFile').files[0];const bytes=await readFile(f,1500000);
      const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));const geometry=C.normalizeGeoJSON(parsed);
      if(started!==generation)throw new Error('当前地块已切换，拒绝导入旧边界');
      record.boundary.geometry=geometry;geometryError='';
      await registerAttachment(f);refsUI();refreshAttachments();$('geometrySummary').textContent='已读取 '+f.name+' · '+geometry.type+'；坐标系须明确确认，拓扑与项目事实仍待核。';
    }catch(e){geometryError='边界文件未通过：'+e.message;$('geometrySummary').textContent=geometryError;}
    finally{busy--;edited();}
  });
  $('attachmentFiles').addEventListener('change',async()=>{
    busy++;$('btnDownload').disabled=true;
    try {if(!sync())throw new Error('先修正批次 JSON');for(const file of $('attachmentFiles').files)await registerAttachment(file);$('attachmentProgress').textContent='已在本机读取原始字节并登记摘要；不鉴定文书真伪。';}
    catch(e){$('attachmentProgress').textContent='附件登记未全部完成：'+e.message;}
    finally{busy--;refsUI();refreshAttachments();edited();$('attachmentFiles').value='';}
  });
  function getPackage() {update();if(!currentPackage||busy)throw new Error('输入有误或附件仍在读取');return C.buildPackage(record,new Date().toISOString());}
  function showVerify(pkg) {
    const pin=$('expectedRecordSha').value.trim();const res=C.verifyPackage(pkg,pin||undefined);
    $('packageVerdict').className=res.ok?'notice good':'notice bad';
    $('packageVerdict').textContent=res.ok?(pin?'内部核验通过，且与外部期望记录摘要一致；来源真实性仍未验证。':'内部核验通过；未提供外部可信摘要，不能证明包未被整体替换。'):'核验失败：'+res.errors.join('；');
    if(res.ok&&res.warnings.some(w=>w.includes('占位文字'))){$('packageVerdict').className='notice';$('packageVerdict').textContent+=' 检出占位文字；内容需补充，内部核验不代表资料有效。';}
    return res;
  }
  $('btnDownload').addEventListener('click',()=>{
    try {const pkg=getPackage();const blob=new Blob([JSON.stringify(pkg,null,2)+'\n'],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=node('a');
      a.href=url;a.download=(record.parcel.parcelId.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)||'parcel')+'.parcel-review.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);currentPackage=pkg;showVerify(pkg);
    }catch(e){$('packageVerdict').textContent=e.message;}
  });
  $('btnSave').addEventListener('click',()=>{try{const pkg=getPackage();localStorage.setItem(KEY,JSON.stringify(pkg));$('packageVerdict').textContent='已保存到当前浏览器本机存储；不上传、不保存附件原件。';}catch(e){$('packageVerdict').textContent='未保存：'+e.message;}});
  $('btnRestore').addEventListener('click',()=>{try{const raw=localStorage.getItem(KEY);if(!raw)throw new Error('没有本机草稿');const pkg=JSON.parse(raw);if(!showVerify(pkg).ok)throw new Error('本机草稿核验失败，保留当前表单');load(pkg.record);importedPackage=pkg;showVerify(pkg);}catch(e){$('packageVerdict').textContent=e.message;}});
  $('btnForget').addEventListener('click',()=>{localStorage.removeItem(KEY);$('packageVerdict').textContent='已删除此模块的本机草稿，未删除磁盘文件。';});
  $('packageFile').addEventListener('change',async()=>{
    try {if(busy)throw new Error('请等待附件读取完成');const bytes=await readFile($('packageFile').files[0],2500000);const pkg=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(!showVerify(pkg).ok)return;load(pkg.record);importedPackage=pkg;showVerify(pkg);$('attachmentCheckResult').textContent='导入包仅登记附件摘要；尚未读取原件。';
    }catch(e){$('packageVerdict').className='notice bad';$('packageVerdict').textContent='导入失败：'+e.message;}
    finally{$('packageFile').value='';}                                                             
  });
  $('btnVerifyCurrent').addEventListener('click',()=>{try{showVerify(getPackage());}catch(e){$('packageVerdict').className='notice bad';$('packageVerdict').textContent='当前登记未通过：'+e.message;}});
  $('btnCheckAttachment').addEventListener('click',async()=>{
    clearAttachmentResult();const started=attachmentEpoch;
    try {const meta=record.attachments.find(a=>a.attachmentId===$('attachmentToCheck').value);if(!meta)throw new Error('请选择要核对的登记附件');const bytes=await readFile($('attachmentCheckFile').files[0],25*1024*1024);
      if(started!==attachmentEpoch)return;                                                                     
      const result=C.verifyAttachment(bytes,meta);
      if(result.ok)checkedAttachments.set(meta.attachmentId,meta.sha256);else checkedAttachments.delete(meta.attachmentId);
      refreshAttachments();$('attachmentToCheck').value=meta.attachmentId;
      $('attachmentCheckResult').textContent=result.ok?'附件字节与登记摘要一致；文书内容真实性仍未验证。':'核验失败：附件字节或长度与登记值不一致。';
    }catch(e){if(started===attachmentEpoch)$('attachmentCheckResult').textContent='未核验：'+e.message;}
  });
  $('attachmentToCheck').addEventListener('change',clearAttachmentResult);
  $('attachmentCheckFile').addEventListener('change',clearAttachmentResult);
                                                                                      
  window.__parcelIntake={getRecord:()=>JSON.parse(JSON.stringify(record)),getPackage,getImportedPackage:()=>importedPackage,getBusy:()=>busy};
  load(record);
})();
