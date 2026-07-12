// Background "demo student": logs in, goes live, streams a demo epoch every ~2s.
const signalR = require('@microsoft/signalr');
const BFF = 'http://localhost:3000/api';
function sess(){ let c=''; return async(m,p,b)=>{ const r=await fetch(BFF+p,{method:m,headers:{...(b!==undefined?{'Content-Type':'application/json'}:{}),...(c?{Cookie:c}:{})},body:b!==undefined?JSON.stringify(b):undefined}); const sc=r.headers.get('set-cookie'); if(sc)c=sc.split(';')[0]; return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))}; }; }
(async()=>{
  const s=sess();
  const li=await s('POST','/auth/login',{username:'demo-student',password:'demo-pass-1'});
  if(!li.ok){ console.error('login failed',li.status); process.exit(1); }
  const tok=(await s('POST','/eeg-token')).data;
  const netSess=await fetch(tok.backend_url+'/sessions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok.token},body:JSON.stringify({label:'Demo live sitting'})}).then(x=>x.json());
  const hub=new signalR.HubConnectionBuilder().withUrl(tok.backend_url+'/hubs/eeg',{accessTokenFactory:()=>tok.token}).withAutomaticReconnect().configureLogging(signalR.LogLevel.Error).build();
  hub.on('watcher_joined',e=>console.log('[demo-student] being watched by',e.name));
  hub.on('watcher_left',e=>console.log('[demo-student] watcher left',e.name));
  await hub.start();
  await hub.invoke('WatchSession',netSess.id,null);
  await s('POST','/live/start',{netSessionId:netSess.id});
  console.log('[demo-student] LIVE — session',netSess.id);
  let t=0;
  const tick=async()=>{ t+=1; const a=0.30+0.08*Math.sin(t/5), th=0.24+0.05*Math.cos(t/7);
    try{ await hub.invoke('StreamBands',{delta:0.10,theta:th,alpha:a,beta:0.22,gamma:0.10,session_id:netSess.id}); }catch(e){}
  };
  setInterval(tick,2000); tick();
  process.on('SIGTERM',async()=>{ try{await s('POST','/live/stop'); await hub.stop();}catch(e){} process.exit(0); });
})();
