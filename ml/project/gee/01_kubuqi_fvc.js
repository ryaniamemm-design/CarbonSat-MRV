                                                               
                                                                     
  
                                                                               
                                
  
                                                          
                          
                                    
                                                  
                                             
                                                 
                                                                              
                                     
                                                              
                                     
                                                     
                                       
                                                         
                                           
  
                                  
                                                     
                                 
                                         
                                  
                                                      
                                               
                                                
                                         
  
                              
                                                                        
                                                                         
  
                                              
                                                                 
                                                                       
                                                                             
                                                                   
                                                                
                                                                        
                                       
  
                                                     
                                              
  
                                                                         
                                                                         
                                          
                                                                               

                  
var SR_SCALE  = 0.0000275;                           
var SR_OFFSET = -0.2;                              
var METHOD_VERSION = 'CarbonSat-FVC-v2.0-SR';                     
var MISSING = -9999;                                                                  
var START_YEAR = 1987, END_YEAR = 2024;
var ENDMEMBER_PERCENTILES = [5, 95];         
var ALT_PERCENTILES = [2, 98];                  

                                                        
                                                 
                                                   
                                             
                                            
function noObsImage(band) {
  return ee.Image.constant(0).rename(band).selfMask();
}

function sensorForYear(y) {
  if (y <= 1998)      return { colId: 'LANDSAT/LT05/C02/T1_L2', red: 'SR_B3', nir: 'SR_B4' };
  if (y <= 2012)      return { colId: 'LANDSAT/LE07/C02/T1_L2', red: 'SR_B3', nir: 'SR_B4' };
  if (y <= 2021)      return { colId: 'LANDSAT/LC08/C02/T1_L2', red: 'SR_B4', nir: 'SR_B5' };
  return { colId: 'LANDSAT/LC09/C02/T1_L2', red: 'SR_B4', nir: 'SR_B5' };
}

                                      
function yearCollection(y, aoi) {
  var s = sensorForYear(y);
  var start = ee.Date.fromYMD(y, 1, 1);
  var end   = ee.Date.fromYMD(y, 12, 31);
  return ee.ImageCollection(s.colId).filterDate(start, end).filterBounds(aoi).map(maskCloud);
}

                                               
var kubuqi = ee.Geometry.Polygon([[
  [108.10, 40.05], [109.20, 40.05], [109.20, 40.55], [108.10, 40.55]
]]);
                          
                                                             
var kubuqiControl = ee.Geometry.Polygon([[
  [107.30, 40.05], [108.00, 40.05], [108.00, 40.55], [107.30, 40.55]
]]);

                     
var jointGeom = kubuqi.union(kubuqiControl, 100);

