/* Myfin optional authentication. No ledger access; sessions stay in this tab only. */
(function(root){
  'use strict';
  function createClient(options){
    options=options||{};
    const request=options.fetch||root.fetch.bind(root),clock=options.now||Date.now;
    let storage=options.storage;try{storage=storage||root.sessionStorage;}catch(_){}
    storage=storage||{getItem(){return null;},setItem(){},removeItem(){}};
    let config=null,session=null,epoch=0,refreshing=null;
    const fail=code=>Object.assign(new Error(code),{code});
    function validateConfig(url,key){
      const u=new URL(String(url).trim());
      if(u.protocol!=='https:'||! /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw fail('invalid-project');
      key=String(key||'').trim();
      if(!key||key.startsWith('sb_secret_'))throw fail('public-key-required');
      if(!key.startsWith('sb_publishable_')){
        try{const p=JSON.parse(root.atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(p.role!=='anon')throw Error();}catch(_){throw fail('public-key-required');}
      }
      return {url:u.origin,key};
    }
    function storageKey(){return 'myfin.auth.tab.v1.'+config.url;}
    function status(){return {configured:!!config,projectUrl:config?.url||'',userId:session?.user?.id||'',email:session?.user?.email||'',expiresAt:session?.expires_at||0,epoch};}
    function emit(reason){if(options.onChange)options.onChange(status(),reason);}
    function clear(reason){session=null;refreshing=null;epoch++;if(config)try{storage.removeItem(storageKey());}catch(_){}emit(reason||'signed-out');}
    function configure(url,key){
      const next=validateConfig(url,key);
      if(config&&config.url===next.url&&config.key===next.key)return status();
      config=next;session=null;refreshing=null;epoch++;
      try{const saved=JSON.parse(storage.getItem(storageKey()));if(saved&&saved.user&&saved.user.id&&saved.access_token&&saved.refresh_token&&!saved.user.is_anonymous)session=saved;}catch(_){}
      emit('configured');return status();
    }
    async function api(path,body,token){
      if(!config)throw fail('not-configured');
      const c={...config};
      const response=await request(c.url+'/auth/v1/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',credentials:'omit',redirect:'error'});
      let data={};try{data=await response.json();}catch(_){}
      if(!response.ok){const error=fail(response.status===429?'rate-limited':(data.error_code||data.code||'auth-failed'));error.status=response.status;throw error;}
      return data;
    }
    function accept(data,operationEpoch,expectedUser){
      if(epoch!==operationEpoch)throw fail('auth-cancelled');
      if(!data.access_token||!data.refresh_token||!data.user?.id||data.user.is_anonymous||(expectedUser&&data.user.id!==expectedUser))throw fail('invalid-session');
      const expires=Number(data.expires_at)||Math.floor(clock()/1000)+Number(data.expires_in||0);
      if(!Number.isFinite(expires)||expires<=clock()/1000)throw fail('invalid-session');
      session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:expires,user:{id:data.user.id,email:data.user.email||'',is_anonymous:false}};
      // A blocked session store does not affect local bookkeeping. Login remains in memory.
      try{storage.setItem(storageKey(),JSON.stringify(session));}catch(_){}
      return status();
    }
    async function signIn(email,password){
      clear('signing-in');const e=epoch;
      const data=await api('token?grant_type=password',{email:String(email).trim(),password});
      accept(data,e);emit('signed-in');return status();
    }
    async function signUp(email,password,redirectTo){
      const e=epoch;
      const redirect=new URL(redirectTo);
      if(!['https:','http:'].includes(redirect.protocol)||redirect.username||redirect.password)throw fail('invalid-redirect');
      const data=await api('signup?redirect_to='+encodeURIComponent(redirect.href),{email:String(email).trim(),password});
      if(epoch!==e)throw fail('auth-cancelled');
      // Email confirmation is intentionally separate from signing in and never starts sync.
      return {confirmationRequired:!data.access_token};
    }
    async function token(){
      if(!session)throw fail('login-required');
      if(session.expires_at>clock()/1000+60)return session.access_token;
      if(!refreshing){
        const e=epoch,s=session;
        const job=(async()=>{
          try{const data=await api('token?grant_type=refresh_token',{refresh_token:s.refresh_token});accept(data,e,s.user.id);return session.access_token;}
          catch(error){if(epoch===e&&(error.status===401||error.status===403||['refresh_token_not_found','refresh_token_already_used','invalid-session','session_not_found'].includes(error.code)))clear('expired');throw error;}
        })();
        refreshing=job;job.finally(()=>{if(refreshing===job)refreshing=null;}).catch(()=>{});
      }
      return refreshing;
    }
    async function signOut(){
      const t=session?.access_token;clear('signed-out');
      if(t)try{await api('logout?scope=local',{},t);}catch(_){}
      return status();
    }
    return {configure,status,signIn,signUp,signOut,token,validateConfig};
  }
  root.MyfinCloudAuth={createClient};
})(typeof window!=='undefined'?window:globalThis);
