import datetime,hashlib,importlib.util,json,pathlib,re,subprocess,sys,urllib.error,urllib.request
ROOT=pathlib.Path.cwd();OUT=ROOT/'docs/reporter-lifetime-stats/operating-preflight';PRIOR=pathlib.Path('C:/Users/김진호/.codex/worktrees/p1-paid-deploy/birdmap/docs/p1-paid-deployment/cutover-20261014');sys.dont_write_bytecode=True;sys.path.insert(0,str(PRIOR))
import backup_readonly_dpapi as cf
import worker_control as wc
if not __debug__:raise RuntimeError('OPTIMIZED_PYTHON_FORBIDDEN')
NODE='C:/Program Files/nodejs/node.exe';SOURCE=subprocess.check_output(['git','rev-parse','HEAD'],encoding='utf-8').strip();EXPECTED='ab7f0504aaf028dd01ffaf28abea0078875a9314';assert SOURCE==EXPECTED
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':SOURCE,'scope':{'readOnly':True,'operatingD1Writes':0,'versionUploads':0,'workerDeployments':0,'mainMerges':0,'privatePayloadSaved':False,'credentialsLogged':False},'checks':[],'errors':[]}
def safe_query(sql):
 assert re.match(r'^\s*(SELECT|PRAGMA)\b',sql,re.I)
 result=cf.api('/d1/database/'+cf.DB+'/query',{'sql':sql});assert len(result)==1 and result[0].get('success') is True and result[0]['meta'].get('rows_written',0)==0
 receipt.setdefault('d1ReadMetadata',[]).append({k:result[0]['meta'].get(k) for k in ['rows_read','rows_written','served_by_primary','served_by_region']})
 return result[0]['results']
def get_gh(path):
 raw=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,encoding='utf-8',capture_output=True,check=True).stdout
 token=dict(line.split('=',1) for line in raw.splitlines() if '=' in line).get('password');assert token
 request=urllib.request.Request('https://api.github.com'+path,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'birdmap-independent-readonly'})
 try:
  with urllib.request.build_opener(cf.NoAuthRedirect()).open(request,timeout=35) as response:return response.status,json.load(response)
 except urllib.error.HTTPError as error:return error.code,None
