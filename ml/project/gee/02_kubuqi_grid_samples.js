                                                    
                                                                     
  
                                                   
                                                             
                                             
  
                                                                               
                                    
                                                           
                                                           
                                                           
  
                 
                                                                 
                                                       
                                                                 
                                                     
                                                      
                                                   
                                                
                                                               
  
                                                                           
                                                                       
                                                            
                                                                               

                    
  
                               
                                                         
                                      
                                              
                                                                  
                                                      
                            
                                                               
                                              
var SMOKE = true;                                                  
var PROBE_YEAR = 2020;                                             
var SMOKE_YEARS = [2016, 2018, 2020, 2022, 2024];                       
var METHOD_VERSION = 'CarbonSat-FVC-v2.0-SR';
var SR_SCALE = 0.0000275;
var SR_OFFSET = -0.2;
var START_YEAR = 1987, END_YEAR = 2024;
var ENDMEMBER_PERCENTILES = [5, 95];

                                          
                                             
                                                    
                                                            
function noObsImage(band) {
  return ee.Image.constant(0).rename(band).selfMask();
}

                                        
function sensorForYear(y) {
  if (y <= 1998) return { colId: 'LANDSAT/LT05/C02/T1_L2', red: 'SR_B3', nir: 'SR_B4' };
  if (y <= 2012) return { colId: 'LANDSAT/LE07/C02/T1_L2', red: 'SR_B3', nir: 'SR_B4' };
  if (y <= 2021) return { colId: 'LANDSAT/LC08/C02/T1_L2', red: 'SR_B4', nir: 'SR_B5' };
  return { colId: 'LANDSAT/LC09/C02/T1_L2', red: 'SR_B4', nir: 'SR_B5' };
}

                             
var kubuqi = ee.Geometry.Polygon([[
  [108.10, 40.05], [109.20, 40.05], [109.20, 40.55], [108.10, 40.55]
]]);
var kubuqiControl = ee.Geometry.Polygon([[
  [107.30, 40.05], [108.00, 40.05], [108.00, 40.55], [107.30, 40.55]
]]);
var jointGeom = kubuqi.union(kubuqiControl, 100);

Map.centerObject(jointGeom, 7);
Map.addLayer(ee.Image().paint(jointGeom, 0, 1), {palette: 'black'}, 'Joint AOI');

                                              
function maskCloud(img) {
  return img.updateMask(img.select('QA_PIXEL').bitwiseAnd(1 << 3).eq(0));
}
function srCalib(img, red, nir) {
  return img.select([red, nir]).multiply(SR_SCALE).add(SR_OFFSET);
}
function validMask(sr, red, nir) {
  var inRange = sr.gte(0).and(sr.lte(1)).reduce(ee.Reducer.allNonZero());
  var denomOk = sr.select([red]).add(sr.select([nir])).gt(0);
  return inRange.and(denomOk);
}
function yearCollection(y, aoi) {
  var s = sensorForYear(y);
  return ee.ImageCollection(s.colId)
    .filterDate(ee.Date.fromYMD(y, 1, 1), ee.Date.fromYMD(y, 12, 31))
    .filterBounds(aoi).map(maskCloud);
}

                                           
function ndviImageForYear(y, aoi) {
  var s = sensorForYear(y);
  var band = 'NDVI_' + y;
  var comp = yearCollection(y, aoi).map(function (img) {
    var sr = srCalib(img, s.red, s.nir);
    return sr.updateMask(validMask(sr, s.red, s.nir))
             .normalizedDifference([s.nir, s.red]).rename(band);
  }).median();
                                                                   
  return ee.Image(ee.Algorithms.If(
    comp.bandNames().contains(band), comp, noObsImage(band)));
}

                                                     
                                                  
                                          
function qualityImagesForYear(y, aoi) {
  var s = sensorForYear(y);
  var col = yearCollection(y, aoi);
  var nTotal = col.size();
  var hasData = nTotal.gt(0);
  var validCount = col.map(function (im) {
    var sr = srCalib(im, s.red, s.nir);
    return validMask(sr, s.red, s.nir).rename('v');
  }).sum();
  var nObs = ee.Number(nTotal).max(1);
  return {
    clear: ee.Image(ee.Algorithms.If(hasData,
      validCount.divide(nObs).rename('clear_' + y), noObsImage('clear_' + y))),
    cover: ee.Image(ee.Algorithms.If(hasData,
      validCount.gt(0).rename('cover_' + y), noObsImage('cover_' + y)))
  };
}

                                    
function ndviSingleSensor(y, aoi, colId, red, nir, band) {
  var comp = ee.ImageCollection(colId)
    .filterDate(ee.Date.fromYMD(y, 1, 1), ee.Date.fromYMD(y, 12, 31))
    .filterBounds(aoi).map(maskCloud)
    .map(function (im) {
      var sr = srCalib(im, red, nir);
      return sr.updateMask(validMask(sr, red, nir))
               .normalizedDifference([nir, red]).rename(band);
    }).median();
                                                                   
  return ee.Image(ee.Algorithms.If(
    comp.bandNames().contains(band), comp, noObsImage(band)));
}

                                                                 
                                                  
                                            
var YEARS = [];
if (SMOKE) {
  YEARS = SMOKE_YEARS;
} else {
  for (var y0 = START_YEAR; y0 <= END_YEAR; y0++) YEARS.push(y0);
}
print('参与计算的年份数 =', YEARS.length, SMOKE ? '（SMOKE 抽样，非全期）' : '（全期 1987-2024）');

