                                                                                     
                                                                                 
   
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const crypto = require('crypto');
    module.exports = factory(bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
  } else {
    root.ParcelCore = factory(bytes => root.ethers.sha256(bytes).slice(2));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sha256Bytes) {
  'use strict';
  const SCHEMA = 'CarbonSat-ParcelEvidence-v1.0';
  const PROTOCOL = 'CarbonSat-ParcelCompleteness-v1.1';
  const PACKAGE = 'CarbonSat-ParcelReviewPackage-v1.0';
  const GROUPS = ['boundary', 'commencement', 'activity', 'ownership', 'preProjectLand'];
  const LABELS = {boundary:'边界', commencement:'开工日', activity:'措施与物种', ownership:'土地、林木及减排量权属', preProjectLand:'治理前土地证据'};
  const BOUNDARY = Object.freeze({sourceAuthenticityVerified:false, eligibilityStatus:'NOT_ASSESSED', carbonQuantificationStatus:'NOT_PERFORMED', attributionStatus:'insufficient_evidence', registrationReady:false, linksEstablished:0, publiclyAnchored:false});
  const SCOPE = '只核验资料包内部结构、规则结果和摘要；不核验凭证真伪、权属有效性或方法学适用性。包内附件摘要不等于已读取附件字节；整包重算者可重写自摘要，需外部可信摘要比对才可检出这种替换。未上链，不含碳量或信用量。';
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
  const visibleText = s => s.replace(/[\u200b-\u200d\u2060\ufeff]/g,'').trim();
  const filled = s => typeof s === 'string' && visibleText(s).length > 0;
                                                                                     
  function placeholderWarnings(r) {
    const warnings=[];
    const inspect=(value,group,field)=>{
      if(typeof value==='string'&&/^(?:待定|待补|占位|待填写|待提供|TODO|TBD|placeholder|[-—?？]+)$/i.test(visibleText(value)))
        warnings.push({group,field,message:field+'含明显占位文字，请用实际资料补充；本提示不鉴定内容真实性。'});
    };
    [['parcel','parcelId','地块编号'],['parcel','name','地块名称'],['parcel','administrativeArea','行政区'],['parcel','projectOwner','项目主体'],['activity','measures','措施'],['activity','species','物种'],['activity','density','密度'],['ownership','landOwner','土地权利主体'],['ownership','treeOwner','林木权利主体'],['ownership','reductionRightHolder','减排量权益主体']].forEach(([g,k,label])=>inspect(r[g][k],g,label));
    r.activity.components.forEach((s,i)=>inspect(s,'activity','活动拆分 '+(i+1)));
    GROUPS.forEach(g=>r.evidence[g].references.forEach((ref,i)=>['referenceId','title','issuer','documentNumber','locator'].forEach(k=>inspect(ref[k],g,LABELS[g]+' 来源 '+(i+1)+' '+({referenceId:'来源编号',title:'文件名称',issuer:'出具单位',documentNumber:'文件编号',locator:'定位信息'}[k])))));
    return warnings;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const enc = s => new TextEncoder().encode(s);
  function canonical(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('非有限数值不可规范化');
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return '[' + Array.from(value,canonical).join(',') + ']';
    if (plain(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
    throw new Error('不支持的值（缺失字段不能当 null）');
  }
  const hashText = s => sha256Bytes(enc(s));
  const recordSha = r => 'local-sha256:' + hashText('CarbonSat-MRV|parcel-record|v1\n'+canonical(r));
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s+'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s;
  }
  function isTimestamp(s) {
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(s)||!Number.isFinite(Date.parse(s)))return false;
    const normalized=/\.\d{3}Z$/.test(s)?s:s.replace(/Z$/,'.000Z');
    return new Date(s).toISOString()===normalized;
  }
  function blankRecord(asOfDate) {
    if (!isDate(asOfDate)) throw new Error('asOfDate 须为有效 ISO 日期');
    const evidence = {};
    GROUPS.forEach(g => {evidence[g]={status:'NOT_PROVIDED',references:[],reason:''};});
    return {schemaVersion:SCHEMA,protocolVersion:PROTOCOL,mode:'REAL',asOfDate,
      parcel:{parcelId:'',name:'',administrativeArea:'',projectOwner:''},
      boundary:{crs:'',geometry:null},
      commencement:{startDate:'',phased:false,batches:[]},
      activity:{type:'UNKNOWN',measures:'',species:'',density:'',components:[]},
      ownership:{landOwner:'',treeOwner:'',reductionRightHolder:'',transferStatus:'UNKNOWN',validityEnd:''},
      preProjectLand:{windowStart:'',windowEnd:''},evidence,attachments:[],notes:''};
  }
  function geometryErrors(geometry) {
    const errors = [];
    if (geometry === null) return errors;
    if (!plain(geometry) || !['Polygon','MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) return ['只接受 Polygon / MultiPolygon 几何'];
    if (Object.keys(geometry).some(k => !['type','coordinates'].includes(k))) errors.push('几何含未支持字段');
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!polygons.length || polygons.length > 100) errors.push('多边形数量须为 1–100');
                                                                            
    let totalPoints=0;
    for(const poly of polygons) {
      if(!Array.isArray(poly)||poly.length>100)return ['多边形环结构或数量非法'];
      for(const ring of poly) {if(Array.isArray(ring))totalPoints+=ring.length;}
    }
    if(totalPoints>5000)return ['几何最多 5000 点'];
    let count = 0;
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const between=(x,a,b)=>x>=Math.min(a,b)-1e-12 && x<=Math.max(a,b)+1e-12;
    const on=(a,b,c)=>Math.abs(cross(a,b,c))<1e-12 && between(c[0],a[0],b[0]) && between(c[1],a[1],b[1]);
    const intersects=(a,b,c,d)=>((cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b));
    polygons.forEach((poly,pi) => {
      if (!Array.isArray(poly) || !poly.length) {errors.push('空多边形 '+pi); return;}
      poly.forEach((ring,ri) => {
        if (!Array.isArray(ring) || ring.length<4 || ring.length>1000) {errors.push('环点数须为 4–1000'); return;}
        count += ring.length;
        const valid=ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90);
        if (!valid) {errors.push('坐标须为合法 WGS84 经度、纬度数值');return;}
        const eq=(a,b)=>a[0]===b[0]&&a[1]===b[1];
        if (!eq(ring[0],ring[ring.length-1])) errors.push('环未闭合');
        let area=0;
        for (let i=0;i<ring.length-1;i++) {
          if(eq(ring[i],ring[i+1])) errors.push('相邻点重复');
          area+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];
          for(let j=i+2;j<ring.length-1;j++) {
            if(i===0&&j===ring.length-2) continue;
            if(intersects(ring[i],ring[i+1],ring[j],ring[j+1])) errors.push('环自交或重复边 '+pi+'/'+ri);
          }
        }
        if(Math.abs(area)<1e-12) errors.push('环为退化几何');
      });
    });
    if(count>5000) errors.push('几何最多 5000 点');
    return Array.from(new Set(errors));
  }
  function normalizeGeoJSON(data) {
    if (!plain(data)) throw new Error('GeoJSON 根须为对象');
    if (data.crs) {
      const name=data.crs && data.crs.properties && data.crs.properties.name;
      if(!['EPSG:4326','urn:ogc:def:crs:OGC:1.3:CRS84','urn:ogc:def:crs:EPSG::4326'].includes(name)) throw new Error('坐标系未知或非 WGS84；请先在 GIS 中转换');
    }
    const list=[];
    const take=g=>{
      if(!plain(g)) throw new Error('缺少面几何');
      if(g.type==='Polygon') list.push(g.coordinates);
      else if(g.type==='MultiPolygon'&&Array.isArray(g.coordinates)) list.push(...g.coordinates);
      else throw new Error('只接受面几何，不接受点/线');
    };
    if(data.type==='FeatureCollection') {
      if(!Array.isArray(data.features)||!data.features.length) throw new Error('空 FeatureCollection');
      data.features.forEach(f=>{if(!plain(f)||f.type!=='Feature')throw new Error('非法 Feature');take(f.geometry);});
    } else if(data.type==='Feature') take(data.geometry); else take(data);
    const geometry=list.length===1?{type:'Polygon',coordinates:list[0]}:{type:'MultiPolygon',coordinates:list};
    const errors=geometryErrors(geometry);
    if(errors.length) throw new Error(errors.join('；'));
    return geometry;
  }
  function validateRecord(r) {
    const errors=[];
    const keys=(o,expected,label)=>{
      if(!plain(o)) {errors.push(label+' 须为对象');return false;}
      const actual=Object.keys(o);
      if(actual.length!==expected.length||expected.some(k=>!own(o,k))) {errors.push(label+' 键集不符（缺字段/多字段）');return false;}
      return true;
    };
    const strings=(o,fields,label)=>fields.forEach(k=>{if(typeof o[k]!=='string'||o[k].length>5000) errors.push(label+'.'+k+' 须为长度不超过 5000 的字符串');});
    const optionalDate=(s,label)=>{if(s!==''&&!isDate(s))errors.push(label+' 日期非法');};
    if(!keys(r,['schemaVersion','protocolVersion','mode','asOfDate','parcel','boundary','commencement','activity','ownership','preProjectLand','evidence','attachments','notes'],'record')) return {ok:false,errors};
    if(r.schemaVersion!==SCHEMA||r.protocolVersion!==PROTOCOL) errors.push('协议版本不符');
    if(!['REAL','SYNTHETIC'].includes(r.mode))errors.push('模式非法');
    if(!isDate(r.asOfDate)) errors.push('asOfDate 日期非法');
    if(typeof r.notes!=='string'||r.notes.length>10000)errors.push('notes 非法');
    if(keys(r.parcel,['parcelId','name','administrativeArea','projectOwner'],'parcel'))strings(r.parcel,Object.keys(r.parcel),'parcel');
    if(r.mode==='REAL'&&plain(r.parcel)&&typeof r.parcel.parcelId==='string'&&r.parcel.parcelId.startsWith('SYNTHETIC'))errors.push('合成演示不得仅改模式升级为真实项目');
    if(keys(r.boundary,['crs','geometry'],'boundary')) {
      if(!['','EPSG:4326','UNKNOWN'].includes(r.boundary.crs))errors.push('只支持显式 EPSG:4326；其他 CRS 须先转换');
      errors.push(...geometryErrors(r.boundary.geometry));
    }
    if(keys(r.commencement,['startDate','phased','batches'],'commencement')) {
      optionalDate(r.commencement.startDate,'startDate');
      if(typeof r.commencement.phased!=='boolean')errors.push('phased 须为 boolean');
      if(!Array.isArray(r.commencement.batches)||r.commencement.batches.length>100)errors.push('batches 须为最多 100 条的数组');
      else {
        const seen=new Set();
        r.commencement.batches.forEach(b=>{
          if(!keys(b,['batchId','startDate','evidenceReferenceId'],'batch'))return;
          strings(b,Object.keys(b),'batch');optionalDate(b.startDate,'batch.startDate');
          if(!filled(b.batchId)||seen.has(b.batchId))errors.push('批次主键为空或重复');seen.add(b.batchId);
        });
        if(!r.commencement.phased&&r.commencement.batches.length)errors.push('非分批项目不能隐藏批次记录');
      }
    }
    if(keys(r.activity,['type','measures','species','density','components'],'activity')) {
      strings(r.activity,['type','measures','species','density'],'activity');
      if(!['UNKNOWN','FORESTATION','GRASSLAND_MANAGEMENT','MIXED','OTHER'].includes(r.activity.type))errors.push('活动类型非法');
      if(!Array.isArray(r.activity.components)||r.activity.components.length>20||r.activity.components.some(s=>!filled(s))||new Set(r.activity.components).size!==r.activity.components.length)errors.push('活动拆分条目非法/重复');
    }
    if(keys(r.ownership,['landOwner','treeOwner','reductionRightHolder','transferStatus','validityEnd'],'ownership')) {
      strings(r.ownership,Object.keys(r.ownership),'ownership');optionalDate(r.ownership.validityEnd,'validityEnd');
      if(!['UNKNOWN','NOT_REQUIRED','DOCUMENTED'].includes(r.ownership.transferStatus))errors.push('权利转让状态非法');
    }
    if(keys(r.preProjectLand,['windowStart','windowEnd'],'preProjectLand')) {
      strings(r.preProjectLand,Object.keys(r.preProjectLand),'preProjectLand');
      optionalDate(r.preProjectLand.windowStart,'windowStart');optionalDate(r.preProjectLand.windowEnd,'windowEnd');
    }
    const attachmentIds=new Set();
    if(!Array.isArray(r.attachments)||r.attachments.length>50)errors.push('attachments 非法');
    else r.attachments.forEach(a=>{
      if(!keys(a,['attachmentId','fileName','byteLength','sha256'],'attachment'))return;
      strings(a,['attachmentId','fileName','sha256'],'attachment');
      if(!filled(a.attachmentId)||attachmentIds.has(a.attachmentId))errors.push('附件主键为空或重复');attachmentIds.add(a.attachmentId);
      if(!filled(a.fileName)||!Number.isSafeInteger(a.byteLength)||a.byteLength<0||a.byteLength>25*1024*1024||!/^[0-9a-f]{64}$/.test(a.sha256))errors.push('附件字节数或 SHA256 非法');
    });
    if(keys(r.evidence,GROUPS,'evidence')) GROUPS.forEach(g=>{
      const e=r.evidence[g];
      if(!keys(e,['status','references','reason'],'evidence.'+g))return;
      if(!['NOT_PROVIDED','PARTIAL','PROVIDED','NOT_APPLICABLE'].includes(e.status))errors.push(g+' 状态非法');
      if(typeof e.reason!=='string'||e.reason.length>5000)errors.push(g+' reason 非法');
      if(!Array.isArray(e.references)||e.references.length>20){errors.push(g+' references 非法');return;}
      const seen=new Set();
      e.references.forEach(ref=>{
        if(!keys(ref,['referenceId','title','issuer','issuedOn','documentNumber','locator','attachmentId'],g+'.reference'))return;
        strings(ref,Object.keys(ref),g+'.reference');optionalDate(ref.issuedOn,g+'.issuedOn');
        if(!filled(ref.referenceId)||seen.has(ref.referenceId))errors.push(LABELS[g]+' 来源编号为空或重复');seen.add(ref.referenceId);
        if(ref.attachmentId&&!attachmentIds.has(ref.attachmentId))errors.push(g+' 引用不存在的附件');
      });
    });
    try {if(canonical(r).length>1500000)errors.push('资料记录过大');}catch(e){errors.push(e.message);}
    return {ok:!errors.length,errors:Array.from(new Set(errors))};
  }
  function evaluate(r) {
    const validation=validateRecord(r);
    if(!validation.ok) throw new Error(validation.errors.join('；'));
    const tasks=[];
    const add=(group,code,message)=>tasks.push({group,code,message});
    [['parcelId','地块编号'],['name','名称'],['administrativeArea','行政区'],['projectOwner','项目主体']].forEach(([k,label])=>{if(!filled(r.parcel[k]))add('parcel','MISSING_'+k,'补充'+label);});
    GROUPS.forEach(g=>{
      const e=r.evidence[g];
      if(e.status==='NOT_APPLICABLE')add(g,'NA_PENDING','关键资料标为不适用不能放行；请提供理由并交专业审阅');
      else if(e.status!=='PROVIDED')add(g,'NOT_REGISTERED',LABELS[g]+'尚未完整登记');
      if(e.status==='NOT_APPLICABLE'&&!filled(e.reason))add(g,'NA_NO_REASON','补充不适用理由');
      if(e.status==='PROVIDED'&&!e.references.length)add(g,'MISSING_SOURCE','补充来源文件、出具单位、日期和定位信息');
      e.references.forEach(ref=>{
        if(!filled(ref.title)||!filled(ref.issuer)||!isDate(ref.issuedOn)||(!filled(ref.documentNumber)&&!filled(ref.locator)))add(g,'INCOMPLETE_SOURCE','完善来源 '+ref.referenceId+' 的名称、出具单位、日期及编号/页码定位');
        if(isDate(ref.issuedOn)&&ref.issuedOn>r.asOfDate)add(g,'FUTURE_SOURCE','来源日期晚于本次登记日期，须核查');
      });
    });
    if(r.boundary.geometry===null)add('boundary','NO_GEOMETRY','导入真实地块 Polygon/MultiPolygon GeoJSON');
    if(r.boundary.crs!=='EPSG:4326')add('boundary','CRS_UNKNOWN','明确 WGS84 经度在前的 EPSG:4326；其他坐标系须先转换');
    if(!isDate(r.commencement.startDate))add('commencement','NO_START_DATE','补充首次实质性作业日期');
    else if(r.commencement.startDate>r.asOfDate)add('commencement','FUTURE_START','开工日晚于登记日期，不能作为已开工事实');
    if(r.commencement.phased) {
      if(r.commencement.batches.length<2)add('commencement','MISSING_BATCHES','分批项目至少登记两个批次及各自来源');
      const refs=new Set(r.evidence.commencement.references.map(x=>x.referenceId));
      r.commencement.batches.forEach(b=>{if(!isDate(b.startDate)||b.startDate>r.asOfDate||!refs.has(b.evidenceReferenceId))add('commencement','INCOMPLETE_BATCH','完善批次 '+b.batchId+' 的日期与来源绑定');});
      const ds=r.commencement.batches.map(x=>x.startDate).filter(isDate).sort();
      if(ds.length&&r.commencement.startDate!==ds[0])add('commencement','BATCH_START_MISMATCH','总开工日须与最早登记批次一致');
    }
    if(r.activity.type==='UNKNOWN'||!filled(r.activity.measures)||!filled(r.activity.species))add('activity','ACTIVITY_DETAILS','补充活动类型、措施与物种/不涉及物种的说明');
    if(r.activity.type==='FORESTATION'&&!filled(r.activity.density))add('activity','NO_DENSITY','补充造林密度或株行距来源');
    if(r.activity.type==='MIXED'&&r.activity.components.length<2)add('activity','MIXED_NOT_SPLIT','复合措施须拆分活动，再由专业人员分别筛查');
    ['landOwner','treeOwner','reductionRightHolder'].forEach(k=>{if(!filled(r.ownership[k]))add('ownership','MISSING_'+k,'补充'+({landOwner:'土地权利主体',treeOwner:'林木权利主体',reductionRightHolder:'减排量权益主体'}[k]));});
    if(r.ownership.transferStatus==='UNKNOWN')add('ownership','TRANSFER_UNKNOWN','明确减排量权益与项目主体的授权/转让关系');
    if(filled(r.parcel.projectOwner)&&filled(r.ownership.treeOwner)&&r.parcel.projectOwner!==r.ownership.treeOwner&&r.ownership.transferStatus!=='DOCUMENTED')add('ownership','TRANSFER_MISSING','项目主体与林木权利主体不同；需登记授权/转让材料供审阅');
    if(!isDate(r.ownership.validityEnd))add('ownership','RIGHTS_END_UNKNOWN','登记权属有效期截止日供寿命期核查');
    else if(r.ownership.validityEnd<r.asOfDate)add('ownership','RIGHTS_EXPIRED','登记的权属有效期已过，须补充当前有效材料');
    const pre=r.preProjectLand;
    if(!isDate(pre.windowStart)||!isDate(pre.windowEnd))add('preProjectLand','LAND_WINDOW_MISSING','登记治理前土地证据覆盖时间窗');
    else if(pre.windowStart>pre.windowEnd||(isDate(r.commencement.startDate)&&pre.windowEnd>=r.commencement.startDate))add('preProjectLand','LAND_WINDOW_ORDER','土地证据时间窗须有序且结束于开工之前');
    const groups=GROUPS.map(g=>({key:g,label:LABELS[g],state:tasks.some(t=>t.group===g)?(r.evidence[g].status==='NOT_APPLICABLE'?'NOT_APPLICABLE_PENDING':'INCOMPLETE'):'REGISTERED_PENDING_REVIEW',sourceCount:r.evidence[g].references.length}));
    const ready=tasks.length===0;
    return {protocolVersion:PROTOCOL,state:ready?'READY_FOR_DOCUMENT_REVIEW':'INSUFFICIENT_EVIDENCE',mode:r.mode,
      registeredGroups:groups.filter(g=>g.state==='REGISTERED_PENDING_REVIEW').length,totalGroups:5,
      canProceedToDocumentReview:ready,groups,tasks,
      professionalChecks:['凭证出处与内容真实性','实际边界、孔洞和多地块拓扑及连续面积','逐批开工与土地历史连续性','方法学版本及逐条适用条件','土地、林木和减排量权属有效性及重叠','碳层、参数、监测与不确定度'],
      attachmentBytesVerified:false,boundary:clone(BOUNDARY)};
  }
  function buildPackage(record,createdAtUTC) {
    if(!isTimestamp(createdAtUTC))throw new Error('createdAtUTC 非法');
    const assessment=evaluate(record);
    const pkg={schemaVersion:PACKAGE,protocolVersion:PROTOCOL,createdAtUTC,record:clone(record),recordSha256:recordSha(record),assessment,boundary:clone(BOUNDARY),scopeNote:SCOPE};
    pkg.packageSha256='local-sha256:'+hashText('CarbonSat-MRV|parcel-package|v1\n'+canonical(pkg));
    return pkg;
  }
  function verifyPackage(pkg,expectedRecordSha256) {
    const errors=[];
    try {
      const expected=['schemaVersion','protocolVersion','createdAtUTC','record','recordSha256','assessment','boundary','scopeNote','packageSha256'];
      if(!plain(pkg)||Object.keys(pkg).length!==expected.length||expected.some(k=>!own(pkg,k)))throw new Error('包键集不符');
      if(pkg.schemaVersion!==PACKAGE||pkg.protocolVersion!==PROTOCOL)errors.push('包协议版本不符');
      const v=validateRecord(pkg.record); if(!v.ok)errors.push(...v.errors);
      if(canonical(pkg.boundary)!==canonical(BOUNDARY)||pkg.scopeNote!==SCOPE)errors.push('包的证明范围或禁止项被改写');
      if(v.ok) {
        if(pkg.recordSha256!==recordSha(pkg.record))errors.push('记录内容摘要失配');
        if(canonical(pkg.assessment)!==canonical(evaluate(pkg.record)))errors.push('缺项或资格状态与规则重算不符');
      }
      if(!isTimestamp(pkg.createdAtUTC))errors.push('包时间戳非法');
      const body={};expected.filter(k=>k!=='packageSha256').forEach(k=>body[k]=pkg[k]);
      const actual='local-sha256:'+hashText('CarbonSat-MRV|parcel-package|v1\n'+canonical(body));
      if(pkg.packageSha256!==actual)errors.push('包内容摘要失配');
      if(expectedRecordSha256!==undefined&&(!/^local-sha256:[0-9a-f]{64}$/.test(expectedRecordSha256)||pkg.recordSha256!==expectedRecordSha256))errors.push('与外部期望记录摘要不一致');
    } catch(e) {errors.push(e.message);}
    const warnings=[];
    if(expectedRecordSha256===undefined)warnings.push('未提供外部可信记录摘要；内部自洽不证明包未被整体替换。');
    if(!errors.length)warnings.push(...placeholderWarnings(pkg.record).map(w=>w.message));
    return {ok:!errors.length,errors:Array.from(new Set(errors)),warnings,matchesExpected:expectedRecordSha256===undefined?null:!errors.length,sourceAuthenticityVerified:false,scopeNote:SCOPE};
  }
  function attachmentDigest(bytes) {
    if(!(bytes instanceof Uint8Array))throw new Error('附件须为原始字节');
    if(bytes.length>25*1024*1024)throw new Error('附件最大 25 MiB');
    return sha256Bytes(bytes);
  }
  function verifyAttachment(bytes,metadata) {
    const actual=attachmentDigest(bytes);
    return {ok:plain(metadata)&&metadata.byteLength===bytes.length&&metadata.sha256===actual,actualSha256:actual,byteLength:bytes.length,sourceAuthenticityVerified:false};
  }
  function syntheticRecord(asOfDate) {
    const r=blankRecord(asOfDate);r.mode='SYNTHETIC';
    r.parcel={parcelId:'SYNTHETIC-DEMO-001',name:'合成资料登记演示（非真实地块）',administrativeArea:'演示行政区，不对应项目',projectOwner:'合成主体 A'};
    r.boundary={crs:'EPSG:4326',geometry:{type:'Polygon',coordinates:[[[0,0],[0.01,0],[0.01,0.01],[0,0.01],[0,0]]]}};
    r.commencement.startDate='2020-01-01';r.activity={type:'FORESTATION',measures:'合成示例：植苗',species:'合成示例物种，不作参数依据',density:'合成密度，仅用于表单测试',components:[]};
    r.ownership={landOwner:'合成主体 A',treeOwner:'合成主体 A',reductionRightHolder:'合成主体 A',transferStatus:'NOT_REQUIRED',validityEnd:'2099-12-31'};
    r.preProjectLand={windowStart:'2016-01-01',windowEnd:'2019-12-31'};
    GROUPS.forEach((g,i)=>{r.evidence[g]={status:'PROVIDED',reason:'',references:[{referenceId:'SYNTHETIC-REF-'+(i+1),title:'合成测试资料 '+LABELS[g],issuer:'虚构出具单位（SYNTHETIC）',issuedOn:'2020-01-01',documentNumber:'SYNTHETIC-'+(i+1),locator:'示例页，不是真实文书',attachmentId:''}]};});
    r.notes='SYNTHETIC：仅验证软件资料登记流程，不代表真实项目、法律资格或任何碳量。';return r;
  }
  return {SCHEMA,PROTOCOL,PACKAGE,GROUPS,LABELS,BOUNDARY,SCOPE,canonical,hashText,recordSha,isDate,isTimestamp,blankRecord,validateRecord,evaluate,placeholderWarnings,normalizeGeoJSON,geometryErrors,buildPackage,verifyPackage,attachmentDigest,verifyAttachment,syntheticRecord};
});
