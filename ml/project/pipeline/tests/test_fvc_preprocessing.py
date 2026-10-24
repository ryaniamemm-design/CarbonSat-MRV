
from pathlib import Path
import copy,json,sys,unittest
from unittest.mock import patch
import joblib,numpy as np,pandas as pd
from sklearn.ensemble import IsolationForest
sys.dont_write_bytecode=True
PROJECT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(PROJECT/'pipeline'))
import anomaly_model as am

class FvcPreprocessingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_fit=IsolationForest.fit
        def forbid(*a,**k):raise AssertionError('No fitting in read-only regression tests')
        IsolationForest.fit=forbid
        cls.bundle=joblib.load(PROJECT/'evidence/anomaly_model.joblib')
        cls.df,_=am.load_grid_samples(str(PROJECT/'data/grid_samples.csv'))
        cls.X,cls.meta,cls.feat=am.build_features(cls.df,cls.bundle['imputer'])
    @classmethod
    def tearDownClass(cls):IsolationForest.fit=cls.original_fit
    def test_frame_matrix_and_independent_3420_rows_agree(self):
        ref=self.df.sort_values(['cellId','year']).reset_index(drop=True).copy()
        ref['sensorAgreement']=ref['sensorAgreement'].fillna(self.bundle['imputer']['value'])
        ref['fvcJump']=ref.groupby('cellId',sort=False)['fvc'].diff().abs().fillna(0.)
        ref['yearNorm']=(ref['year']-ref['year'].min())/(ref['year'].max()-ref['year'].min())
        self.assertEqual(len(ref),3420)
        np.testing.assert_array_equal(self.X,ref[am.FEATURES].to_numpy(float))
        np.testing.assert_array_equal(self.X,self.feat[am.FEATURES].to_numpy(float))
    def test_raw_observations_retained_and_input_not_mutated(self):
        self.assertEqual(int(self.df['sensorAgreement'].isna().sum()),3150)
        self.assertEqual(int(self.feat['sensorAgreement_observed'].isna().sum()),3150)
        self.assertFalse(self.feat['sensorAgreement'].isna().any())
        self.assertEqual(self.meta['sensorAgreementImputed'],3150)
    def test_saved_scores_exactly_reproduce(self):
        saved=pd.read_csv(PROJECT/'evidence/anomaly_scores_grid.csv')
        np.testing.assert_array_equal(saved[['cellId','year']].to_numpy(),self.feat[['cellId','year']].to_numpy())
        expected=np.round(-self.bundle['model'].decision_function(self.X),4)
        np.testing.assert_allclose(saved['anomalyScore'],expected,rtol=0,atol=1e-12)
    def test_grid_and_claim_vectors_agree_all_3420_rows(self):
        ymin,ymax=int(self.df['year'].min()),int(self.df['year'].max())
        vectors=[]
        for _,group in self.df.sort_values(['cellId','year']).groupby('cellId',sort=True):
            series=[]
            for r in group.to_dict('records'):
                series.append({'year':r['year'],'fvc':r['fvc'],'ndvi':r['ndvi'],
                    'ecComponents':{'validPixelRatio':{'value':r['clearPixelRatio']},
                        'spatialCoverage':{'value':r['spatialCoverage']},
                        'sensorAgreement':{'value':None if pd.isna(r['sensorAgreement']) else r['sensorAgreement']}}})
            for r in series:
                vectors.append(am.claim_feature_vector({'timeseries':series},r['year'],ymin,ymax,self.bundle['imputer']))
        np.testing.assert_array_equal(np.asarray(vectors),self.X)
    def test_inference_uses_saved_training_median_not_test_distribution(self):
        sample=self.df.iloc[:38].copy();sample['sensorAgreement']=np.nan
        sample.loc[sample.index[-1],'sensorAgreement']=0.01
        X,_,frame=am.build_features(sample,imputer=self.bundle['imputer'])
        missing=frame['sensorAgreement_observed'].isna().to_numpy()
        self.assertTrue(np.all(X[missing,4]==self.bundle['imputer']['value']))
    def test_all_missing_training_default_is_finite(self):
        sample=self.df.iloc[:38].copy();sample['sensorAgreement']=np.nan
        X,meta,frame=am.build_features(sample)
        self.assertTrue(np.isfinite(X).all());self.assertEqual(meta['sensorAgreementFillValue'],am.DEFAULT_SA_FILL)
        np.testing.assert_array_equal(X,frame[am.FEATURES].to_numpy(float))
    def test_invalid_saved_imputer_rejected(self):
        with self.assertRaises(am.GridSampleInvalid):am.build_features(self.df,{'value':np.nan})
    def test_scoring_rejects_bypassed_imputation(self):
        X=self.X.copy();X[0,4]=np.nan
        with self.assertRaises(am.GridSampleInvalid):am.anomaly_score(self.bundle['model'],X)
        with self.assertRaises(am.GridSampleInvalid):am.anomaly_score(self.bundle['model'],self.X[:,:6])
    def test_evaluation_does_not_refit_a_holdout_imputer(self):
        _,test,_=am.cell_based_split(self.df)
        _,_,frame=am.build_features(test,self.bundle['imputer'])
        labeled=am.inject_synthetic_anomalies(frame)
        self.assertTrue(np.isfinite(labeled[am.FEATURES].to_numpy(float)).all())
        prediction=self.bundle['model'].predict(labeled[am.FEATURES].to_numpy(float))==-1
        labels=labeled['is_anomaly_label'].to_numpy(int)
        actual=am.evaluate(self.bundle['model'],labeled)
        tp=int((prediction & (labels==1)).sum());fp=int((prediction & (labels==0)).sum());fn=int((~prediction & (labels==1)).sum())
        self.assertEqual((actual['truePositives'],actual['falsePositives'],actual['falseNegatives']),(tp,fp,fn))

        labeled.loc[0,'sensorAgreement']=np.nan
        with self.assertRaises(am.GridSampleInvalid):am.evaluate(self.bundle['model'],labeled)
    def test_current_nine_claims_reproduce_and_do_not_mutate_records(self):
        records=json.loads((PROJECT/'web/records.json').read_text(encoding='utf-8'))
        before=copy.deepcopy(records)
        scored=am.score_claims(records['claims'],records['parcels'])
        self.assertEqual(len(scored),9)
        for c in records['claims']:self.assertEqual(scored[c['claimId']]['score'],c['modelAnomalyScore'])
        self.assertEqual(records,before)
    def test_mixed_model_status_or_preprocessing_versions_rejected(self):
        status=json.loads((PROJECT/'evidence/anomaly_model_status.json').read_text(encoding='utf-8'))
        for key,value in [('modelVersion','CarbonSat-AnomalyIF-v1.0'),
                          ('preprocessingVersion','unknown'),('features',['fvc'])]:
            broken=copy.deepcopy(status);broken[key]=value
            with self.subTest(key=key),patch.object(am.json,'load',return_value=broken):
                with self.assertRaises(am.ModelNotAvailableError):am.score_claims([],[])

if __name__=='__main__':unittest.main(verbosity=2)
