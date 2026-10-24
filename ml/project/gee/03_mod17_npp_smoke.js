                                                       
                                                                     
  
                                                                               
                                                                     
                                                           
                                                           
  
                               
                                                   
                             
                                               
                                             
                                                                 
  
                                                    
                                                               
                                                
                                 
                                                         
                                                 
                                                          
                                                                      
                                                      
                                               
                                                         
                                                     
                                                          
                                                           
  
                                                                         
                                             
                                  
  
                                                               
                                                                               

var SMOKE = true;                                                   
var PROBE_CELL = 4;                                                  
var PROBE_YEAR = 2024;                                    
var CELL_HALF  = 0.03;                                      
var NPP_SCALE  = 0.0001;                                            
                                                                                  
                                                   
                                           
                                                             
var NPP_VALID_MIN = -30000;                         
var NPP_VALID_MAX = 32700;                          
var NPP_FILL_CODES = [32761, 32762, 32763, 32764, 32765, 32766, 32767];                  
var REDUCE_CRS = 'SR-ORG:6974';                                
                                                            
                                                          
                                   
var YEARS      = [2001, 2010, 2020, 2024];                  
var PRODUCT    = 'MODIS/061/MOD17A3HGF';
var PRODUCT_VERSION = 'MOD17A3HGF.v6.1';

                                               
var kubuqi = ee.Geometry.Polygon([[
  [108.10, 40.05], [109.20, 40.05], [109.20, 40.55], [108.10, 40.55]
]]);
var kubuqiControl = ee.Geometry.Polygon([[
  [107.30, 40.05], [108.00, 40.05], [108.00, 40.55], [107.30, 40.55]
]]);
var jointGeom = kubuqi.union(kubuqiControl, 100);

