import argparse,datetime,hashlib,json,pathlib,sys,urllib.error
from backup_readonly_dpapi import api,query,DB
ROOT=pathlib.Path.cwd();OUT=ROOT/"docs/p1-paid-deployment/cutover-20261014"
VERSIONS={"public":{"worker":"birdmap-reports","normal":"f1f24698-8388-4f36-ae31-38f2dd8e9446","maintenance":"7e398695-aad7-4e58-962c-034513776960"},"admin":{"worker":"birdmap-reports-admin","normal":"a7723404-a3c2-4739-91ff-44049e1302cb","maintenance":"11e97856-990e-4a17-9c28-f18cf92ca46d"}}
if not __debug__:sys.exit("optimized_python_forbidden")
def verify(role,mode):
 w=VERSIONS[role];r=api("/workers/scripts/"+w["worker"]+"/versions/"+w[mode]);resources=r["resources"];bindings=resources["bindings"]
 vars={b["name"]:b.get("text") for b in bindings if b["type"]=="plain_text"};names={b["name"] for b in bindings}
 assert vars["REPORTS_PUBLICATION_REQUIRED"]=="true" and vars["ENVIRONMENT"]=="production"
 assert vars["REPORTS_WRITE_MODE"]==("READ_ONLY_MAINTENANCE" if mode=="maintenance" else "CANONICAL_DUAL_WRITE")
 assert "PUBLICATION_ROOM" not in names and "REPORTS_GATE_TOKEN" in names and vars.get("REPORTS_OPS_ENABLED")!="true"
 binding=next(b for b in bindings if b["name"]=="REPORTS_DB");assert binding["id"]==DB
 peer=next(b for b in bindings if b["name"]=="REPORTS_PEER");assert peer["service"]==VERSIONS["admin" if role=="public" else "public"]["worker"]
 assert "9f8f8954314ef16ee60433d77fca58099f6a4108" in r["annotations"]["workers/message"]
 sub=api("/workers/scripts/"+w["worker"]+"/subdomain");assert sub["previews_enabled"] is False
 return {"worker":w["worker"],"role":role,"mode":mode,"versionId":w[mode],"previewOff":True,"publicationRequired":True,"operatingD1BindingVerified":True,"peerVerified":True,"annotationSource":"9f8f8954314ef16ee60433d77fca58099f6a4108"}
def active(role):
 w=VERSIONS[role];r=api("/workers/scripts/"+w["worker"]+"/deployments");d=r["deployments"][0]
 return {"worker":w["worker"],"deploymentId":d["id"],"versions":d["versions"]}
def main():
 p=argparse.ArgumentParser();p.add_argument("--action",choices=["read","maintenance","normal"],required=True);p.add_argument("--receipt",required=True);a=p.parse_args();out=pathlib.Path(a.receipt);assert not out.exists()
 record={"at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"action":a.action,"standbys":[verify(r,m) for r in ["public","admin"] for m in ["normal","maintenance"]],"before":[active(r) for r in ["public","admin"]],"realUserMutations":0,"privatePayloadSaved":False}
 record["systemState"]=query("SELECT id,mode,generation FROM system_state WHERE id=1")
 if a.action!="read":
  backup=json.loads((OUT/"INITIAL_BACKUP_HARDENED.json").read_text(encoding="utf-8"));assert backup["status"]=="PASS" and backup["cipherFileFsync"] and backup["schemaMetadataExactNormalizedMatch"]
  if a.action=="normal":
   ready=json.loads((OUT/"THAW_VERIFIED.json").read_text(encoding="utf-8"));assert ready["status"]=="PASS"
  record["deployed"]=[]
  for role in ["admin","public"]:
   w=VERSIONS[role];payload={"strategy":"percentage","versions":[{"version_id":w[a.action],"percentage":100}],"annotations":{"workers/message":"Approved P1 protective "+a.action+" cutover; writer fence v4; preserve data"}}
   d=api("/workers/scripts/"+w["worker"]+"/deployments",payload);after=active(role)
   assert after["versions"]==[{"version_id":w[a.action],"percentage":100}]
   record["deployed"].append({"worker":w["worker"],"deploymentId":d["id"],"versionId":w[a.action],"percentage":100})
   # Persist after each step to recover from interruption/partial paired transition.
   interim=out.with_name(out.stem+"-"+role+"-APPLIED.json");assert not interim.exists();interim.write_bytes((json.dumps(record,ensure_ascii=False,indent=2)+"\n").encode())
 record["after"]=[active(r) for r in ["public","admin"]];record["status"]="PASS"
 out.write_bytes((json.dumps(record,ensure_ascii=False,indent=2)+"\n").encode())
 print(json.dumps({"status":"PASS","action":a.action,"active":record["after"],"realUserMutations":0}))
if __name__=="__main__":
 try:main()
 except BaseException as e:print(json.dumps({"status":"FAIL","errorType":type(e).__name__,"httpCode":getattr(e,"code",None),"privatePayloadLogged":False}));sys.exit(1)
