import argparse,base64,ctypes,datetime,hashlib,json,pathlib,sqlite3,sys,time,tomllib,re,os,urllib.parse,urllib.request,urllib.error
from ctypes import wintypes
ACCOUNT="1d697c22a32447b386b9fac6a3538597"
DB="b48201cc-0abd-4a64-bb61-9dd2a7813d21"
DEST=pathlib.Path("C:/Users/김진호/.codex/deployment-backups/birdmap-p1")
ENTROPY=("birdmap-p1-current-user:"+ACCOUNT+":"+DB).encode()
STAGE="init"
if not __debug__:print("{\"status\":\"FAIL\",\"stage\":\"optimized_python_forbidden\"}");sys.exit(1)
class BLOB(ctypes.Structure):
 _fields_=[("cbData",wintypes.DWORD),("pbData",ctypes.POINTER(ctypes.c_ubyte))]
def blob(b):
 buf=ctypes.create_string_buffer(b);return BLOB(len(b),ctypes.cast(buf,ctypes.POINTER(ctypes.c_ubyte))),buf
def dpapi(data,decrypt=False):
 crypt=ctypes.WinDLL("crypt32",use_last_error=True);kernel=ctypes.WinDLL("kernel32",use_last_error=True)
 inp,ib=blob(data);entropy,eb=blob(ENTROPY);out=BLOB()
 fn=crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
 fn.argtypes=[ctypes.POINTER(BLOB),ctypes.c_void_p,ctypes.POINTER(BLOB),ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(BLOB)];fn.restype=wintypes.BOOL
 kernel.LocalFree.argtypes=[ctypes.c_void_p];kernel.LocalFree.restype=ctypes.c_void_p
 if not fn(ctypes.byref(inp),None,ctypes.byref(entropy),None,None,1,ctypes.byref(out)):raise OSError(ctypes.get_last_error())
 try:return ctypes.string_at(out.pbData,out.cbData)
 finally:kernel.LocalFree(out.pbData)
class NoAuthRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  raise urllib.error.HTTPError(req.full_url,code,"Authenticated API redirect forbidden",headers,fp)
class HttpsOnlyRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  if urllib.parse.urlsplit(newurl).scheme!="https":raise urllib.error.HTTPError(req.full_url,code,"Download downgrade forbidden",headers,fp)
  result=super().redirect_request(req,fp,code,msg,headers,newurl)
  if result:
   result.remove_header("Authorization");result.remove_header("Cookie")
  return result
def api(path,body=None):
 token=tomllib.loads(pathlib.Path("C:/Users/김진호/AppData/Roaming/xdg.config/.wrangler/config/default.toml").read_text(encoding="utf-8"))["oauth_token"]
 req=urllib.request.Request("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+path,data=None if body is None else json.dumps(body).encode(),headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
 with urllib.request.build_opener(NoAuthRedirect()).open(req,timeout=45) as response:result=json.load(response)
 if not result.get("success"):raise RuntimeError("CF_API_FAILURE")
 return result["result"]
def query(sql):
 result=api("/d1/database/"+DB+"/query",{"sql":sql})
 assert len(result)==1 and result[0].get("success") is True and result[0]["meta"].get("rows_written",0)==0
 return result[0]["results"]
def sql_tokens(sql):
 parts=re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|\[[^\]]*\]|`[^`]*`|--[^\n]*|/\*.*?\*/|[A-Za-z_][A-Za-z0-9_]*|[^\s]",sql,flags=re.S)
 out=[]
 for token in parts:
  if token.startswith("--") or token.startswith("/*"):continue
  if token.startswith("'"):out.append(token);continue
  if token.startswith(('"','[','`')):
   ident=token[1:-1]
   if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*",ident):token=ident
  out.append(token.lower())
 while out and out[-1]==";":out.pop()
 return out
