"""Independent capacity calculation: observational inputs only, no product or operational changes."""
import json, math, hashlib, subprocess, sys
from pathlib import Path
new_dir, old_dir, native_new_path, native_old_path, repo, output_path, required_sha = map(str, sys.argv[1:8])
new_dir, old_dir, repo, output_path = map(Path, [new_dir, old_dir, repo, output_path])
checks=[]
def require(condition, name):
    if not condition: raise AssertionError(name)
    checks.append(name)
def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))
def number(value,name):
    require(type(value) in (float,int) and math.isfinite(value),name)
    return value
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
manifest=load(new_dir/"LOAD_MANIFEST.json")
new=load(new_dir/"LOAD_COMPARISON.json")
old=load(old_dir/"LOAD_COMPARISON.json")
sql_new,sql_old=load(native_new_path),load(native_old_path)
base_file=repo/"docs/p1-publication-final-audit/operations/FREE_CAPACITY_BUDGET.json"
baseline_doc=load(base_file)
baseline=baseline_doc["baseline"]
require(new["sourceSha"]==required_sha,"exact final normalized Chrome SHA")
require(manifest["sourceInput"]==required_sha,"exact final raw Chrome SHA")
require(manifest["summary"]["fail"]==0,"final Chrome safety failures zero")
require(manifest["network"]["operatingRequests"]==0,"production API requests zero")
require(manifest["network"]["externalNonGet"]==0,"external mutations zero")
require(manifest["browserErrors"]==[],"Chrome errors zero")
source_sql=subprocess.check_output(["git","show",required_sha+":reports-api/src/publication.js"],cwd=repo)
native_archive=Path(native_new_path).parent/"source/reports-api/src/publication.js"
measured_sql=native_archive.read_bytes()
require(hashlib.sha256(measured_sql).hexdigest()==sql_new["productPublicationSha256"],"physical measured server bytes match native receipt")
require(source_sql==measured_sql or (b"\r" not in source_sql and source_sql.replace(b"\n",b"\r\n")==measured_sql),"server measured archive differs only by exact LF to CRLF conversion")
byte_variant_proof={"canonicalGitLfSha256":hashlib.sha256(source_sql).hexdigest(),"measuredArchiveSha256":hashlib.sha256(measured_sql).hexdigest(),"canonicalBytes":len(source_sql),"measuredBytes":len(measured_sql),"exactLfToCrLfOnly":source_sql!=measured_sql}
old_index=subprocess.check_output(["git","show","c025d75f964ab36f6f2eae541a99461f6de59b70:index.html"],cwd=repo)
require(hashlib.sha256(old_index).hexdigest()==old["indexSha256"],"old Chrome index bytes equal c025 basis")
def sqlcost(doc):
    require(doc["summary"]["fail"]==0,"native source observations valid "+doc["sourceSha"])
    head=doc["observed"]["secondHead"]["readCounts"]
    require(len(head)==1,"one observed native steady HEAD cost")
    costs={"/reports/public-state":head[0]}
    for row in doc["observed"]["payloads"]:
        require(row["rowsWritten"]==0,"native payload no writes "+row["path"])
        costs[row["path"]]=row["rowsRead"]
    return costs
warm_cost,old_cost=sqlcost(sql_new),sqlcost(sql_old)
cold_cost=sql_new["observed"]["firstHead"]["readCounts"][0]
cold_extra=cold_cost-warm_cost["/reports/public-state"]
require(cold_extra>=0,"cold surcharge nonnegative")
def weight(counts,cost):
    result=0
    for path,n in counts.items():
        require(path in cost,"known SQL endpoint "+path)
        require(type(n) is int and n>=0,"request integer count "+path)
        result+=n*cost[path]
    return result