Map.setCenter(108.25, 40.30, 8);
Map.addLayer(ee.Image().paint(kubuqi, 0, 2), {palette: 'red'}, 'Treated (示意)');
Map.addLayer(ee.Image().paint(kubuqiControl, 0, 2), {palette: 'blue'}, 'Control (示意)');
Map.addLayer(ee.Image().paint(jointGeom, 0, 1), {palette: 'black'}, 'Endmember scope (union)');

                                                       
function maskCloud(img) {
  var qa = img.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3).eq(0);
  return img.updateMask(mask);
}

                                                
function ndviImageForYear(y, aoi) {
  var s = sensorForYear(y);
  var colId = s.colId, red = s.red, nir = s.nir;
  var start = ee.Date.fromYMD(y, 1, 1);
  var end   = ee.Date.fromYMD(y, 12, 31);
  var band = 'NDVI_' + y;

  var col = yearCollection(y, aoi);

  var ndviCol = col.map(function (img) {
                                       
    var sr = img.select([red, nir]).multiply(SR_SCALE).add(SR_OFFSET);

                                                 
    var inRange = sr.gte(0).and(sr.lte(1)).reduce(ee.Reducer.allNonZero());
    var denomOk = sr.select([red]).add(sr.select([nir])).gt(0);
    var valid = inRange.and(denomOk);

                                          
    return sr.updateMask(valid).normalizedDifference([nir, red]).rename(band);
  });

  var comp = ndviCol.median();

                                               
                                                  
                                                               
                                                             
                    
                                                                       
  return ee.Image(ee.Algorithms.If(
    comp.bandNames().contains(band),
    comp,
    noObsImage(band)
  ));
}

                                     
function buildStack(aoi) {
  var imgs = [];
  for (var y = START_YEAR; y <= END_YEAR; y++) {
    imgs.push(ndviImageForYear(y, aoi));
  }
  return ee.Image.cat(imgs);
}

                                                   
                                                           
                                                                               
function qualityForYear(y, aoi) {
  var s = sensorForYear(y);
  var col = yearCollection(y, aoi);
  var nTotal = col.size();
                                               
  var validCount = col.map(function (im) {
    var sr = im.select([s.red, s.nir]).multiply(SR_SCALE).add(SR_OFFSET);
    var inRange = sr.gte(0).and(sr.lte(1)).reduce(ee.Reducer.allNonZero());
    var denomOk = sr.select([s.red]).add(sr.select([s.nir])).gt(0);
    return inRange.and(denomOk).rename('v');
  }).sum();
  var nObs = ee.Number(nTotal).max(1);
  var hasData = nTotal.gt(0);
                             
  var clear = ee.Algorithms.If(hasData,
    validCount.divide(nObs).reduceRegion({ reducer: ee.Reducer.mean(), geometry: aoi, scale: 30, maxPixels: 1e9 }).get('v'),
    null);
  var cover = ee.Algorithms.If(hasData,
    validCount.gt(0).reduceRegion({ reducer: ee.Reducer.mean(), geometry: aoi, scale: 30, maxPixels: 1e9 }).get('v'),
    null);
  return { clearPixelRatio: clear, spatialCoverage: cover };
}

                                                     
function fvcSingleSensor(y, aoi, colId, red, nir) {
  var start = ee.Date.fromYMD(y, 1, 1);
  var end   = ee.Date.fromYMD(y, 12, 31);
  var col = ee.ImageCollection(colId).filterDate(start, end).filterBounds(aoi).map(maskCloud)
    .map(function (im) {
      var sr = im.select([red, nir]).multiply(SR_SCALE).add(SR_OFFSET);
      var inRange = sr.gte(0).and(sr.lte(1)).reduce(ee.Reducer.allNonZero());
      var denomOk = sr.select([red]).add(sr.select([nir])).gt(0);
      var valid = inRange.and(denomOk);
      return sr.updateMask(valid).normalizedDifference([nir, red]).rename('nd');
    });
  var comp = col.median();
                                                                       
  comp = ee.Image(ee.Algorithms.If(comp.bandNames().contains('nd'), comp, noObsImage('nd')));
  var m = comp.reduceRegion({ reducer: ee.Reducer.mean(), geometry: aoi, scale: 30, maxPixels: 1e9 }).get('nd');
  return fvcServer(m, P5, P95);                                   
}

                                                            
function sensorAgreementForYear(y, aoi) {
  if (y < 2022) return null;
  var fL8 = fvcSingleSensor(y, aoi, 'LANDSAT/LC08/C02/T1_L2', 'SR_B4', 'SR_B5');
  var fL9 = fvcSingleSensor(y, aoi, 'LANDSAT/LC09/C02/T1_L2', 'SR_B4', 'SR_B5');
  return ee.Algorithms.If(ee.Number(fL8).eq(MISSING), null,
    ee.Algorithms.If(ee.Number(fL9).eq(MISSING), null,
      ee.Number(1).subtract(ee.Number(fL8).subtract(fL9).abs()).max(0).min(1)));
}

                                 
var stackJoint = buildStack(jointGeom);

                                  

                                     
                                  
var endmemberImg = stackJoint.reduce(ee.Reducer.percentile(ENDMEMBER_PERCENTILES));
var em = endmemberImg.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: jointGeom, scale: 100, maxPixels: 1e9
});

                           
var altImg = stackJoint.reduce(ee.Reducer.percentile(ALT_PERCENTILES));
var emAlt = altImg.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: jointGeom, scale: 100, maxPixels: 1e9
});

                                              
function eraBands(from, to) {
  var out = [];
  for (var y = from; y <= to; y++) { out.push('NDVI_' + y); }
  return out;
}
var era1Bands = eraBands(1987, 2012);                   
var era2Bands = eraBands(2013, 2024);                   

var emEra1 = stackJoint.select(era1Bands)
  .reduce(ee.Reducer.percentile(ENDMEMBER_PERCENTILES))
  .reduceRegion({reducer: ee.Reducer.mean(), geometry: jointGeom, scale: 100, maxPixels: 1e9});
var emEra2 = stackJoint.select(era2Bands)
  .reduce(ee.Reducer.percentile(ENDMEMBER_PERCENTILES))
  .reduceRegion({reducer: ee.Reducer.mean(), geometry: jointGeom, scale: 100, maxPixels: 1e9});

