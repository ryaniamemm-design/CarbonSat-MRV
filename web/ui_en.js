                                                                                                
(function(root){'use strict';
const words={
'恩格贝研究窗口':'Engebei research window','对照矩形内（示意）':'Reference rectangle (illustrative)','治理矩形内（示意）':'Treatment rectangle (illustrative)',
'部分有效覆盖':'Partial coverage','全覆盖':'Full valid coverage','当前内容内部一致':'Internally consistent','内部一致':'Internally consistent','内部不一致':'Internal mismatch','与发布版本一致':'Matches release','未与发布摘要比对':'Not compared with release','发布摘要未取得':'Release reference unavailable','与发布版本不符':'Release mismatch',
'正在核验…':'Verifying local files…','未载入':'Not loaded','正在读取本地产物…':'Loading local evidence…','尚未载入可用案例':'No verified case loaded','无可用研究范围（未载入或核验未通过）。':'No verified research extent is available.','无匹配对象。':'No matching objects.','该对象无可用序列（全部年份不可用）':'No valid annual values for this object.',
'缺测标志':'Missing-value flag','地类产品':'Land-cover product','产品 / 掩膜':'Product / mask','有效像元数':'Valid grid count','平均原始 DN（非通量）':'Mean raw DN (not a flux)','原始 DN 负值像元':'Negative-DN grid count','计算状态':'Computation status','覆盖状态':'Coverage status','矢量测地面积':'Geometry area','栅格总面积':'Reduction total area','栅格有效面积':'Valid reduction area','有效面积比例':'Valid-area ratio','研究格':'research cell','研究窗口':'research window',
'否':'No','是':'Yes','不可比':'Not comparable','不可用':'Unavailable','未知对象':'Unknown object','未知年份':'Unknown year','定位参数已拒绝':'Location parameters rejected','已回退到默认选择':'Using the default selection','静默忽略':'silently ignored','已清除：页面不再显示任何案例数值。':'Cleared: no case values are displayed.',
'网络获取失败：':'Network request failed: ','未找到：':'Not found: ','数据包不是合法 JSON：':'Invalid bundle JSON: ','发布摘要（pin）不是合法 JSON ⇒ 拒绝载入：':'Invalid release-reference JSON; input rejected: ','发布摘要（pin）结构非法（':'Invalid release-reference structure (','）⇒ 拒绝载入':'); input rejected','核验未通过：':'Verification rejected: ',
'内部核验通过':'Internal checks passed','内部核验未通过':'Internal checks failed','案例 ':'Case ',' 载入被拒绝。':' rejected. ','载入失败：':'Input failed: ','载入被拒绝（':'Input rejected (','）。':'). ', '上一份已核验结果':'previous verified result','新输入':'new input','未被采用':'was not used','当前显示的是':'Currently showing ','当前页面上仍显示的是':'The page retains ',
'只含 case / object / year 三个参数。':'Contains only case / object / year.','已复制：':'Copied: ','复制失败，请手动复制：':'Copy failed. Copy manually: ','请手动复制：':'Copy manually: ',
'底图：开':'Basemap: on','底图：关':'Basemap: off','底图不可用':'Basemap unavailable','底图 © OpenStreetMap contributors':'Basemap © OpenStreetMap contributors','底图加载失败（离线或网络受限）；研究范围与全部指标仍可用。':'Basemap unavailable. Local research footprints and metrics remain available.',
'2012 分段（成因未证实）':'2012 break · cause unverified','（内存载入，无盘上字节）':'(memory input; no disk bytes)','NOT_ANCHORED（本工作台不上链、不发交易）':'NOT_ANCHORED (read-only)',
'案例身份':'Case identity','方法版本':'Method version','源产物摘要（独立计算）':'Source-artifact digest (independent)','内容摘要':'Content digest','文件字节':'File bytes','窗口摘要':'Window digest','窗口哈希':'Window hash',
'（仅包内声明：':' (declared inside the file only: ','）':')',
};
const keys=Object.keys(words).sort((a,b)=>b.length-a.length);
function text(value){let s=String(value==null?'':value);if(!/[\u3400-\u9fff]/.test(s))return s;keys.forEach(k=>{s=s.split(k).join(words[k]);});return s;}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
root.CarbonSatEnglish={text,esc};
})(typeof window!=='undefined'?window:globalThis);