def restore(sql,catalog):
 con=sqlite3.connect(":memory:");con.execute("PRAGMA temp_store=MEMORY");con.enable_load_extension(False)
 def auth(action,a,b,c,d):
  if action in [sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH]:return sqlite3.SQLITE_DENY
  if action==sqlite3.SQLITE_PRAGMA:
   key=(a or "").lower()
   read_only={"table_info","table_xinfo","index_list","index_info","index_xinfo","integrity_check","foreign_key_check","quick_check"}
   if key in read_only:return sqlite3.SQLITE_OK
   if key in {"foreign_keys","defer_foreign_keys","recursive_triggers"} and (b is None or b.lower() in {"0","1","on","off","true","false"}):return sqlite3.SQLITE_OK
   if key=="temp_store" and (b is None or b.lower() in {"memory","2"}):return sqlite3.SQLITE_OK
   return sqlite3.SQLITE_DENY
  if action==sqlite3.SQLITE_FUNCTION and (b or a or "").lower() in ["load_extension","readfile","writefile"]:return sqlite3.SQLITE_DENY
  return sqlite3.SQLITE_OK
 con.set_authorizer(auth);con.executescript(sql)
 actual={r[0] for r in con.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
 expected={r["name"] for r in catalog if r["type"]=="table" and not r["name"].startswith("_cf_")}
 assert expected.issubset(actual),"RESTORE_MISSING_TABLES"
 # D1 SQL export may omit indexes/triggers. Restore their captured metadata in memory only.
 for item in catalog:
  if item["type"] in ["index","trigger","view"] and item.get("sql") and not con.execute("SELECT 1 FROM sqlite_schema WHERE type=? AND name=?",(item["type"],item["name"])).fetchone():con.execute(item["sql"])
 for item in catalog:
  if item.get("sql") and not item["name"].startswith("_cf_"):
   got=con.execute("SELECT sql FROM sqlite_schema WHERE type=? AND name=?",(item["type"],item["name"])).fetchone()
   assert got and sql_tokens(got[0])==sql_tokens(item["sql"]),"RESTORE_METADATA_MISMATCH"
 assert con.execute("PRAGMA temp_store").fetchone()==(2,),"RESTORE_TEMP_NOT_MEMORY"
 assert con.execute("PRAGMA integrity_check").fetchall()==[("ok",)]
 fk=con.execute("PRAGMA foreign_key_check").fetchall();assert not fk,"RESTORE_FK_VIOLATION"
 digest=hashlib.sha256();counts={}
 for table in sorted(expected):
  qt='"'+table.replace('"','""')+'"'
  cols=[r[1] for r in con.execute("PRAGMA table_info("+qt+")")]
  rows=con.execute("SELECT * FROM "+qt).fetchall();counts[table]=len(rows)
  encoded=sorted(json.dumps(row,ensure_ascii=False,separators=(",",":"),default=lambda b:{"base64":base64.b64encode(b).decode()}) for row in rows)
  digest.update(json.dumps([table,cols,encoded],ensure_ascii=False,separators=(",",":")).encode())
 return con,counts,digest.hexdigest()
def main():
 global STAGE
 arg=argparse.ArgumentParser();arg.add_argument("--phase",required=True);arg.add_argument("--receipt",required=True);args=arg.parse_args()
 assert args.phase in ["initial","writer-frozen","post-migration","final-operating"]
 receipt=pathlib.Path(args.receipt);assert not receipt.exists()
 STAGE="schema_read";catalog=query("SELECT name,type,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")
 STAGE="export_start";body={"output_format":"polling","dump_options":{"no_schema":False,"no_data":False}};result=api("/d1/database/"+DB+"/export",body)
 for attempt in range(24):
  if result.get("status")=="complete":break
  if result.get("status")=="error":raise RuntimeError("EXPORT_FAILED")
  bookmark=result.get("at_bookmark");assert bookmark
  time.sleep(2);result=api("/d1/database/"+DB+"/export",{"output_format":"polling","current_bookmark":bookmark})
 else:raise TimeoutError("EXPORT_TIMEOUT")
 STAGE="memory_download";url=result["result"]["signed_url"];assert url.startswith("https://")
 # Signed URL request deliberately has no Cloudflare Authorization header.
 with urllib.request.build_opener(HttpsOnlyRedirect()).open(urllib.request.Request(url),timeout=60) as response:sql_bytes=response.read(32*1024*1024+1)
 assert len(sql_bytes)<=32*1024*1024 and sql_bytes
 STAGE="schema_snapshot_consistency"
 catalog_after=query("SELECT name,type,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")
 assert catalog_after==catalog,"BACKUP_SCHEMA_CHANGED"
 STAGE="memory_sqlite_restore";con,counts,digest=restore(sql_bytes.decode("utf-8-sig"),catalog)
 envelope={"format":"birdmap-private-d1-backup-v1","at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"account":ACCOUNT,"database":DB,"phase":args.phase,"bookmark":result.get("at_bookmark"),"schema":catalog,"sqlBase64":base64.b64encode(sql_bytes).decode(),"restoredCounts":counts,"logicalDigest":digest,"sqlSha256":hashlib.sha256(sql_bytes).hexdigest()}
 plain=json.dumps(envelope,ensure_ascii=False,separators=(",",":")).encode()
 STAGE="dpapi_encrypt";cipher=dpapi(plain);DEST.mkdir(parents=True,exist_ok=True)
 file=DEST/(datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")+"-"+args.phase+".dpapi")
 with file.open("xb") as stream:stream.write(cipher);stream.flush();os.fsync(stream.fileno())
 STAGE="disk_cipher_memory_restore";decrypted=dpapi(file.read_bytes(),True);assert decrypted==plain
 restored=json.loads(decrypted);con2,counts2,digest2=restore(base64.b64decode(restored["sqlBase64"]).decode("utf-8-sig"),restored["schema"])
 assert counts2==counts and digest2==digest
 con.close();con2.close()
 record={"helperSourceSha256":hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),"at":envelope["at"],"phase":args.phase,"status":"PASS","database":DB,"bookmark":envelope["bookmark"],"encryptedPath":str(file),"cipherSha256":hashlib.sha256(cipher).hexdigest(),"cipherBytes":len(cipher),"plaintextFilesWritten":0,"privatePayloadLogged":False,"exactDecryptionMatch":True,"sqliteIntegrity":"ok","fkViolations":0,"restoredTables":len(counts),"restoredTotalRows":sum(counts.values()),"schemaMetadataCapturedAndRestored":True,"schemaMetadataExactNormalizedMatch":True,"schemaBeforeAfterExportEqual":True,"tempStoreMemoryEnforced":True,"loadExtensionDisabled":True,"apiRedirectsForbidden":True,"signedDownloadHttpsOnlyNoAuth":True,"cipherFileFsync":True,"logicalDigestMatched":True,"scope":"Explicit user authorization; full private D1 read-only export, CurrentUser DPAPI disk storage, memory-only SQLite restoration; operating DB writes0"}
 receipt.parent.mkdir(parents=True,exist_ok=True);receipt.write_bytes((json.dumps(record,ensure_ascii=False,indent=2)+"\n").encode())
 print(json.dumps({k:record[k] for k in ["phase","status","cipherBytes","plaintextFilesWritten","exactDecryptionMatch","sqliteIntegrity","fkViolations","restoredTables","logicalDigestMatched"]}))
if __name__=="__main__":
 try:main()
 except BaseException as error:
  # Never emit request URLs, SQL, DB content, API bodies or exceptions containing data.
  print(json.dumps({"status":"FAIL","stage":STAGE,"errorType":type(error).__name__,"httpCode":getattr(error,"code",None),"sqliteErrorName":getattr(error,"sqlite_errorname",None)}));sys.exit(1)
