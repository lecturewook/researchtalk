/* 로그인, 서버 저장·조회, 기기 캐시·초대·입력 초안은 이 파일 한 곳에서 관리합니다. */
(function(g){
  'use strict';
  const GROUP='00000000-0000-4000-8000-000000000001',PREFIX='researchtalk:v1:',D=g.RTDates;
  const cfg=g.RESEARCH_CONFIG||{},listeners=new Set(),pendingMessages=new Map();
  let sdk=null,session=null,state=null,channel=null,authEpoch=0,viewEpoch=0,room=GROUP,day=D.today(),flight=null,dirty=false;
  let status={status:'loading',message:'연결을 준비하고 있어요',userId:null};
  const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
  function get(key){try{return g.localStorage.getItem(PREFIX+key);}catch{return null;}}
  function put(key,value){try{g.localStorage.setItem(PREFIX+key,value);return true;}catch{return false;}}
  function remove(key){try{g.localStorage.removeItem(PREFIX+key);}catch{}}
  function object(key,fallback){try{return JSON.parse(get(key))||fallback;}catch{return fallback;}}
  function notify(){for(const fn of listeners){try{fn(copy(state),{...status});}catch(e){g.console?.error('화면 갱신 오류',e);}}}
  function setStatus(name,message){status={...status,status:name,message,userId:session?.user.id||null};notify();}
  function uuid(){
    if(g.crypto?.randomUUID)return g.crypto.randomUUID();
    if(!g.crypto?.getRandomValues)throw new Error('안전한 연결 주소로 앱을 열어주세요.');
    const a=new Uint8Array(16);g.crypto.getRandomValues(a);a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;
    const h=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function errorMessage(e){
    if(e?.message==='RT_NOT_MEMBER')return '초대 코드를 입력해 참여해 주세요.';
    if(e?.code==='PGRST202'||e?.code==='PGRST205'||e?.code==='42P01')return 'researchtalk 저장소 설정이 필요해요. 안내 파일의 SQL 두 개를 실행해 주세요.';
    if(e?.code==='P0001')return e.message;
    if(e?.code==='42501')return /[가-힣]/.test(e.message||'')?e.message:'이 작업에 접근할 권한이 없어요.';
    if(e?.code==='23505')return '이미 저장된 항목이에요. 화면을 새로 확인해 주세요.';
    if(['23514','23502','22P02','22007','22008'].includes(e?.code))return '입력한 날짜와 내용을 확인해 주세요.';
    if(/invalid login credentials/i.test(e?.message||''))return '이메일 또는 비밀번호가 맞지 않아요.';
    if(/email not confirmed/i.test(e?.message||''))return '이메일의 인증 링크를 누른 뒤 로그인해 주세요.';
    if(/email.*rate|rate.*limit|over_email/i.test((e?.message||'')+' '+(e?.code||'')))return '인증 메일 발송 한도에 도달했어요. 잠시 후 다시 시도하거나 관리자에게 계정 생성을 요청해 주세요.';
    if(/signups.*not allowed|signup_disabled/i.test((e?.message||'')+' '+(e?.code||'')))return '가입이 꺼져 있어요. 관리자에게 계정 생성을 요청해 주세요.';
    if(/password/i.test(e?.message||''))return '비밀번호 조건을 확인해 주세요. 8자 이상으로 입력해 주세요.';
    if(/already registered/i.test(e?.message||''))return '이미 가입한 이메일이에요. 로그인해 주세요.';
    if(/email.*invalid|email.*address.*not.*authorized/i.test(e?.message||''))return '이메일을 확인해 주세요. 메일 발송 설정이 안 됐다면 관리자에게 계정 생성을 요청해 주세요.';
    if(e?.code==='PGRST301'||e?.status===401)return '로그인이 만료됐어요. 다시 로그인해 주세요.';
    return '연결하지 못했어요. 인터넷을 확인한 뒤 다시 시도해 주세요.';
  }
  function wrap(e){const x=new Error(errorMessage(e));x.code=e?.code;x.cause=e;return x;}
  function cached(){const c=object('cache:'+session?.user.id,{});return c[room+'|'+day]||null;}
  function cache(data){
    const key='cache:'+data.self,all=object(key,{}),id=data.roomId+'|'+data.day;
    delete all[id];all[id]=data;const keys=Object.keys(all);while(keys.length>12)delete all[keys.shift()];put(key,JSON.stringify(all));
  }
  function accept(data,ae,ve){
    if(ae!==authEpoch||ve!==viewEpoch||data?.self!==session?.user.id||data.roomId!==room||data.day!==day)return false;
    if(state?.self===data.self&&state.roomId===room&&state.day===day&&Number(state.revision)>Number(data.revision))return false;
    state={...data,loading:false};cache(state);setStatus('connected','대화와 일정이 연결됐어요');return true;
  }
  function stopChannel(){if(channel&&sdk){sdk.removeChannel(channel);channel=null;}}
  function watch(){
    if(channel||!sdk||!session||status.status==='join')return;
    channel=sdk.channel('researchtalk:'+session.user.id).on('postgres_changes',
      {event:'UPDATE',schema:'public',table:'rt_signals',filter:'user_id=eq.'+session.user.id},()=>refresh().catch(()=>{}))
      .subscribe(s=>{if(s==='SUBSCRIBED')refresh().catch(()=>{});});
  }
  function useSession(value){
    const old=session?.user.id,newId=value?.user.id;
    session=value||null;
    if(old!==newId){authEpoch++;viewEpoch++;stopChannel();room=GROUP;day=D.today();state=null;pendingMessages.clear();}
    status.userId=newId||null;
    if(!value){state=null;setStatus('signedout','로그인해 주세요');}
  }
  function pendingInvite(){return object('pending-invite',{code:'',name:''});}
  function rememberInvite(code,name){
    const old=pendingInvite();const entry={code:(code||'').trim(),name:(name===undefined?old.name:name||'').trim()};
    put('pending-invite',JSON.stringify(entry));return entry;
  }
  async function join(code,name){
    if(!session)throw new Error('먼저 로그인해 주세요.');
    if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(code||''))throw new Error('초대 코드를 확인해 주세요.');
    if(!name?.trim()||name.trim().length>20)throw new Error('이름은 1~20자로 입력해 주세요.');
    const ae=authEpoch;rememberInvite(code,name);
    const res=await sdk.rpc('rt_join',{p_code:code,p_name:name.trim(),p_day:D.today()});
    if(res.error)throw wrap(res.error);
    if(ae!==authEpoch)return;
    room=GROUP;day=D.today();viewEpoch++;remove('pending-invite');accept(res.data,ae,viewEpoch);watch();return copy(state);
  }
  async function refresh(){
    if(!sdk||!session)return;
    const ae=authEpoch,ve=viewEpoch;
    if(flight?.ae===ae&&flight?.ve===ve){dirty=true;return flight.promise;}
    const current={ae,ve};flight=current;
    current.promise=(async()=>{
      try{
        if(g.navigator?.onLine===false)throw new Error('offline');
        const res=await sdk.rpc('rt_snapshot',{p_room:room,p_day:day});
        if(ae!==authEpoch||ve!==viewEpoch)return;
        if(res.error){
          if(res.error.message==='RT_NOT_MEMBER'){
            state=null;remove('cache:'+session.user.id);stopChannel();setStatus('join','초대 코드로 참여해 주세요');return;
          }
          if(['PGRST202','PGRST205','42P01'].includes(res.error.code)){state=null;setStatus('setup',errorMessage(res.error));return;}
          if(res.error.code==='42501'||res.error.code==='PGRST301'||res.error.status===401){state=null;remove('cache:'+session.user.id);setStatus('error',errorMessage(res.error));return;}
          throw res.error;
        }
        accept(res.data,ae,ve);watch();
      }catch(e){
        if(ae!==authEpoch||ve!==viewEpoch)return;
        if(!state||state.loading)state=cached();
        setStatus('offline',state?'오프라인 · 마지막으로 불러온 기록이에요':'연결되지 않았어요. 인터넷을 확인해 주세요');
      }finally{
        if(flight===current){flight=null;if(dirty){dirty=false;g.setTimeout(()=>refresh().catch(()=>{}),50);}}
      }
    })();return current.promise;
  }
  async function init(){
    try{
      const fragment=new URLSearchParams((g.location?.hash||'').replace(/^#/,''));
      if(fragment.has('invite')){rememberInvite(fragment.get('invite'));g.history?.replaceState(null,'',g.location.pathname+g.location.search);}
      if(!cfg.url||!cfg.publishableKey||!g.supabase){setStatus('setup','앱의 연결 정보를 확인해 주세요.');return;}
      sdk=g.supabase.createClient(cfg.url,cfg.publishableKey,{
        auth:{storageKey:PREFIX+'session:'+new URL(cfg.url).hostname,storage:{getItem:k=>{try{return g.localStorage.getItem(k);}catch{return null;}},setItem:(k,v)=>{try{g.localStorage.setItem(k,v);}catch{throw new Error('로그인을 기억할 기기 저장 공간이 부족해요.');}},removeItem:k=>{try{g.localStorage.removeItem(k);}catch{}}},persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
        global:{fetch:async(url,options={})=>{const control=new AbortController(),timer=g.setTimeout(()=>control.abort(),18000);try{return await g.fetch(url,{...options,signal:options.signal||control.signal});}finally{g.clearTimeout(timer);}}}
      });
      sdk.auth.onAuthStateChange((event,value)=>{
        g.setTimeout(()=>{const changed=session?.user.id!==value?.user.id;useSession(value);if(value&&(changed||event==='TOKEN_REFRESHED'))refresh().catch(()=>{});},0);
      });
      const result=await sdk.auth.getSession();if(result.error)throw result.error;
      useSession(result.data.session);if(session)await refresh();
      g.setInterval(()=>{if(g.document?.visibilityState!=='hidden'&&session)refresh().catch(()=>{});},8000);
      for(const event of ['online','pageshow'])g.addEventListener(event,()=>refresh().catch(()=>{}));
      g.addEventListener('offline',()=>{if(session)setStatus('offline','오프라인 · 입력한 글은 그대로 남아 있어요');});
      g.document?.addEventListener('visibilitychange',()=>{if(g.document.visibilityState==='visible')refresh().catch(()=>{});});
    }catch(e){setStatus('error',errorMessage(e));}
  }
  async function login(email,password){
    if(!sdk)throw new Error('앱의 연결 설정을 확인해 주세요.');
    const res=await sdk.auth.signInWithPassword({email:email.trim(),password});if(res.error)throw wrap(res.error);
    useSession(res.data.session);await refresh();
    const p=pendingInvite();if(status.status==='join'&&p.code&&p.name)await join(p.code,p.name);
    return {...status};
  }
  async function signup(email,password,name,code){
    if(!sdk)throw new Error('앱의 연결 설정을 확인해 주세요.');
    if(!name.trim()||!code.trim())throw new Error('이름과 초대 코드를 입력해 주세요.');
    if(password.length<8)throw new Error('비밀번호를 8자 이상 입력해 주세요.');
    rememberInvite(code,name);
    const redirect=new URL('./',g.location.href);redirect.hash='invite='+encodeURIComponent(code);
    const res=await sdk.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:redirect.href}});
    if(res.error)throw wrap(res.error);
    if(res.data.session){useSession(res.data.session);await join(code,name);return{confirmed:true};}
    return {confirmed:false};
  }
  async function logout(){
    const id=session?.user.id;if(sdk){const res=await sdk.auth.signOut({scope:'local'});if(res.error)throw wrap(res.error);}
    if(id){remove('cache:'+id);remove('drafts:'+id);}remove('pending-invite');useSession(null);
  }
  async function view(nextRoom,nextDay){
    if(!D.parse(nextDay))throw new Error('날짜를 확인해 주세요.');
    if(room===nextRoom&&day===nextDay){await refresh();return;}
    room=nextRoom;day=nextDay;viewEpoch++;
    state=state?{...state,roomId:room,day,messages:[],days:[],loading:true}:null;notify();await refresh();
  }
  async function apply(action,data){
    if(!session||!sdk||status.status!=='connected'||g.navigator?.onLine===false)throw new Error('인터넷 연결 후 다시 시도해 주세요. 입력한 글은 그대로 있어요.');
    const ae=authEpoch,ve=viewEpoch;
    const res=await sdk.rpc('rt_apply',{p_action:action,p_data:data,p_room:room,p_day:day});
    if(res.error)throw wrap(res.error);
    if(ae!==authEpoch)throw new Error('계정이 바뀌었어요. 현재 계정을 확인해 주세요.');
    if(ve===viewEpoch)accept(res.data.state,ae,ve);else await refresh();
    return res.data.result||{};
  }
  async function markRead(ids){
    if(!session||status.status!=='connected'||!ids.length)return;
    const ae=authEpoch;
    const res=await sdk.rpc('rt_mark_read',{p_ids:ids.slice(0,500)});
    if(res.error?.code==='PGRST202')throw new Error('Supabase에서 03-unread.sql을 실행해 주세요.');
    if(res.error)throw wrap(res.error);
    if(ae===authEpoch)await refresh();
  }
  function setDraft(roomId,text){if(!session)return;const key='drafts:'+session.user.id,a=object(key,{});if(text)a[roomId]=text;else delete a[roomId];put(key,JSON.stringify(a));}
  function draft(roomId){return session?object('drafts:'+session.user.id,{})[roomId]||'':'';}
  async function send(text){
    if(day!==D.today())throw new Error('오늘 대화로 돌아와 보내주세요.');
    text=text.trim();if(!text||text.length>1000)throw new Error('대화는 1~1,000자로 입력해 주세요.');
    const k=session?.user.id+'|'+room+'|'+day;let request=pendingMessages.get(k);
    if(!request||request.text!==text){const now=new Date();request={id:uuid(),roomId:room,day,text,time:String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')};pendingMessages.set(k,request);}
    await apply('message.add',request);pendingMessages.delete(k);return request;
  }
  function exportDay(){
    if(!state?.messages.length)throw new Error('이 날짜에는 저장할 대화가 없어요.');
    const names=Object.fromEntries(state.members.map(m=>[m.id,m.name]));
    const r=state.rooms.find(r=>r.id===room),title=r?.kind==='group'?'우리 모두':names[r.a===state.self?r.b:r.a]+'님과 개인 대화';
    const lines=['researchtalk · '+title,D.label(day),'',...state.messages.map(m=>'['+m.localTime+'] '+(names[m.authorId]||'참여자')+'\n'+m.text+'\n')];
    const d=state.days.find(x=>x.day===day);if(d?.summary&&d.summaryRevision===d.revision)lines.push('이날의 이야기',d.summary);
    return {name:'researchtalk-'+day+'-'+(r?.kind==='group'?'단체':'개인')+'.txt',text:lines.join('\n')};
  }
  function inviteURL(code){const url=new URL('./',g.location.href);url.hash='invite='+code;return url.href;}
  g.RTStore=Object.freeze({GROUP,markRead,init,refresh,login,signup,join,logout,view,apply,send,uuid,exportDay,inviteURL,pendingInvite,rememberInvite,setDraft,draft,
    load:()=>copy(state),info:()=>({...status}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}});
})(window);
