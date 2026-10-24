
from pathlib import Path
import hashlib
import json
import sys
import warnings

sys.dont_write_bytecode=True
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
PROJECT=ROOT/'project'
sys.path.insert(0,str(PROJECT/'pipeline'))

def main():
 manifest=json.loads((ROOT/'MODEL_ARTIFACT_MANIFEST.json').read_text(encoding='utf-8'))
 for entry in manifest['files']:
  path=ROOT/entry['path']
  if path.stat().st_size != entry['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
   raise ValueError('Packaged model input or artifact hash mismatch: '+entry['path'])
 import joblib
 import numpy as np
 import pandas as pd
 from sklearn.ensemble import IsolationForest
 def forbid_fit(*args,**kwargs):raise RuntimeError('Training forbidden by this read-only verifier')
 IsolationForest.fit=forbid_fit
 import anomaly_model as fvc
 import npp_anomaly_model as npp
 results=[]
 def check(name,ok):
  results.append({'name':name,'ok':bool(ok)})
 paths=sorted((PROJECT/'evidence').rglob('*.joblib'))
 check('five packaged model artifacts',len(paths)==5)
 before={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
 with warnings.catch_warnings(record=True) as caught:
  warnings.simplefilter('always')
  bundles={p:joblib.load(p) for p in paths}
  for p,b in bundles.items():
   expected=7 if p.parent.name!='npp_anomaly' else 8
   check('model and feature dimensions: '+p.name,isinstance(b,dict) and isinstance(b.get('model'),IsolationForest) and b['model'].n_features_in_==expected and len(b['features'])==expected)
  fb=bundles[PROJECT/'evidence/anomaly_model.joblib']
  fs=json.loads((PROJECT/'evidence/anomaly_model_status.json').read_text(encoding='utf-8'))
  check('formal FVC role',fs['trained'] and fs['synthetic'] is False and fb['modelVersion']==fvc.MODEL_VERSION)
  df,_=fvc.load_grid_samples(str(PROJECT/'data/grid_samples.csv'))
  X,_,feat=fvc.build_features(df,imputer=fb['imputer'])
  scores=np.round(fvc.anomaly_score(fb['model'],X),4)
  expected=pd.DataFrame({'cellId':feat['cellId'],'year':feat['year'],'expected':scores})
  got=pd.read_csv(PROJECT/'evidence/anomaly_scores_grid.csv')
  joined=got.merge(expected,on=['cellId','year'],validate='one_to_one')
  delta=np.abs(joined['anomalyScore'].to_numpy()-joined['expected'].to_numpy())
  fvc_mismatch=int((delta>1e-12).sum())
  fvc_max=float(delta.max())
  check('FVC imputed inference path matches saved grid scores',len(got)==3420 and len(joined)==3420 and fvc_mismatch==0)


  legacy=np.round(fvc.anomaly_score(fb['model'],feat[fvc.FEATURES].to_numpy(dtype=float)),4)
  legacy_frame=pd.DataFrame({'cellId':feat['cellId'],'year':feat['year'],'legacy':legacy})
  legacy_join=got.merge(legacy_frame,on=['cellId','year'],validate='one_to_one')
  check('FVC v1.1 producer frame reproduces 3420 corrected scores',len(legacy_join)==3420 and np.allclose(legacy_join['anomalyScore'],legacy_join['legacy'],rtol=0,atol=1e-12))
  ns=json.loads((PROJECT/'evidence/npp_anomaly/npp_anomaly_model_status.json').read_text(encoding='utf-8'))
  for role,key in [('formalModel','npp_anomaly_model.joblib'),('timeHoldout','npp_anomaly_model_timeholdout.joblib'),('cellHoldout','npp_anomaly_model_cellholdout.joblib')]:
   p=PROJECT/'evidence/npp_anomaly'/key
   check('NPP artifact hash matches role: '+role,'sha256:'+before[p]==ns[role]['modelFileHash'])
   check('NPP frozen parameters present: '+role,'featureParams' in bundles[p] and bundles[p]['features']==npp.FEATURES)
  ok,errors=npp.verify_scores_table()
  check('NPP 816 stored scores and feature bindings reproduced',ok)
  if errors:raise AssertionError('; '.join(errors))
  npp_df,_=npp.load_npp()
  check('NPP input identity','sha256:'+hashlib.sha256((PROJECT/'data/npp_subset_fullperiod.csv').read_bytes()).hexdigest()==ns['trainingCsvSha256'] and len(npp_df)==816)
  smoke=json.loads((PROJECT/'evidence/smoke/anomaly_model_status.json').read_text(encoding='utf-8'))
  check('smoke remains SYNTHETIC',smoke['trained'] and smoke['synthetic'] is True)
 check('all model bytes unchanged',before=={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths})
 failed=sum(not r['ok'] for r in results)
 print(json.dumps({'ok':failed==0,'passed':len(results)-failed,'failed':failed,'modelArtifactsLoaded':len(paths),'fvcScoresCompared':3420,'nppScoresCompared':816,'fvcPreprocessingDiscrepancy':{'mismatchedRows':fvc_mismatch,'maxAbsoluteScoreDifference':fvc_max,'details':'V1.1 frame and matrix both use the saved training imputer; the original M1 discrepancy is retained in the baseline audit.'},'trainingPerformed':False,'publicTransactionsSent':0,'warnings':[str(w.message) for w in caught],'checks':results},ensure_ascii=False,indent=2))
 return 1 if failed else 0

if __name__=='__main__':
 try:raise SystemExit(main())
 except Exception as exc:
  print(json.dumps({'ok':False,'error':type(exc).__name__+': '+str(exc),'trainingPerformed':False},ensure_ascii=False));raise SystemExit(1)