var bandImgs = [];
YEARS.forEach(function (y) {
  bandImgs.push(ndviImageForYear(y, jointGeom));
  var q = qualityImagesForYear(y, jointGeom);
  bandImgs.push(q.clear);
  bandImgs.push(q.cover);
});
                        
YEARS.forEach(function (y) {
  if (y >= 2022) {
    bandImgs.push(ndviSingleSensor(y, jointGeom, 'LANDSAT/LC08/C02/T1_L2', 'SR_B4', 'SR_B5', 'ndL8_' + y));
    bandImgs.push(ndviSingleSensor(y, jointGeom, 'LANDSAT/LC09/C02/T1_L2', 'SR_B4', 'SR_B5', 'ndL9_' + y));
  }
});
var stack = ee.Image.cat(bandImgs);
print('合成影像波段数 =', stack.bandNames().size());

                                         
var ndviBands = YEARS.map(function (y) { return 'NDVI_' + y; });
var emInfo = stack.select(ndviBands).reduce(ee.Reducer.percentile(ENDMEMBER_PERCENTILES))
  .reduceRegion({ reducer: ee.Reducer.mean(), geometry: jointGeom, scale: 100, maxPixels: 1e9 })
  .getInfo();

var P5 = emInfo['p5'], P95 = emInfo['p95'];
var ENDMEMBER_SCOPE = 'treated_union_control';
                                       
var ENDMEMBER_YEARS = SMOKE
  ? (SMOKE_YEARS[0] + '-' + SMOKE_YEARS[SMOKE_YEARS.length - 1] + ' (SMOKE 抽样，非全期)')
  : (START_YEAR + '-' + END_YEAR);
var ENDMEMBER_METHOD = 'per-pixel percentile[5,95] over 38-year NDVI stack -> region mean @100m (shared)';

print('=== 共享端元（治理∪对照，' + ENDMEMBER_YEARS + '，100m；与 01 同法现算）===');
print('P5 =', P5, ' P95 =', P95);
if (SMOKE) {
  print('⚠️ SMOKE：这是【' + SMOKE_YEARS.length + ' 个抽样年】的端元，仅用于验证链路；');
  print('   正式 38 年共享端元需 SMOKE=false 全量运行时才会得到，此处数值不得用于任何结论。');
}
if (P5 === null || P95 === null || !(P95 > P5)) {
  throw new Error('共享端元无效（P5/P95 为空或 P95<=P5）——中止，先排查联合 AOI 是否有有效影像');
}

                                                                  
var MISSING = -9999;
function fvcWith(m, lo, hi) {
                                       
                                                                 
  if (m === null || m === undefined || m === MISSING) return MISSING;
  return Math.min(1, Math.max(0, (m - lo) / (hi - lo)));
}

                                                
var GRID_STEP = 0.1;                                            
var CELL_HALF = 0.03;                   