var P5 = em.get('p5'), P95 = em.get('p95');
var A5 = emAlt.get('p2'), A95 = emAlt.get('p98');
var E1_5 = emEra1.get('p5'), E1_95 = emEra1.get('p95');
var E2_5 = emEra2.get('p5'), E2_95 = emEra2.get('p95');

var ENDMEMBER_SCOPE  = 'treated_union_control';
var ENDMEMBER_YEARS  = START_YEAR + '-' + END_YEAR;
var ENDMEMBER_METHOD = 'per-pixel percentile[5,95] over 38-year NDVI stack -> region mean @100m (shared)';

                                         
var meanTreated = stackJoint.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: kubuqi, scale: 30, maxPixels: 1e9
});
var meanControl = stackJoint.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: kubuqiControl, scale: 30, maxPixels: 1e9
});

                                   
function fvcWith(m, lo, hi) {
                                        
                                                           
  if (m === null || m === undefined || m === MISSING ||
      lo === null || hi === null || !(hi > lo)) return MISSING;
  return Math.min(1, Math.max(0, (m - lo) / (hi - lo)));
}

                                                     
function fvcServer(m, lo, hi) {
  return ee.Algorithms.If(ee.Algorithms.IsEqual(m, null), MISSING,
    ee.Algorithms.If(ee.Number(m).eq(MISSING), MISSING,
      ee.Number(m).subtract(ee.Number(lo))
        .divide(ee.Number(hi).subtract(ee.Number(lo))).max(0).min(1)));
}

function seriesFrom(meanInfo, tag, aoi) {
  var feats = [];
  for (var y = START_YEAR; y <= END_YEAR; y++) {
    var b = 'NDVI_' + y;
    var m = meanInfo.get(b);
    var fvcMain = fvcServer(m, P5, P95);
    var fvcAlt  = fvcServer(m, A5, A95);
    var lo, hi, eraTag;
    if (y <= 2012) { lo = E1_5; hi = E1_95; eraTag = 'era-L57'; }
    else           { lo = E2_5; hi = E2_95; eraTag = 'era-L89'; }
    var fvcEra = fvcServer(m, lo, hi);

                                              
    var q = qualityForYear(y, aoi);
    var sa = sensorAgreementForYear(y, aoi);

    feats.push(ee.Feature(null, {
      year: y,
      fvc: fvcMain,
      ndvi: ee.Algorithms.If(ee.Algorithms.IsEqual(m, null), MISSING, m),
      fvc_alt_p2p98: fvcAlt,
      fvc_era: fvcEra,
      clearPixelRatio: q.clearPixelRatio,                  
      spatialCoverage: q.spatialCoverage,                        
      sensorAgreement: sa,                                                     
      gediAgreement: null,                                          
      endmember_p5: P5,
      endmember_p95: P95,
      endmember_scope: ENDMEMBER_SCOPE,
      endmember_years: ENDMEMBER_YEARS,
      endmember_method: ENDMEMBER_METHOD,
      era_endmember: eraTag,
      method_version: METHOD_VERSION,
      parcel: tag
    }));
  }
  return ee.FeatureCollection(feats);
}

var outTreated = seriesFrom(meanTreated, 'treated', kubuqi);
var outControl = seriesFrom(meanControl, 'control', kubuqiControl);

print('已创建两份 CSV 导出任务；端元和逐年值在导出文件中查看。');

                        
Export.table.toDrive({
  collection: outTreated,
  description: 'kubuqi_fvc_treated_1987_2024',
  fileFormat: 'CSV'
});
Export.table.toDrive({
  collection: outControl,
  description: 'kubuqi_fvc_control_1987_2024',
  fileFormat: 'CSV'
});

                                                                    
                              
                                                                           
                                            
                                                
                                                                           
print('=== SR 定标数值自检 ===');
print('未定标(错误):', (20000 - 12000) / (20000 + 12000));
print('已定标(正确):', ((20000 * SR_SCALE + SR_OFFSET) - (12000 * SR_SCALE + SR_OFFSET)) /
                      ((20000 * SR_SCALE + SR_OFFSET) + (12000 * SR_SCALE + SR_OFFSET)));
print('→ 两者相差约', (((20000 * SR_SCALE + SR_OFFSET) - (12000 * SR_SCALE + SR_OFFSET)) /
                      ((20000 * SR_SCALE + SR_OFFSET) + (12000 * SR_SCALE + SR_OFFSET))) -
                     ((20000 - 12000) / (20000 + 12000)), '（旧 CSV 必须作废重导）');
