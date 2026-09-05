/* Optional personal cloud controls. Authentication never starts ledger transfer. */
// Public browser configuration from this project's Supabase dashboard. Not a server/admin secret.
window.MyfinCloudDefaults=Object.freeze({url:'https://wmjbbuplqvxjcqevggux.supabase.co',key:'sb_publishable__1vlXA5hx8JwQqBH__sOEg_OGzDLFlH'});
function cloudAuthClient(){
  if(!window.MyfinCloudAuth)throw new Error('login-unavailable');
  if(!window._cloudAuthClient)window._cloudAuthClient=MyfinCloudAuth.createClient({onChange:function(){cloudPauseSession();renderCloudAuth();}});
  return window._cloudAuthClient;
}
function cloudPauseSession(){
  window._cloudAuthApproved=false;window._cloudPreview=null;window._cloudEpoch=(window._cloudEpoch||0)+1;
  window._cloudOperation=null;clearTimeout(window._cloudT);
  const box=document.getElementById('cloud-preview');if(box)box.hidden=true;
}
function cloudMessage(message){const el=document.getElementById('cloud-auth-message');if(el)el.textContent=message;}
function cloudAuthError(error){
  const code=error.code||error.message;
  const messages={
    'invalid-project':'服務網址不正確，請檢查進階設定。','public-key-required':'請使用 publishable／anon 公開金鑰，不能使用 secret／service-role 金鑰。',
    'invalid_credentials':'電郵或密碼不正確。','email_not_confirmed':'請先到電郵確認帳戶，再回來登入。','rate-limited':'嘗試次數過多，請稍後再試。',
    'over_email_send_rate_limit':'確認電郵發送太頻密，請稍後再試。','email_address_not_authorized':'目前郵件服務只接受項目管理員電郵，其他電郵要先設定寄信服務。',
    'weak_password':'登入服務未接受這個密碼，請改用較長、較難猜的密碼；最少 6 個字元。',
    'login-required':'請先登入 Myfin。','auth-cancelled':'登入狀態已改變，這次操作已取消。','login-unavailable':'登入元件未能載入；本機記帳仍可使用。連線後重新整理再試。',
    'preview-stale':'資料或登入狀態已改變，請重新預覽。','vault-exists':'這個雲端帳本已有資料。請用「預覽接收」，或選另一個帳本代號。',
    'vault-missing':'找不到這個雲端帳本。請先在主要裝置建立副本，並核對兩邊的帳本代號。',
    'sync-unavailable':'雲端資料表尚未就緒或權限不符；本機資料沒有更改。','decrypt-failed':'解密失敗，請核對兩部裝置的帳本加密密語。',
    'local-save-failed':'本機儲存失敗，已停止。請先下載備份；不要清除網站資料。','vault-race':'雲端版本已改變，請重新預覽。'
  };
  return messages[code]||'未能完成，請檢查網絡及設定後再試。本機帳目不會因登入失敗而被清除。';
}
function renderCloudAuth(){
  const el=document.getElementById('cloud-auth-state');if(!el)return;
  const status=window._cloudAuthClient?.status(),signed=!!status?.userId;
  el.textContent=signed?'已登入 '+status.email+' · '+(window._cloudAuthApproved?'本分頁同步已啟用':'同步未啟用'):'未登入 · 本機記帳照常使用';
  document.getElementById('cloud-login-form').hidden=signed;
  document.getElementById('cloud-signout').hidden=!signed;
  document.getElementById('cloud-first-actions').hidden=!signed;
  document.getElementById('cloud-resume').textContent=window._cloudAuthApproved?'暫停本分頁同步':'啟用已連結帳本的同步';
}
function cloudFormConfig(){
  const get=id=>document.getElementById(id).value;
  const valid=cloudAuthClient().validateConfig(get('cloud-url'),get('cloud-key'));
  return {url:valid.url,key:valid.key,pass:get('cloud-pass'),vaultId:get('cloud-vault').trim()};
}
function cloudSaveSettings(){
  try{
    const next=cloudFormConfig(),c=cloudCfg();
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(next.vaultId))throw new Error('invalid-vault');
    // Changing a linked destination or encryption password requires a fresh first-sync preview.
    const same=['url','key','pass','vaultId'].every(k=>c[k]===next[k]);
    cloudPauseSession();
    const updated=Object.assign({},c,next,{on:false},same?{}:{linked:false,userId:'',ver:0,last:0,salt:'',pending:false,_dirty:false});
    S.cloud=updated;
    if(!persistCloudMeta()){S.cloud=c;throw new Error('local-save-failed');}
    cloudAuthClient().configure(next.url,next.key);
    cloudMessage('設定已儲存，沒有傳送帳目。登入密碼與帳本加密密語是兩回事。');renderCloudAuth();return true;
  }catch(error){cloudMessage(error.message==='invalid-vault'?'帳本代號請用英文字母、數字、- 或 _（例如 main）。':cloudAuthError(error));return false;}
}
async function cloudLoginAction(signup){
  if(window._cloudLoginBusy)return;
  const email=document.getElementById('cloud-email'),password=document.getElementById('cloud-password');
  if(!email.checkValidity()||!email.value.trim()||!password.value){cloudMessage('請填寫有效電郵及登入密碼。');return;}
  if(signup&&password.value.length<6){cloudMessage('新帳戶密碼請至少 6 個字元。');return;}
  if(signup&&!confirm('以這個電郵建立 Myfin 帳戶並發送確認電郵？這不會上傳任何帳目。'))return;
  window._cloudLoginBusy=true;document.querySelectorAll('[data-cloud-login]').forEach(el=>el.disabled=true);
  try{
    if(!cloudSaveSettings())return;
    const client=cloudAuthClient();cloudMessage(signup?'正在建立帳戶…':'正在登入…');
    if(signup){const result=await client.signUp(email.value,password.value,location.origin+location.pathname);cloudMessage(result.confirmationRequired?'請到電郵按確認連結，再回到這裡登入。若收不到信，先檢查垃圾郵件；目前預設郵件服務只接受項目管理員電郵。':'帳戶已建立，請按登入。沒有上傳帳目。');}
    else{await client.signIn(email.value,password.value);cloudMessage('登入成功。未有上傳或接收帳目，請選擇下面的預覽。');}
  }catch(error){cloudMessage(cloudAuthError(error));}
  finally{password.value='';window._cloudLoginBusy=false;document.querySelectorAll('[data-cloud-login]').forEach(el=>el.disabled=false);renderCloudAuth();}
}
async function cloudLogoutAction(){
  cloudPauseSession();renderCloudAuth();await cloudAuthClient().signOut();cloudMessage('已登出，這部裝置的帳目全部保留。');renderCloudAuth();
}
function cloudFirstContext(){
  if(window._storageReadOnly)throw new Error('local-save-failed');
  const c=cloudCfg(),form=cloudFormConfig(),client=cloudAuthClient(),status=client.status();
  if(!status.userId||status.projectUrl!==c.url)throw new Error('login-required');
  if(!['url','key','pass','vaultId'].every(k=>c[k]===form[k]))throw new Error('preview-stale');
  if(c.pass.length<12)throw new Error('passphrase-short');
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(c.vaultId))throw new Error('invalid-vault');
  return {config:Object.assign({},c,{userId:status.userId}),userId:status.userId,authEpoch:status.epoch,epoch:window._cloudEpoch||0,key:profileKey(),state:S,content:cloudContent()};
}
function cloudPreviewCurrent(preview){
  const c=cloudCfg(),s=window._cloudAuthClient?.status();
  return window._cloudPreview===preview&&S===preview.state&&profileKey()===preview.key&&(window._cloudEpoch||0)===preview.epoch&&s?.userId===preview.userId&&s.epoch===preview.authEpoch&&s.projectUrl===preview.config.url&&['url','key','pass','vaultId'].every(k=>{const value=document.getElementById({'url':'cloud-url','key':'cloud-key','pass':'cloud-pass','vaultId':'cloud-vault'}[k]).value;return c[k]===preview.config[k]&&c[k]===(k==='pass'?value:value.trim());})&&cloudContent()===preview.content;
}
async function cloudFetchVault(config){
  const response=await cloudApi(cloudPath(config)+'&select=ver,salt,iv,data',undefined,config);
  if(!response.ok)throw new Error('sync-unavailable');
  const rows=await response.json();if(!Array.isArray(rows)||rows.length>1)throw new Error('sync-unavailable');
  if(rows.length&&(!Number.isSafeInteger(rows[0].ver)||rows[0].ver<1))throw new Error('sync-unavailable');
  return rows[0]||null;
}
async function cloudPreviewFirst(direction){
  if(window._cloudFirstBusy)return;
  cloudPauseSession();renderCloudAuth();window._cloudFirstBusy=true;
  try{
    const p=cloudFirstContext();p.direction=direction;window._cloudPreview=p;cloudMessage('正在讀取雲端狀態；尚未搬移帳目…');
    p.row=await cloudFetchVault(p.config);
    if(!cloudPreviewCurrent(p))throw new Error('preview-stale');
    if(direction==='upload'){
      if(p.row)throw new Error('vault-exists');p.data=validateProfileData(JSON.parse(p.content));
    }else{
      if(!p.row)throw new Error('vault-missing');
      let plain;try{plain=await cloudDecrypt(p.row.iv,p.row.data,p.row.salt,p.config);}catch(_){throw new Error('decrypt-failed');}
      if(!cloudPreviewCurrent(p))throw new Error('preview-stale');p.data=validateProfileData(JSON.parse(plain));
    }
    const box=document.getElementById('cloud-preview'),summary=document.getElementById('cloud-preview-summary');
    summary.textContent=(direction==='upload'?'將目前本機帳本建立為新的加密雲端副本。':'將雲端帳本接收為另一份本機副本，不取代目前帳本。')+'\n帳本代號：'+p.config.vaultId+'\n帳戶：'+p.data.accounts.length+' 個 · 記錄：'+p.data.txns.length+' 筆\n'+(direction==='upload'?'請先確認這是手機上最新、最完整的資料。':'接收後自動入帳及同步均暫停，請先核對內容。');
    document.getElementById('cloud-first-confirm').textContent=direction==='upload'?'確認建立雲端副本':'確認接收為另一份帳本';box.hidden=false;box.scrollIntoView({block:'center'});cloudMessage('預覽完成，未有更改帳目。');
  }catch(error){window._cloudPreview=null;cloudMessage(error.message==='passphrase-short'?'請先設定至少 12 個字元的帳本加密密語，兩部裝置需使用同一密語。':cloudAuthError(error));}
  finally{window._cloudFirstBusy=false;}
}
async function cloudConfirmFirst(){
  const p=window._cloudPreview;if(!p||window._cloudFirstBusy)return;
  window._cloudFirstBusy=true;document.getElementById('cloud-first-confirm').disabled=true;
  try{
    if(!cloudPreviewCurrent(p))throw new Error('preview-stale');
    const current=await cloudFetchVault(p.config);
    if(!cloudPreviewCurrent(p))throw new Error('preview-stale');
    if(JSON.stringify(current)!==JSON.stringify(p.row))throw new Error('vault-race');
    if(p.direction==='upload'){
      if(current)throw new Error('vault-exists');
      const config=Object.assign({},p.config,{salt:''}),encrypted=await cloudEncrypt(p.content,config);
      if(!cloudPreviewCurrent(p))throw new Error('preview-stale');
      checkpointProfile(p.key);
      const row={owner_id:p.userId,id:config.vaultId,ver:1,salt:config.salt,iv:encrypted.iv,data:encrypted.data};
      const response=await cloudApi('myfin_sync_v2?select=ver',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(row)},config);
      if(!response.ok)throw new Error(response.status===409?'vault-exists':'sync-unavailable');
      const changed=await response.json();if(!Array.isArray(changed)||changed.length!==1||changed[0].ver!==1)throw new Error('sync-unavailable');
      // The server write may already have completed if the user leaves during upload. Never bind another local profile.
      if(!cloudPreviewCurrent(p)){cloudMessage('雲端副本已建立，但本機狀態已改變，未有連結目前帳本。請重新預覽核對。');return;}
      S.cloud=Object.assign({},config,{authVersion:2,linked:true,on:false,ver:1,last:Date.now(),pending:false,_dirty:false,pendingAt:0,lastError:''});
      if(!persistCloudMeta())throw new Error('local-save-failed');
      cloudMessage('雲端副本已建立並連結此帳本。自動同步仍然暫停；確認後可按「啟用已連結帳本的同步」。');
    }else{
      const config=Object.assign({},p.config,{salt:p.row.salt,authVersion:2,linked:true,on:false,ver:p.row.ver,last:Date.now(),pending:false,_dirty:false,pendingAt:0,lastError:''});
      const plan=planBackupImport({__myfin_transfer:1,profiles:[{sourceId:p.config.vaultId,name:'雲端 '+p.config.vaultId,emoji:'☁️',data:p.data}]});
      if(!cloudPreviewCurrent(p))throw new Error('preview-stale');
      commitBackupImport(plan,config);renderProfileChip();
      cloudMessage('已接收為另一份本機帳本，原有帳本不變。請從頂部帳本選單開啟「雲端 '+p.config.vaultId+' · 匯入副本」核對，再啟用同步。');
    }
    cloudPauseSession();renderCloudAuth();
  }catch(error){cloudMessage(String(error.message).includes('Source already imported')?'相同帳目副本已存在，沒有重複匯入。請先從帳本選單核對。':cloudAuthError(error));}
  finally{window._cloudFirstBusy=false;document.getElementById('cloud-first-confirm').disabled=false;}
}
function cloudResumeSession(){
  if(window._cloudAuthApproved){cloudPauseSession();cloudCfg().on=false;persistCloudMeta();cloudMessage('同步已暫停，本機記帳不受影響。');renderCloudAuth();return;}
  const c=cloudCfg();
  if(!c.linked||!cloudSignedIn(c)){cloudMessage('請先登入相符的帳戶，並完成首次同步預覽／確認，才可以啟用同步。');return;}
  if(!confirm('啟用此分頁的同步？之後的本機改動會自動上傳，較新的雲端版本會在保留復原副本後接收。兩邊都有改動會停止並要求你選擇，不會逐筆合併。'))return;
  c.on=true;window._cloudAuthApproved=true;
  if(!persistCloudMeta()){cloudPauseSession();c.on=false;cloudMessage('本機儲存失敗，未有啟用同步。');return;}
  renderCloudAuth();cloudPull(true);
}
function initCloudUi(){
  // Confirmation redirects can contain auth tokens. Do not retain or consume them as an automatic login.
  if(/(?:access_token|refresh_token|error_description)=/.test(location.hash)){history.replaceState(null,'',location.pathname+location.search);cloudMessage('電郵確認流程已返回 Myfin。請在這裡登入；若電郵連結過期，請重新申請。');}
  const c=cloudCfg();
  if(c.url&&c.key)try{cloudAuthClient().configure(c.url,c.key);}catch(_){cloudMessage('舊同步設定未能用作個人登入，請核對進階設定。');}
  renderCloudAuth();
  if(new URLSearchParams(location.search).get('cloud')==='login'){
    goTabIndex(TAB_ORDER.indexOf('settings'));
    const heading=document.querySelector('[data-i="cloudsync"]');
    if(heading?.classList.contains('col'))heading.click();
    document.getElementById('cloud-auth-state')?.scrollIntoView({block:'start'});
  }
}