Map.centerObject(jointGeom, 7);
Map.addLayer(ee.Image().paint(jointGeom, 0, 1), {palette: 'black'}, 'Joint AOI (crop target)');

                                                                   
var CENTERS = [
  [107.35, 40.1],
  [107.35, 40.2],
  [107.35, 40.3],
  [107.35, 40.4],
  [107.35, 40.5],
  [107.45, 40.1],
  [107.45, 40.2],
  [107.45, 40.3],
  [107.45, 40.4],
  [107.45, 40.5],
  [107.55, 40.1],
  [107.55, 40.2],
  [107.55, 40.3],
  [107.55, 40.4],
  [107.55, 40.5],
  [107.65, 40.1],
  [107.65, 40.2],
  [107.65, 40.3],
  [107.65, 40.4],
  [107.65, 40.5],
  [107.75, 40.1],
  [107.75, 40.2],
  [107.75, 40.3],
  [107.75, 40.4],
  [107.75, 40.5],
  [107.85, 40.1],
  [107.85, 40.2],
  [107.85, 40.3],
  [107.85, 40.4],
  [107.85, 40.5],
  [107.95, 40.1],
  [107.95, 40.2],
  [107.95, 40.3],
  [107.95, 40.4],
  [107.95, 40.5],
  [108.15, 40.1],
  [108.15, 40.2],
  [108.15, 40.3],
  [108.15, 40.4],
  [108.15, 40.5],
  [108.25, 40.1],
  [108.25, 40.2],
  [108.25, 40.3],
  [108.25, 40.4],
  [108.25, 40.5],
  [108.35, 40.1],
  [108.35, 40.2],
  [108.35, 40.3],
  [108.35, 40.4],
  [108.35, 40.5],
  [108.45, 40.1],
  [108.45, 40.2],
  [108.45, 40.3],
  [108.45, 40.4],
  [108.45, 40.5],
  [108.55, 40.1],
  [108.55, 40.2],
  [108.55, 40.3],
  [108.55, 40.4],
  [108.55, 40.5],
  [108.65, 40.1],
  [108.65, 40.2],
  [108.65, 40.3],
  [108.65, 40.4],
  [108.65, 40.5],
  [108.75, 40.1],
  [108.75, 40.2],
  [108.75, 40.3],
  [108.75, 40.4],
  [108.75, 40.5],
  [108.85, 40.1],
  [108.85, 40.2],
  [108.85, 40.3],
  [108.85, 40.4],
  [108.85, 40.5],
  [108.95, 40.1],
  [108.95, 40.2],
  [108.95, 40.3],
  [108.95, 40.4],
  [108.95, 40.5],
  [109.05, 40.1],
  [109.05, 40.2],
  [109.05, 40.3],
  [109.05, 40.4],
  [109.05, 40.5],
  [109.15, 40.1],
  [109.15, 40.2],
  [109.15, 40.3],
  [109.15, 40.4],
  [109.15, 40.5]
];

                               
function boxAt(lon, lat) {
  return ee.Geometry.Rectangle([lon - CELL_HALF, lat - CELL_HALF,
                                lon + CELL_HALF, lat + CELL_HALF]);
}

                                                     
var cells = ee.FeatureCollection(CENTERS.map(function (c, i) {
  var full = boxAt(c[0], c[1]);
  var inter = full.intersection(jointGeom, 1);                    
  var fullArea = full.area(1);
  var interArea = inter.area(1);
  return ee.Feature(inter, {
    cellId: 'cell_' + ('0000' + (i < 35 ? i : i + 5)).slice(-4),
    lon: c[0], lat: c[1],
    fullAreaM2: fullArea,
    interAreaM2: interArea,
    interAreaRatio: ee.Number(interArea).divide(fullArea)                    
  });
}));
print('样本格数（含被裁剪边缘格）=', cells.size());

                                                              
function nppImage(y) {
  return ee.ImageCollection(PRODUCT)
    .filterDate(ee.Date.fromYMD(y, 1, 1), ee.Date.fromYMD(y, 12, 31))
    .first()
    .clip(jointGeom);                                        
}

                   
function statsForCellYear(cell, y) {
  var geom = cell.geometry();                               
  var img = nppImage(y);
  var nppRaw = img.select('Npp');                     
  var nppKg  = nppRaw.multiply(NPP_SCALE);                    
  var qc     = img.select('Npp_QC');                               

                                                                  
                                                
  var valid = nppRaw.gte(NPP_VALID_MIN).and(nppRaw.lte(NPP_VALID_MAX));
  var nppValid = nppKg.updateMask(valid);

  var scale = 500;                                                     

                                                        
                                
  var candidateRaw = ee.Image(1).rename('c')
    .reduceRegion({reducer: ee.Reducer.count(), geometry: geom, crs: REDUCE_CRS, scale: scale, maxPixels: 1e9, bestEffort: false})
    .get('c');
  var candidateCount = ee.Algorithms.If(candidateRaw, candidateRaw, 0);

                                       
  var validRaw = ee.Image.constant(1).updateMask(valid).rename('v')
    .reduceRegion({reducer: ee.Reducer.count(), geometry: geom, crs: REDUCE_CRS, scale: scale, maxPixels: 1e9, bestEffort: false})
    .get('v');
  var validCount = ee.Algorithms.If(validRaw, validRaw, 0);

                                                                       
  var meanKg = nppValid.reduceRegion({reducer: ee.Reducer.mean(), geometry: geom, crs: REDUCE_CRS, scale: scale, maxPixels: 1e9, bestEffort: false}).get('Npp');
  var meanRaw = nppRaw.updateMask(valid).reduceRegion({reducer: ee.Reducer.mean(), geometry: geom, crs: REDUCE_CRS, scale: scale, maxPixels: 1e9, bestEffort: false}).get('Npp');

                       
  var qcStats = qc.reduceRegion({reducer: ee.Reducer.minMax().combine({reducer2: ee.Reducer.mean(), sharedInputs: true}), geometry: geom, crs: REDUCE_CRS, scale: scale, maxPixels: 1e9, bestEffort: false});

                                           
  var isMissing = ee.Number(validCount).eq(0);
  var nppOut = ee.Algorithms.If(isMissing, null, meanKg);
  var rawOut = ee.Algorithms.If(isMissing, null, meanRaw);
  var reason = ee.Algorithms.If(isMissing,
                                'no valid NPP pixels (fully masked / fill codes 32761-32767 or out of [-30000,32700])', 'ok');

                                               
                            
  var pixelRatio = ee.Algorithms.If(
    ee.Number(candidateCount).gt(0),
    ee.Number(validCount).divide(ee.Number(candidateCount)),
    null);

                                                     
  var pixArea = ee.Image.pixelArea().rename('a');
  var totalAreaRaw = pixArea.reduceRegion({reducer: ee.Reducer.sum(), geometry: geom, crs: REDUCE_CRS, scale: scale, maxPixels: 1e9, bestEffort: false}).get('a');
  var validAreaRaw = pixArea.updateMask(valid).reduceRegion({reducer: ee.Reducer.sum(), geometry: geom, crs: REDUCE_CRS, scale: scale, maxPixels: 1e9, bestEffort: false}).get('a');
  var totalArea = ee.Algorithms.If(totalAreaRaw, totalAreaRaw, 0);
  var validArea = ee.Algorithms.If(validAreaRaw, validAreaRaw, 0);
  var areaRatio = ee.Algorithms.If(
    ee.Number(totalArea).gt(0),
    ee.Number(validArea).divide(ee.Number(totalArea)),
    null);

                                                        
  var negCountRaw = ee.Image.constant(1).updateMask(valid.and(nppRaw.lt(0))).rename('n')
    .reduceRegion({reducer: ee.Reducer.count(), geometry: geom, crs: REDUCE_CRS, scale: scale, maxPixels: 1e9, bestEffort: false})
    .get('n');
  var negCount = ee.Algorithms.If(negCountRaw, negCountRaw, 0);
  var negRatio = ee.Algorithms.If(
    ee.Number(validCount).gt(0),
    ee.Number(negCount).divide(ee.Number(validCount)),
    null);

  return ee.Feature(null, {
    cellId: cell.get('cellId'), lon: cell.get('lon'), lat: cell.get('lat'),
    year: y,
    npp_kg_m2_yr: nppOut,                                        
    npp_raw_mean: rawOut,                                     
    npp_scale: NPP_SCALE,
    validPixels: validCount,                               
    candidatePixels: candidateCount,                       
    validPixelRatio: pixelRatio,                                         
    validAreaRatio: areaRatio,                                            
    nppNegPixels: negCount,                                                
    nppNegRatio: negRatio,                                     
    fullAreaM2: cell.get('fullAreaM2'),
    interAreaM2: cell.get('interAreaM2'),
    interAreaRatio: cell.get('interAreaRatio'),
    nppQc_min: qcStats.get('Npp_QC_min'),
    nppQc_max: qcStats.get('Npp_QC_max'),
    nppQc_mean: qcStats.get('Npp_QC_mean'),
    missing: isMissing,
    missingReason: reason,
    product: PRODUCT_VERSION,
    method_version: 'CarbonSat-NPP-SMOKE-v0.2'
  });
}

                 
if (SMOKE) {
  var probe = ee.Feature(cells.toList(90).get(PROBE_CELL));
  var s = statsForCellYear(probe, PROBE_YEAR);
  var info = s.getInfo();
  print('=== SMOKE 诊断（1 格 × 1 年 = ' + PROBE_YEAR + '）===');
  print('cellId =', info.properties.cellId, ' lon/lat =', info.properties.lon, info.properties.lat);
  print('interAreaRatio（相交比例，应<1 表示被裁剪）=', info.properties.interAreaRatio);
  print('interAreaM2 =', info.properties.interAreaM2, ' fullAreaM2 =', info.properties.fullAreaM2);
  print('npp_kg_m2_yr（缩放后均值）=', info.properties.npp_kg_m2_yr, ' npp_raw_mean =', info.properties.npp_raw_mean);
  print('validPixels =', info.properties.validPixels, ' candidatePixels =', info.properties.candidatePixels);
  print('validPixelRatio =', info.properties.validPixelRatio);
  print('validAreaRatio =', info.properties.validAreaRatio);
  print('nppNegPixels（有效负值像元，产品允许的模型估计值，非地面观测） =', info.properties.nppNegPixels, ' nppNegRatio =', info.properties.nppNegRatio);
  print('nppQc min/max/mean =', info.properties.nppQc_min, '/', info.properties.nppQc_max, '/', info.properties.nppQc_mean);
  print('missing =', info.properties.missing, ' reason =', info.properties.missingReason);
  print('—— 判读要点 ——');
  print('  1 若 missing=true -> 该格该年无有效 NPP（全掩膜或填充码 32761-32767），validPixels 安全=0，npp 应为 null，不得为 0');
  print('  2 若 interAreaRatio<1 -> 该格被联合 AOI 裁剪，面积分母须用 interAreaM2');
  print('  3 validAreaRatio（真实面积比例，像素面积加权）用于 §3.2 的 80% 门槛；');
  print('    validPixelRatio 仅为像元数比例（诊断），不得用于 80% 门槛');
  print('  4 npp_kg_m2_yr 量级应 < ~1.5；出现 >3.27 必为填充值未滤净');
  print('  5 合法零值与【范围内负值】均保留：掩膜按 [-30000,32700] 过滤，排除 32761–32767 七特殊值（不用 gte(0)）');
  print('    nppNegPixels/nppNegRatio 单列负 NPP 诊断（产品允许的模型估计值，非地面观测，不判无效）');
  print('  6 所有统计固定 crs=SR-ORG:6974 + scale=500 + bestEffort=false，像元计数/面积/NPP 同网格，口径不漂移');
  print('确认无误后：var SMOKE = true -> false，再 Run 做 90 格×4 年导出。');
} else {
                          
  var yearly = YEARS.map(function (y) {
    return cells.map(function (cell) { return statsForCellYear(cell, y); });
  });
  var outFc = ee.FeatureCollection(yearly).flatten();
  print('=== 全量导出（90 格 × ' + YEARS.length + ' 年 = ' + (90 * YEARS.length) + ' 行）===');
  print('列：cellId, lon, lat, year, npp_kg_m2_yr, npp_raw_mean, npp_scale,');
  print('    validPixels, candidatePixels, validPixelRatio(诊断), validAreaRatio(面积门槛),');
  print('    nppNegPixels(有效负值像元,产品允许的模型估计值,非地面观测,诊断), nppNegRatio(负值比例,诊断),');
  print('    fullAreaM2, interAreaM2, interAreaRatio,');
  print('    nppQc_min, nppQc_max, nppQc_mean, missing, missingReason, product, method_version');
  Export.table.toDrive({
    collection: outFc,
    description: 'kubuqi_mod17_npp_smoke_2001_2010_2020_2024_v02',
    fileFormat: 'CSV',
    selectors: [
      'cellId', 'lon', 'lat', 'year', 'npp_kg_m2_yr', 'npp_raw_mean',
      'npp_scale', 'validPixels', 'candidatePixels', 'validPixelRatio',
      'validAreaRatio', 'nppNegPixels', 'nppNegRatio', 'fullAreaM2',
      'interAreaM2', 'interAreaRatio', 'nppQc_min', 'nppQc_max',
      'nppQc_mean', 'missing', 'missingReason', 'product', 'method_version'
    ]
  });
  print('导出后请记录：右侧 Tasks 面板 task ID、CSV 行数、字段、');
  print('  npp_kg_m2_yr 分位（含 null 计数）、validPixelRatio 分布、');
  print('  以及按 §3.2 判定 GO_NPP / VEGETATED_SUBSET_ONLY / NO_GO_NPP。');
  print('把 CSV 放到 data/mod17_npp_smoke.csv，再运行本地核对脚本。');
}