function getBounds(geom) {
                                                                             
  var rings = geom.bounds(1).coordinates().getInfo();
  var xs = [], ys = [];
  rings[0].forEach(function (pt) { xs.push(pt[0]); ys.push(pt[1]); });
  return { w: Math.min.apply(null, xs), s: Math.min.apply(null, ys),
           e: Math.max.apply(null, xs), n: Math.max.apply(null, ys) };
}
var B = getBounds(jointGeom);
print('联合 AOI 边界 (w,s,e,n) =', B.w, B.s, B.e, B.n);

                         
var cellFeats = [];
var ci = 0;
for (var lon = B.w + GRID_STEP / 2; lon < B.e; lon += GRID_STEP) {
  for (var lat = B.s + GRID_STEP / 2; lat < B.n; lat += GRID_STEP) {
    var g = ee.Geometry.Rectangle([lon - CELL_HALF, lat - CELL_HALF,
                                   lon + CELL_HALF, lat + CELL_HALF]);
    cellFeats.push(ee.Feature(g, { cellId: 'cell_' + ('0000' + ci).slice(-4),
                                   lon: lon, lat: lat }));
    ci++;
  }
}
var grid = ee.FeatureCollection(cellFeats).filterBounds(jointGeom);
print('网格单元数（filterBounds 后）=', grid.size());

                    
if (SMOKE) {
                                       
                                                   
                                  
  var probeYear = PROBE_YEAR;
  var probe = grid.first();
  var pv = stack.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: probe.geometry(), scale: 30, maxPixels: 1e9
  }).getInfo();
  var nd = pv['NDVI_' + probeYear];
  print('=== SMOKE 诊断（1 格 × 1 年 = ' + probeYear + '）===');
  print('cellId =', probe.get('cellId').getInfo(), ' lon/lat =',
        probe.get('lon').getInfo(), probe.get('lat').getInfo());
  print('ndvi(' + probeYear + ') =', nd, ' -> fvc =', fvcWith(nd, P5, P95));
  print('clearPixelRatio =', pv['clear_' + probeYear]);
  print('spatialCoverage =', pv['cover_' + probeYear]);
  print('sensorAgreement =', (probeYear < 2022 ? 'null (N/A，<2022 无 L8/L9 重叠)' : '见 ndL8/ndL9'));
  print('endmember p5/p95 =', P5, '/', P95);
  print('可取属性个数 =', Object.keys(pv).length);
  print('—— 判读要点 ——');
  print('  ① fvc 应在 [0,1]；ndvi 应在 [-1,1]；否则排查掩膜/端元');
  print('  ② clearPixelRatio / spatialCoverage 应在 [0,1]');
  print('  ③ <2022 年 sensorAgreement 必须是 null（N/A），不得是 0');
  print('  ④ 若 ndvi 为 null -> 该年该格无有效影像，fvc 应为 -9999（缺测哨兵）');
  print('确认无误后：把 var SMOKE = true 改成 false，再 Run 做全量导出。');
  print('建议再改 probeYear=2024 跑一次，确认 sensorAgreement 可得 0~1 数值。');
} else {
                                         
                                                          
                                 
  var reduced = stack.reduceRegions({
    collection: grid, reducer: ee.Reducer.mean(), scale: 30, tileScale: 4
  });
  function fvcServer(value) {
    return ee.Algorithms.If(ee.Algorithms.IsEqual(value, null), MISSING,
      ee.Algorithms.If(ee.Number(value).eq(MISSING), MISSING,
        ee.Number(value).subtract(P5).divide(P95 - P5).max(0).min(1)));
  }
                                                      
                                                          
  var yearlyCollections = YEARS.map(function (y) {
    return reduced.map(function (cell) {
      var nd = cell.get('NDVI_' + y);
      var sa = null;
      if (y >= 2022) {
        var f8 = fvcServer(cell.get('ndL8_' + y));
        var f9 = fvcServer(cell.get('ndL9_' + y));
        sa = ee.Algorithms.If(ee.Number(f8).eq(MISSING), null,
          ee.Algorithms.If(ee.Number(f9).eq(MISSING), null,
            ee.Number(1).subtract(ee.Number(f8).subtract(ee.Number(f9)).abs())
              .max(0).min(1)));
      }
      return ee.Feature(null, {
        cellId: cell.get('cellId'), lon: cell.get('lon'), lat: cell.get('lat'), year: y,
        fvc: fvcServer(nd),
        ndvi: ee.Algorithms.If(ee.Algorithms.IsEqual(nd, null), MISSING, nd),
        clearPixelRatio: cell.get('clear_' + y),
        spatialCoverage: cell.get('cover_' + y),
        sensorAgreement: sa,
        method_version: METHOD_VERSION,
        endmember_p5: P5, endmember_p95: P95,
        endmember_scope: ENDMEMBER_SCOPE,
        endmember_years: ENDMEMBER_YEARS,
        endmember_method: ENDMEMBER_METHOD
      });
    });
  });
  var outFc = ee.FeatureCollection(yearlyCollections).flatten();
  print('=== 全量导出 ===');
  print('预计行数（格 × 38 年）=', ee.Number(grid.size()).multiply(YEARS.length));
  print('列：cellId, lon, lat, year, fvc, ndvi, clearPixelRatio, spatialCoverage,');
  print('     sensorAgreement, method_version, endmember_p5, endmember_p95,');
  print('     endmember_scope, endmember_years, endmember_method');
                                                      

  Export.table.toDrive({
    collection: outFc,
    description: 'kubuqi_grid_samples',
    fileFormat: 'CSV',
    selectors: ['cellId', 'lon', 'lat', 'year', 'fvc', 'ndvi',
                'clearPixelRatio', 'spatialCoverage', 'sensorAgreement',
                'method_version', 'endmember_p5', 'endmember_p95',
                'endmember_scope', 'endmember_years', 'endmember_method']
  });
  print('导出后请记录：右侧 Tasks 面板的 task ID、CSV 行数、字段名、');
  print('  以及 fvc/ndvi/clearPixelRatio/spatialCoverage 的 min-max；');
  print('  把 CSV 下载放到 72h-spike/data/grid_samples.csv，再运行');
  print('  python scripts/train_anomaly.py');
}

                                                          
print('=== SR 定标数值自检 ===');
print('未定标(错误):', (20000 - 12000) / (20000 + 12000));
print('已定标(正确):', ((20000 * SR_SCALE + SR_OFFSET) - (12000 * SR_SCALE + SR_OFFSET)) /
                    ((20000 * SR_SCALE + SR_OFFSET) + (12000 * SR_SCALE + SR_OFFSET)));