def normalize_raw(directory,comparison):
    users=comparison["users"];raw=load(directory/("cohort-"+str(users)+".json"))
    require(len(raw["records"])==users,"raw client count"+str(users))
    window=next(x for x in raw["phaseBounds"] if x["name"]=="steady-foreground")
    initial,steady,outside,durations=[],[],[],[]
    for index,record in enumerate(raw["records"]):
        rows=record["requests"];first=number(rows[0]["at"],"first API timestamp")
        cutoff=first+2000;start=max(number(window["start"][index],"raw start"),cutoff);end=number(window["end"][index],"raw end")
        require(end-start>=60000,"each actual normalized exposure >=60s")
        selected=[r for r in rows if r["phase"] in ("bootstrap","waiting-other-clients","steady-foreground")]
        a=[r for r in selected if first<=r["at"]<cutoff]
        b=[r for r in selected if r["phase"]=="steady-foreground" and start<=r["at"]<=end]
        c=[r for r in selected if not(first<=r["at"]<cutoff) and not(r["phase"]=="steady-foreground" and start<=r["at"]<=end)]
        require(len(a)+len(b)+len(c)==len(selected),"independent raw conservation")
        initial+=a;steady+=b;outside+=c;durations.append(end-start)
        for r in b:
            require(r["visibility"]=="visible" and r["hidden"] is False,"foreground actual request")
            require(r["status"]==200 and not r.get("error"),"steady successful request")
    counts=lambda rows:{p:sum(r["path"]==p for r in rows) for p in set(r["path"] for r in rows)}
    require(counts(initial)==comparison["initial2s"]["endpoints"],"independent initial counts match")
    require(counts(steady)==comparison["steady"]["endpoints"],"independent steady counts match")
    require(len(initial)==comparison["initial2s"]["total"],"independent initial total")
    require(len(steady)==comparison["steady"]["total"],"independent steady total")
    duration=sum(durations);require(math.isclose(duration,comparison["steady"]["durationSumMs"],abs_tol=1e-6),"independent exposure denominator")
    require(comparison["sampledUnauthorizedDynamic"]==0,"no sampled unverified dynamic point")
    return {"users":users,"initialCounts":counts(initial),"steadyCounts":counts(steady),"initialTotal":len(initial),"steadyTotal":len(steady),"outsideTotal":len(outside),"sumExposureMs":duration}