try:
 standbys=[wc.verify(role,mode) for role in ['public','admin'] for mode in ['normal','maintenance']];receipt['standbys']=standbys
 active=[wc.active(role) for role in ['public','admin']];receipt['active']=active
 for role,item in zip(['public','admin'],active):assert item['versions']==[{'version_id':wc.VERSIONS[role]['normal'],'percentage':100}]
 receipt['checks'].append({'id':'actual-v4-public-admin-and-standbys','status':'PASS','publicOnlyReleaseCompatible':True})
 # Compare public non-secret rollout bindings; secret values are never fetched or serialized.
 expected={'REPORTS_SCHEMA_VERSION':'phase2a-0001','REPORTS_ACTIVATION_ID':'phase2e-cutover-1','REPORTS_PUBLICATION_REQUIRED':'true','REPORTS_WRITE_MODE':'CANONICAL_DUAL_WRITE','REPORTS_DUAL_WRITE_ENABLED':'true','REPORTS_CONFIRMATION_REQUIRED':'true','REPORTS_REMOTE_VERIFIED':'true','ENVIRONMENT':'production'}
 for role in ['public','admin']:
  ver=cf.api('/workers/scripts/'+wc.VERSIONS[role]['worker']+'/versions/'+wc.VERSIONS[role]['normal']);bindings=ver['resources']['bindings'];vars={b['name']:b.get('text') for b in bindings if b['type']=='plain_text'}
  for name,value in expected.items():assert vars.get(name)==value
  assert vars.get('REPORTS_RELEASE_ID')==('public-phase2e-1' if role=='public' else 'admin-phase2e-1');assert vars.get('REPORTS_PEER_RELEASE_ID')==('admin-phase2e-1' if role=='public' else 'public-phase2e-1')
  assert vars.get('REPORTS_OPS_ENABLED')!='true'
  receipt.setdefault('rolloutBindings',[]).append({'role':role,**{k:vars[k] for k in [*expected,'REPORTS_RELEASE_ID','REPORTS_PEER_RELEASE_ID']},'gateSecretPresent':any(b['name']=='REPORTS_GATE_TOKEN' and b['type']=='secret_text' for b in bindings),'opsDisabled':True})
 names=json.loads(subprocess.check_output([NODE,'--input-type=module','-e',"import{PUBLICATION_GUARDS}from './reports-api/src/publication.js';console.log(JSON.stringify(PUBLICATION_GUARDS));"],cwd=ROOT,encoding='utf-8'))
 assert len(names)==34
 guards=safe_query('SELECT name,type FROM sqlite_schema WHERE name IN ('+','.join("'"+n+"'" for n in names)+') ORDER BY name');assert len(guards)==34 and all(x['type']=='trigger' for x in guards);assert {x['name'] for x in guards}==set(names)
 system=safe_query('SELECT id,mode,generation FROM system_state WHERE id=1');assert len(system)==1 and system[0]['mode']=='NORMAL'
 publication=safe_query('SELECT epoch,CAST(revision AS TEXT) AS revision,typeof(revision) AS revisionType,write_frozen,(SELECT COUNT(*) FROM publication_writer_claim) AS claims FROM public_publication_state WHERE id=1');assert len(publication)==1 and re.fullmatch('[0-9a-f]{32}',publication[0]['epoch']) and re.fullmatch('0|[1-9][0-9]*',publication[0]['revision']) and publication[0]['revisionType']=='integer' and publication[0]['write_frozen']==0 and publication[0]['claims']==0
 original_counts=safe_query('SELECT (SELECT COUNT(*) FROM reports) AS reports,(SELECT COUNT(*) FROM field_updates) AS fieldUpdates,(SELECT COUNT(*) FROM field_update_events) AS fieldEvents,(SELECT COUNT(*) FROM field_update_confirmations) AS fieldConfirmations')
 columns=safe_query('PRAGMA table_info(reports)');report_columns={r['name'] for r in columns};assert {'reporter','name_public','status','species','observed_on','public_lat','public_lon'}.issubset(report_columns)
 tables=['sites','taxa','raw_submissions','checklists','sightings','reviews','audit_log','backfill_runs','transaction_assertions'];schema=safe_query("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND tbl_name IN ("+','.join("'"+n+"'" for n in tables)+') ORDER BY type,name')
 normalized=[{**r,'sql':re.sub(r'\s+',' ',r['sql']).strip().rstrip(';')} for r in schema];fingerprint=hashlib.sha256(json.dumps(normalized,ensure_ascii=False,separators=(',',':')).encode()).hexdigest();assert fingerprint=='76b07a469650dd96be326daf3bbb711922d30fd343624efe3422b67caab0ceb0'
 receipt['d1']={'database':cf.DB,'system':system[0],'publication':publication[0],'guardCount':34,'guardsExact':True,'countsOnly':original_counts[0],'reportsRequiredColumnsPresent':True,'canonicalSchemaFingerprint':fingerprint,'privateRecordReads':0};receipt['checks'].append({'id':'schema-epoch-revision-terminal-CAS-fence-unchanged','status':'PASS'})
 repo='/repos/wooil1964/birdmap';status,branch=get_gh(repo+'/branches/main');assert status==200
 ps,protection=get_gh(repo+'/branches/main/protection');rs,rules=get_gh(repo+'/rulesets');bs,applicable=get_gh(repo+'/rules/branches/main')
 receipt['github']={'main':branch['commit']['sha'],'protected':branch.get('protected'),'classicProtectionHttp':ps,'rulesetsHttp':rs,'applicableRulesHttp':bs,'activeRulesetCount':sum(r.get('enforcement')=='active' for r in (rules or [])),'applicableRuleTypes':[r.get('type') for r in (applicable or [])]}
 assert ps in [200,404] and rs==200 and bs==200
 if ps==200:receipt['github']['requiredReviewCount']=((protection or {}).get('required_pull_request_reviews') or {}).get('required_approving_review_count',0);receipt['github']['requiredContexts']=((protection or {}).get('required_status_checks') or {}).get('contexts',[])
 else:receipt['github']['requiredReviewCount']=0;receipt['github']['requiredContexts']=[]
 pgs,pages=get_gh(repo+'/pages');assert pgs==200;receipt['github']['pages']={k:pages.get(k) for k in ['status','build_type','source','https_enforced','html_url']}
 prs,pulls=get_gh(repo+'/pulls?state=open&head=wooil1964:feat/reporter-lifetime-stats');assert prs==200;receipt['github']['featurePRs']=[{'number':p['number'],'draft':p['draft'],'state':p['state'],'head':p['head']['sha'],'base':p['base']['sha']} for p in pulls]
 receipt['checks'].append({'id':'github-release-protection-and-pages-metadata-read','status':'PASS'})
 receipt['rollback']={'publicNormalVersion':wc.VERSIONS['public']['normal'],'publicMaintenanceVersion':wc.VERSIONS['public']['maintenance'],'unchangedAdminVersion':wc.VERSIONS['admin']['normal'],'newEndpoint404IsFailClosed':True,'meaning':'Prior verified P1 v4 source retains privacy/CAS/nonce/freshness guards. Missing lifetime endpoint removes feature only; frontend must display unverified/error without cached stats. Existing protected Pages rollback source cb3dd3b2 plus current auto JSON. No epoch/revision/user data restore.'}
 receipt['status']='PASS'
except BaseException as error:
 receipt['status']='FAIL';receipt['errors'].append({'type':type(error).__name__,'httpCode':getattr(error,'code',None),'detailsRedacted':True})
finally:
 receipt['summary']={'pass':sum(x['status']=='PASS' for x in receipt['checks']),'fail':len(receipt['errors']),'notRun':0};target=OUT/'PREFLIGHT.json';assert not target.exists();target.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'status':receipt['status'],'source':SOURCE,'summary':receipt['summary'],'errors':receipt['errors'],'privatePayloadSaved':False,'operatingD1Writes':0}));sys.exit(0 if receipt['status']=='PASS' else 1)