limits={"workerRequests":100000,"d1RowsRead":5000000,"d1RowsWritten":100000}
result={"newProductSha":required_sha,"serverByteVariantProof":byte_variant_proof,"oldProductBasis":"c025d75f964ab36f6f2eae541a99461f6de59b70","oldChromeByteEquivalentSource":old["sourceSha"],"mode":"Demand projection from short actual foreground Chrome and native local D1 measurements; no actual production daily billing/quota experiment","baselineAccount24h":baseline,"baselineWindow":baseline_doc["baselineWindow"],"userSuppliedSeparateDashboardWindow":{"D1Queries":1230,"rowsRead":58000,"rowsWritten":496,"storageMB":1.44},"limits":limits,"endpointWarmNew":warm_cost,"endpointOld":old_cost,"coldStateRead":cold_cost,"coldExtraPerPublicationQuery":cold_extra,"sourceTimerModel":{"eventsPerUserHour":6,"payloadCallsPerUserHour":{"approved":6,"pending":6,"recent":6},"additionalHEADBoundPerUserHour":[0,36],"note":"3 lists per10min event =>18 payload calls/h. Lower0 is an optimistic incremental bound allowing overlap with already-counted polls, not an assumed deployment budget. Upper36 treats each payload pre/post as unshared. These are sensitivity bounds, not measured65s traffic or a guaranteed exact head-sharing floor."},"cohorts":[],"headOnly":{"fiveSecondMinimum20x8":115200,"selected4750msNominal20x8":math.ceil(20*8*3600/4.75),"requestLimitExceededEvenWithoutPayloadsInSameUtcQuotaDay":True,"quotaReset":"UTC00:00 / KST09:00","scenarioAllActivityWithinOneQuotaDay":True},"limitations":["Historical baseline is rolling24h, not current UTC remainder; may overlap cohort old-reader traffic.","1h/8h activity is conservatively placed in one UTC quota day; crossingUTC00/KST09 can distribute total over days.","Production catalog object count, dynamic report/field volumes, isolate churn and CPU can differ from synthetic102-object/73-report/3-field fixture.","Fresh isolate/POP churn not measured in production; hot0%,10%,100% cold-query sensitivity shown.","Short Chrome trace lacks10min timer boundary, extra routes/history/contributors and all slow/jitter failures.","Observed field timer rate about55.9/h is below nominal60/h; short-window warm model is not a universal conservative bound.","Recovery sensitivity is independent hypothetical extra episode demand, not observed incidents.","Quota failure changes actual traffic/billing; demand model is not accrued rows.","Current-date weather validator remains unresolved; budget does not turn it into PASS."]}
for comparison in new["comparisons"]:
    require(comparison["users"] in (10,20),"requested cohort size")
    raw=normalize_raw(new_dir,comparison)
    users=raw["users"];duration_hours=raw["sumExposureMs"]/3600000
    request_rate=raw["steadyTotal"]/duration_hours
    read_rate=weight(raw["steadyCounts"],warm_cost)/duration_hours
    initial_reads=weight(raw["initialCounts"],warm_cost)
    prior=next(x for x in old["comparisons"] if x["users"]==users)
    old_raw=normalize_raw(old_dir,prior)
    old_hours=old_raw["sumExposureMs"]/3600000
    old_rate=old_raw["steadyTotal"]/old_hours;old_read_rate=weight(old_raw["steadyCounts"],old_cost)/old_hours
    timer_payload_reads=6*sum(warm_cost[p] for p in ("/reports/approved","/reports/pending","/reports/recent-sites"))
    timer_old_payload_reads=6*sum(old_cost[p] for p in ("/reports/approved","/reports/pending","/reports/recent-sites"))
    item={"users":users,"independentRawAccounting":raw,"measuredRates":{"workerRequestsPerUserHour":request_rate,"D1ReadsPerUserHour":read_rate,"initialReads":initial_reads,"oldWorkerRequestsPerUserHour":old_rate,"oldD1ReadsPerUserHour":old_read_rate,"workerReductionFraction":1-request_rate/old_rate,"D1ReductionFraction":1-read_rate/old_read_rate},"scenarios":[]}
    for hours in (1,8):
        for extra_heads in (0,36):
            timer_requests=18+extra_heads;timer_reads=timer_payload_reads+extra_heads*warm_cost["/reports/public-state"]
            additional_requests=raw["initialTotal"]+(request_rate+timer_requests)*users*hours
            additional_reads=initial_reads+(read_rate+timer_reads)*users*hours
            old_additional_requests=old_raw["initialTotal"]+(old_rate+timer_requests)*users*hours
            old_additional_reads=weight(old_raw["initialCounts"],old_cost)+(old_read_rate+timer_old_payload_reads+extra_heads*old_cost["/reports/public-state"])*users*hours
            for cold_fraction in (0,0.1,1):
                requested=baseline["workerRequests"]+additional_requests
                reads=baseline["d1RowsRead"]+additional_reads+additional_requests*cold_fraction*cold_extra
                item["scenarios"].append({"activeHoursEach":hours,"extraTimerHeadsPerUserHour":extra_heads,"coldPublicationQueryFraction":cold_fraction,"workerRequests":math.ceil(requested),"D1RowsRead":math.ceil(reads),"D1RowsWritten":baseline["d1RowsWritten"],"workerExceeded":requested>limits["workerRequests"],"D1ReadExceeded":reads>limits["d1RowsRead"],"oldSameTimerWorkerRequests":math.ceil(baseline["workerRequests"]+old_additional_requests),"oldSameTimerD1RowsRead":math.ceil(baseline["d1RowsRead"]+old_additional_reads)})
            for episodes in (6,60):
                per_episode_requests=12
                per_episode_reads=sum(warm_cost[p] for p in ("/reports/approved","/reports/pending","/reports/recent-sites","/field-updates"))+8*warm_cost["/reports/public-state"]
                item["scenarios"].append({"sensitivityOnly":"Extra slow/jitter fail-closed full-refresh episodes, unshared upper cost, hot SQL","activeHoursEach":hours,"extraTimerHeadsPerUserHour":extra_heads,"extraRecoveryEpisodesPerUserHour":episodes,"workerRequests":math.ceil(baseline["workerRequests"]+additional_requests+per_episode_requests*episodes*users*hours),"D1RowsRead":math.ceil(baseline["d1RowsRead"]+additional_reads+per_episode_reads*episodes*users*hours)})
    result["cohorts"].append(item)
result["verdict"]="BLOCKED — 20 users ×8 hours within one UTC quota day exceeds the Free Worker request limit independently of SQL optimization; no operational approval."
result["inputHashes"]={str(p):sha(p) for p in (new_dir/"LOAD_COMPARISON.json",new_dir/"LOAD_MANIFEST.json",old_dir/"LOAD_COMPARISON.json",Path(native_new_path),Path(native_old_path),base_file)}
result["independentChecks"]={"pass":len(checks),"fail":0,"checks":checks}
output_path.parent.mkdir(parents=True,exist_ok=True);output_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
print(json.dumps({"cohorts":[{"users":c["users"],"rates":c["measuredRates"],"hotConservative":[s for s in c["scenarios"] if s.get("coldPublicationQueryFraction")==0 and s["extraTimerHeadsPerUserHour"]==36]} for c in result["cohorts"]],"checks":len(checks),"verdict":result["verdict"]},ensure_ascii=False,indent=2))


