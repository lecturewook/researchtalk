(function(g){
  'use strict';
  const S=g.RTStore,D=g.RTDates,$=id=>document.getElementById(id);
  let data=null,info=S.info(),tab='home',selectedDay=D.today(),calendarMonth=selectedDay.slice(0,7)+'-01',authMode=S.pendingInvite().code?'signup':'login';
  let opening=false,readBusy=false,readTimer,boundary=null;
  let renderedChat='',renderedRoom='',toastTimer,modalReturn=null,lastToday=D.today(),sending=false;
  const colors=['#e9e2f6','#deeee7','#f8e2e5','#e2eaf8','#f5ead9','#e3edf0'];
  const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const icon=name=>{const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('class','icon');n.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);n.append(use);return n;};
  function button(text,cls,action){const n=node('button',cls,text);n.type='button';n.onclick=action;return n;}
  const member=id=>data?.members.find(m=>m.id===id);
  const roomInfo=id=>data?.rooms.find(r=>r.id===id);
  const roomName=r=>r?.kind==='group'?'우리 모두':(member(r?.a===data?.self?r?.b:r?.a)?.name||'참여자')+'님';
  const connected=()=>info.status==='connected'&&!data?.loading;
  function avatar(id){const m=member(id),n=node('span','avatar',(m?.name||'?').slice(0,1));n.style.background=colors[Math.max(0,data.members.findIndex(x=>x.id===id))%colors.length];n.setAttribute('aria-hidden','true');return n;}
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3800);}
  async function action(fn,control){if(control?.disabled)return;if(control)control.disabled=true;try{return await fn();}catch(e){toast(e.message||'다시 시도해 주세요.');}finally{if(control&&control.isConnected)control.disabled=false;}}
  function closeModal(){const restore=modalReturn;$('modal').hidden=true;$('app-frame').inert=false;$('auth-screen').inert=false;$('modal-body').replaceChildren();modalReturn=null;if(restore?.isConnected)restore.focus();}
  function modal(title,build){modalReturn=document.activeElement;$('modal-title').textContent=title;$('modal-body').replaceChildren();build($('modal-body'));$('modal').hidden=false;$('app-frame').inert=true;$('auth-screen').inert=true;setTimeout(()=>($('modal-body').querySelector('input,textarea,button')||$('modal-close')).focus(),0);}
  function confirmAction(title,text,fn){modal(title,body=>{body.append(node('p','muted',text));const b=button('삭제','primary-button',()=>action(async()=>{await fn();closeModal();toast('삭제했어요.');},b));b.style.marginTop='20px';body.append(b);});}
  function changeTab(next){tab=next;for(const t of ['home','chat','members'])$('page-'+t).hidden=t!==tab;document.querySelectorAll('[data-tab]').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(tab==='chat'&&!opening){action(()=>openRoom(data.roomId));}}
  function renderAuth(){
    const ready=!!data&&['connected','offline'].includes(info.status);
    $('auth-screen').hidden=ready;$('workspace').hidden=!ready;$('bottom-nav').hidden=!ready;
    if(ready)return;
    const joining=info.status==='join',blocked=!!info.userId&&['setup','error','offline'].includes(info.status),signup=authMode==='signup';
    $('auth-modes').hidden=joining||blocked;
    $('email-fields').hidden=joining;$('auth-email').required=!joining;$('auth-password').required=!joining;
    $('join-fields').hidden=!(joining||signup);$('auth-name').required=joining||signup;$('auth-invite').required=joining||signup;
    $('auth-form').hidden=blocked;$('auth-switch-account').hidden=!info.userId;
    $('auth-retry').hidden=!blocked;
    $('auth-password').autocomplete=signup?'new-password':'current-password';
    $('auth-title').textContent=joining?'초대받은 방에 들어가요':blocked?'연결을 확인해 주세요':signup?'우리 대화에 참여해요':'반가워요. 오늘도 함께해요.';
    $('auth-description').textContent=joining?'표시 이름과 초대 코드를 입력해 주세요.':blocked?info.message:signup?'초대받은 이메일로 계정을 만들어주세요.':'내 계정으로 로그인해 주세요.';
    $('auth-submit').textContent=joining?'참여하기':signup?'가입하고 참여하기':'로그인';
    $('auth-submit').disabled=info.status==='loading';
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===authMode)));
  }
  function renderHome(){
    const today=D.today(),now=D.parse(today);
    $('today-date').textContent=now.getFullYear()+'년 '+(now.getMonth()+1)+'월 '+now.getDate()+'일';
    $('today-weekday').textContent=D.weekday(today);$('today-month').textContent=(now.getMonth()+1)+'월';$('today-number').textContent=now.getDate();
    $('calendar-month').textContent=D.month(calendarMonth);
    const myDays=new Set([...data.todos.map(t=>t.day),...data.events.filter(e=>e.authorId===data.self).map(e=>e.day)]),sharedDays=new Set(data.events.filter(e=>e.authorId!==data.self).map(e=>e.day)),grid=$('calendar-grid');grid.replaceChildren();
    for(const cell of D.grid(calendarMonth)){
      const b=button(String(cell.number),'calendar-day'+(cell.outside?' outside':'')+(cell.day===today?' today':'')+(cell.day===selectedDay?' selected':'')+(sharedDays.has(cell.day)?' has-event':'')+(myDays.has(cell.day)?' has-my-event':''),()=>{selectedDay=cell.day;calendarMonth=cell.day.slice(0,7)+'-01';renderHome();});
      b.setAttribute('aria-label',D.label(cell.day)+(myDays.has(cell.day)?', 내 일정 있음':'')+(sharedDays.has(cell.day)?', 다른 참여자의 약속 있음':''));b.setAttribute('aria-pressed',String(cell.day===selectedDay));if(cell.day===today)b.setAttribute('aria-current','date');grid.append(b);
    }
    const todos=data.todos.filter(t=>t.day===selectedDay);
    $('todo-heading').textContent=selectedDay===today?'오늘의 할 일':D.label(selectedDay)+' 할 일';
    $('todo-count').textContent=todos.filter(t=>t.done).length+' / '+todos.length;
    const list=$('todo-list');list.replaceChildren();
    if(!todos.length)list.append(node('li','empty','아직 할 일이 없어요. 하나씩 적어볼까요?'));
    for(const t of todos){
      const li=node('li','todo-row'),b=button('','todo-toggle',()=>action(()=>S.apply('todo.toggle',{id:t.id,done:!t.done}),b));
      b.setAttribute('role','checkbox');b.setAttribute('aria-checked',String(t.done));b.disabled=!connected();
      const check=node('span','check-box');if(t.done)check.append(icon('check'));b.append(check,node('span','todo-label',t.text));
      const del=button('','delete-button',()=>confirmAction('할 일을 지울까요?',t.text,()=>S.apply('todo.delete',{id:t.id})));del.setAttribute('aria-label',t.text+' 삭제');del.append(icon('trash'));del.disabled=!connected();li.append(b,del);list.append(li);
    }
    $('todo-form').querySelector('button').disabled=!connected();$('event-add').disabled=!connected();
    $('events-heading').textContent=calendarMonth.slice(0,7)===today.slice(0,7)?'이번 달의 약속':D.parse(calendarMonth).getMonth()+1+'월의 약속';
    const events=data.events.filter(e=>e.day.startsWith(calendarMonth.slice(0,7))).sort((a,b)=>(a.day+a.time).localeCompare(b.day+b.time));
    const onDay=events.filter(e=>e.day===selectedDay);$('selected-events').hidden=!onDay.length;
    $('selected-events').textContent=D.label(selectedDay)+' · '+onDay.length+'개의 약속';
    const eventList=$('event-list');eventList.replaceChildren();
    if(!events.length)eventList.append(node('li','empty','함께할 약속을 달력에 남겨보세요.'));
    for(const e of events){
      const date=D.parse(e.day),li=node('li','event-row'),stamp=node('div','event-date',D.weekday(e.day).slice(0,1));stamp.append(node('strong','',date.getDate()));
      const text=node('div','event-content');text.append(node('strong','',e.title),node('p','',(e.time||'시간 미정')+' · '+(member(e.authorId)?.name||'참여자')));if(e.detail)text.append(node('p','',e.detail));li.append(stamp,text);
      if(e.authorId===data.self){const b=button('수정','event-edit',()=>eventModal(e));b.disabled=!connected();li.append(b);}eventList.append(li);
    }
  }
  function scrollBottom(){const sc=$('chat-scroll');sc.scrollTop=sc.scrollHeight;$('new-message-hint').hidden=true;}
  function badges(){
    const unread=Array.isArray(data?.unread)?data.unread:[];
    $('unread-setup').hidden=!data||Array.isArray(data.unread);
    const nav=document.querySelector('[data-tab="chat"]');
    nav?.classList.toggle('has-unread',unread.length>0);
    const badge=nav?.querySelector('.unread-dot');if(badge)badge.hidden=!unread.length;
    nav?.setAttribute('aria-label',unread.length?'대화, 읽지 않은 메시지 있음':'대화');
    document.querySelectorAll('[data-room]').forEach(b=>{
      const has=unread.some(u=>u.roomId===b.dataset.room);
      b.classList.toggle('has-unread',has);
      let dot=b.querySelector('.unread-dot');if(!dot){dot=node('span','unread-dot');dot.setAttribute('aria-hidden','true');b.append(dot);}dot.hidden=!has;
      b.setAttribute('aria-label',b.textContent+(has?', 읽지 않은 메시지 있음':''));
    });
  }
  function scheduleRead(){clearTimeout(readTimer);readTimer=setTimeout(readVisible,350);}
  async function readVisible(){
    if(readBusy||opening||tab!=='chat'||document.visibilityState==='hidden'||(document.hasFocus&&!document.hasFocus())||!$('modal').hidden||!data||data.loading)return;
    const sc=$('chat-scroll').getBoundingClientRect();
    if(sc.height<=0)return;
    const ids=[...document.querySelectorAll('[data-message]')].filter(el=>{
      const box=el.getBoundingClientRect();
      return box.bottom>sc.top&&box.top<sc.bottom&&data.messages.some(m=>m.id===el.dataset.message&&m.unread);
    }).map(el=>el.dataset.message);
    if(!ids.length)return;
    readBusy=true;try{await S.markRead(ids);}catch(error){$('message-error').textContent='읽음 상태를 저장하지 못했어요. '+error.message;}finally{readBusy=false;}
  }
  async function openRoom(id){
    opening=true;boundary=null;
    try{
      if(id!==data?.roomId){$('message-text').value=S.draft(id);renderedChat='';}
      changeTab('chat');
      await S.refresh();
      const first=data?.unread?.find(u=>u.roomId===id);
      boundary=first?{...first}:null;
      await S.view(id,first?.day||D.today());
      renderChat(true);
      setTimeout(()=>{
        if(boundary){const el=[...document.querySelectorAll('[data-message]')].find(e=>e.dataset.message===boundary.id);el?.scrollIntoView({block:'start'});}
        else scrollBottom();
        scheduleRead();
      },0);
    }finally{opening=false;}
  }
  function renderChat(force=false){
    if(!data)return;
    const active=roomInfo(data.roomId),rooms=$('room-list');rooms.replaceChildren();
    for(const r of data.rooms.filter(r=>r.status==='active')){const b=button(roomName(r),'room-chip'+(r.id===data.roomId?' active':''),()=>action(()=>openRoom(r.id),b));b.dataset.room=r.id;b.setAttribute('aria-pressed',String(r.id===data.roomId));rooms.append(b);}
    badges();
    $('room-name').textContent=roomName(active);$('room-subtitle').textContent=active?.kind==='group'?data.members.length+'명이 함께하는 대화':'초대를 수락한 두 사람만 보는 대화';
    $('chat-date').value=data.day;$('chat-date').max=D.today();
    const record=data.days.find(x=>x.day===data.day),hasMessages=data.messages.length>0;
    $('archive-state').textContent=data.loading?'대화를 불러오는 중이에요':record?.archivedAt?(record.archivedRevision===record.revision?'하루 보관 완료':'보관 후 대화가 바뀌었어요'):'날짜별로 자동 저장돼요';
    $('day-archive').disabled=!hasMessages||!connected();$('day-export').disabled=!hasMessages||data.loading;$('summary-open').disabled=!hasMessages||data.loading;
    $('summary-card').hidden=!record?.summary;$('summary-text').textContent=(record?.summary||'')+(record?.summary&&record.summaryRevision!==record.revision?'\n\n대화가 바뀌었어요. 다시 요약해 주세요.':'');
    const key=data.self+'|'+data.roomId+'|'+data.day+'|'+JSON.stringify(data.messages.map(m=>[m.id,m.text,member(m.authorId)?.name]));
    if(force||renderedChat!==key){
      const sc=$('chat-scroll'),atBottom=sc.scrollHeight-sc.scrollTop-sc.clientHeight<100,context=data.roomId+'|'+data.day,changed=renderedRoom!==context;
      renderedChat=key;renderedRoom=context;const list=$('chat-messages');list.replaceChildren();
      if(!data.messages.length)list.append(node('div','empty',data.loading?'대화를 불러오고 있어요.':data.day===D.today()?'오늘의 첫 이야기를 남겨보세요.':'이날은 아직 대화가 없어요.'));
      for(const m of data.messages){
        const mine=m.authorId===data.self,row=node('article','message'+(mine?' mine':'')),main=node('div','message-main');
        row.dataset.message=m.id;
        if(boundary?.id===m.id&&boundary.roomId===data.roomId)list.append(node('div','unread-divider','여기부터 읽지 않은 대화'));
        row.append(avatar(m.authorId));main.append(node('p','message-author',(member(m.authorId)?.name||'참여자')+(mine?' · 나':'')),node('div','message-bubble',m.text));
        const meta=node('div','message-meta');meta.append(node('span','',m.localTime));
        if(mine){const b=button('삭제','message-delete',()=>confirmAction('대화를 지울까요?','상대 화면에서도 사라지고 이날 요약도 지워져요.',()=>S.apply('message.delete',{id:m.id})));b.disabled=!connected();meta.append(b);}main.append(meta);row.append(main);list.append(row);
      }
      if(tab==='chat'&&!opening&&!boundary&&(atBottom||changed||force))setTimeout(scrollBottom,0);else if(tab==='chat'&&!atBottom)$('new-message-hint').hidden=false;
    }
    scheduleRead();
    const historic=data.day!==D.today();$('message-text').disabled=historic||!!data.loading;$('message-send').disabled=historic||!connected()||sending;
    $('composer-note').textContent=historic?'지난 대화를 보고 있어요. ‘오늘’을 누르면 이어 쓸 수 있어요.':info.status==='offline'?'오프라인이에요. 입력한 글은 보관하고, 연결 후 보내주세요.':'Enter로 전송 · Shift+Enter로 줄바꿈';
  }
  async function copyLink(code,input){try{await navigator.clipboard.writeText(S.inviteURL(code));toast('초대 링크를 복사했어요. 한 사람에게 보내주세요.');}catch{input.focus();input.select();toast('선택된 링크를 길게 눌러 복사해 주세요.');}}
  function renderMembers(){
    $('member-count').textContent=data.members.length+' / 6';
    $('invite-description').textContent='한 링크로 한 명만 참여할 수 있어요. 초대는 7일 동안 유효해요.';
    const seats=6-data.members.length-data.reserved;$('invite-create').disabled=seats<=0||!connected();$('invite-create').textContent=seats>0?'초대 링크 만들기 · '+seats+'자리 남음':data.members.length===6?'여섯 명이 모두 모였어요':'기존 초대의 참여를 기다리고 있어요';
    const invites=$('invite-list');invites.replaceChildren();
    for(const i of data.invites){const box=node('div','invite-item'),input=node('input');input.readOnly=true;input.value=S.inviteURL(i.code);input.setAttribute('aria-label','한 명을 초대하는 링크');const actions=node('div','inline-actions');const revoke=button('초대 취소','text-button',()=>action(()=>S.apply('invite.revoke',{code:i.code}),revoke));revoke.disabled=!connected();actions.append(button('링크 복사','text-button',()=>copyLink(i.code,input)),revoke);box.append(input,actions,node('p','muted',new Date(i.expiresAt).toLocaleDateString('ko-KR')+'까지 유효'));invites.append(box);}
    const requests=$('dm-requests');requests.replaceChildren();
    const received=data.rooms.filter(r=>r.kind==='direct'&&r.status==='pending'&&r.invitedBy!==data.self);
    $('request-badge').hidden=!received.length;$('request-badge').textContent=received.length;
    for(const r of received){const box=node('div','request-card');box.append(node('h2','',roomName(r)+'의 개인 대화 초대'),node('p','muted','수락하면 두 사람만 대화를 볼 수 있어요.'));const actions=node('div','inline-actions');for(const [label,accept] of [['수락',true],['거절',false]]){const b=button(label,accept?'soft-button':'text-button',()=>action(async()=>{await S.apply('dm.respond',{roomId:r.id,accept});if(accept)await openRoom(r.id);},b));b.disabled=!connected();actions.append(b);}box.append(actions);requests.append(box);}
    const list=$('member-list');list.replaceChildren();
    for(const m of data.members){const li=node('li','member-row'),text=node('div','member-info');text.append(node('strong','',m.name),node('p','',m.id===data.self?'나':'함께하는 참여자'));li.append(avatar(m.id),text);if(m.id!==data.self)li.append(dmButton(m));list.append(li);}
    $('rename-open').disabled=!connected();
  }
  function dmButton(m){
    const r=data.rooms.find(r=>r.kind==='direct'&&[r.a,r.b].includes(m.id)&&[r.a,r.b].includes(data.self));
    const label=r?.status==='active'?'개인 대화':r?.status==='pending'?(r.invitedBy===data.self?'수락 기다리는 중':'받은 초대 보기'):'개인 대화 초대';
    const b=button(label,'text-button',()=>action(async()=>{
      if(r?.status==='active'){closeModal();await openRoom(r.id);}
      else if(r?.status==='pending'){closeModal();changeTab('members');$('dm-requests').scrollIntoView?.({block:'start'});}
      else {await S.apply('dm.invite',{userId:m.id});closeModal();toast(m.name+'님에게 개인 대화 초대를 보냈어요.');}
    },b));b.disabled=!connected()||(r?.status==='pending'&&r.invitedBy===data.self);return b;
  }
  function render(next,nextInfo){
    const priorSelf=data?.self;data=next;info=nextInfo;
    $('connection-status').textContent=info.message;$('retry-connection').hidden=!['offline','error'].includes(info.status);
    if(priorSelf&&priorSelf!==data?.self){boundary=null;closeModal();$('message-text').value='';for(const id of ['chat-messages','room-list','summary-text','todo-list','event-list','member-list','invite-list','dm-requests'])$(id).replaceChildren();}renderAuth();if(!data)return;
    $('my-profile').textContent=member(data.self)?.name.slice(0,1)||'나';
    if(priorSelf!==data.self){$('message-text').value=S.draft(data.roomId);renderedChat='';}
    renderHome();renderChat();renderMembers();
  }
  function eventModal(event){
    modal(event?'약속 수정':'새 약속',body=>{
      const form=node('form','stack-form');
      form.innerHTML='<label for="event-title">약속 이름</label><input id="event-title" maxlength="200" required placeholder="예: 논문 읽기 모임" /><label for="event-day">날짜</label><input id="event-day" type="date" min="1900-01-01" max="2200-12-31" required /><label for="event-time">시간 · 선택</label><input id="event-time" type="time" /><label for="event-detail">메모 · 선택</label><textarea id="event-detail" maxlength="1000" rows="3" placeholder="장소나 준비할 내용을 적어주세요"></textarea><p class="field-error" id="event-error" role="alert"></p><button class="primary-button" type="submit">약속 저장</button>';
      body.append(form);$('event-title').value=event?.title||'';$('event-day').value=event?.day||selectedDay;$('event-time').value=event?.time||'';$('event-detail').value=event?.detail||'';
      const id=event?.id||S.uuid();form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button[type=submit]');if(b.disabled)return;b.disabled=true;try{await S.apply('event.save',{id,title:$('event-title').value.trim(),day:$('event-day').value,time:$('event-time').value,detail:$('event-detail').value.trim()});closeModal();toast('약속을 저장했어요.');}catch(error){$('event-error').textContent=error.message;b.disabled=false;}};
      if(event)form.append(button('약속 삭제','danger-button',()=>confirmAction('약속을 지울까요?',event.title,()=>S.apply('event.delete',{id:event.id}))));
    });
  }
  $('brand').onclick=e=>{e.preventDefault();changeTab('home');};$('my-profile').onclick=()=>changeTab('members');
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>changeTab(b.dataset.tab));
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{authMode=b.dataset.mode;$('auth-error').textContent='';$('auth-info').textContent='';renderAuth();});
  const invitation=S.pendingInvite();$('auth-invite').value=invitation.code;$('auth-name').value=invitation.name;
  $('auth-form').onsubmit=async e=>{
    e.preventDefault();const b=$('auth-submit');if(b.disabled)return;b.disabled=true;$('auth-error').textContent='';$('auth-info').textContent='';
    try{
      if(info.status==='join')await S.join($('auth-invite').value.trim(),$('auth-name').value.trim());
      else if(authMode==='signup'){
        const r=await S.signup($('auth-email').value,$('auth-password').value,$('auth-name').value,$('auth-invite').value);
        if(!r.confirmed){authMode='login';renderAuth();$('auth-info').textContent='이메일의 인증 링크를 누른 뒤, 여기에서 로그인해 주세요. 메일이 오지 않으면 관리자에게 계정 생성을 요청해 주세요.';}
      }else {if($('auth-invite').value.trim())S.rememberInvite($('auth-invite').value,$('auth-name').value);await S.login($('auth-email').value,$('auth-password').value);}
      if(S.info().status==='connected')$('auth-password').value='';
    }catch(error){$('auth-error').textContent=error.message;}finally{b.disabled=false;}
  };
  $('auth-switch-account').onclick=()=>action(()=>S.logout());$('auth-retry').onclick=()=>action(()=>S.refresh());
  $('retry-connection').onclick=()=>action(()=>S.refresh());
  $('month-prev').onclick=()=>{calendarMonth=D.shift(calendarMonth,-1);selectedDay=calendarMonth;renderHome();};$('month-next').onclick=()=>{calendarMonth=D.shift(calendarMonth,1);selectedDay=calendarMonth;renderHome();};
  $('calendar-today').onclick=()=>{selectedDay=D.today();calendarMonth=selectedDay.slice(0,7)+'-01';renderHome();};
  $('todo-form').onsubmit=async e=>{e.preventDefault();const input=$('todo-text'),text=input.value.trim(),target=selectedDay,b=e.target.querySelector('button');if(!text)return;await action(async()=>{await S.apply('todo.add',{id:S.uuid(),day:target,text});if(input.value.trim()===text)input.value='';},b);};
  $('event-add').onclick=()=>eventModal();
  $('private-start').onclick=()=>{modal('한 명을 골라 초대해요',body=>{for(const m of data.members.filter(m=>m.id!==data.self)){const row=node('div','member-row'),text=node('span','member-info',m.name);row.append(avatar(m.id),text,dmButton(m));body.append(row);}if(data.members.length<2)body.append(node('p','empty','참여자를 먼저 초대해 주세요.'));});};
  $('chat-date').onchange=()=>{boundary=null;action(()=>S.view(data.roomId,$('chat-date').value));};$('chat-today').onclick=()=>{boundary=null;action(()=>S.view(data.roomId,D.today()));};
  $('history-open').onclick=()=>modal('날짜별 대화',body=>{if(!data.days.length)body.append(node('p','empty','대화를 시작하면 날짜별로 모아볼 수 있어요.'));for(const d of data.days){const b=button('','history-row',()=>action(async()=>{closeModal();await S.view(data.roomId,d.day);},b));b.append(node('span','',D.label(d.day)),node('small','',d.count+'개'+(d.archivedAt?' · 보관':'')));body.append(b);}});
  $('day-archive').onclick=()=>action(async()=>{await S.apply('day.archive',{roomId:data.roomId,day:data.day});toast('이날 대화를 보관했어요.');},$('day-archive'));
  $('day-export').onclick=()=>action(async()=>{const file=S.exportDay(),blob=new Blob(['\ufeff'+file.text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('대화를 글 파일로 저장했어요.');});
  $('message-text').oninput=()=>{if(data)S.setDraft(data.roomId,$('message-text').value);const t=$('message-text');t.style.height='auto';t.style.height=Math.min(t.scrollHeight,120)+'px';};
  $('message-form').onsubmit=async e=>{
    e.preventDefault();if(sending||!data)return;
    const text=$('message-text').value,roomId=data.roomId;const self=data.self;sending=true;$('message-send').disabled=true;$('message-error').textContent='';
    try{await S.send(text);if(data?.self===self&&S.draft(roomId)===text)S.setDraft(roomId,'');if(data?.self===self&&data.roomId===roomId&&$('message-text').value===text){$('message-text').value='';$('message-text').style.height='auto';}scrollBottom();}
    catch(error){$('message-error').textContent=error.message;}finally{sending=false;renderChat();}
  };
  let composing=false;
  $('message-text').addEventListener('compositionstart',()=>{composing=true;});
  $('message-text').addEventListener('compositionend',()=>{composing=false;});
  $('message-text').onkeydown=e=>{
    if(e.key!=='Enter'||e.shiftKey||e.isComposing||composing||e.keyCode===229)return;
    e.preventDefault();
    if(e.repeat||sending||$('message-send').disabled||!$('message-text').value.trim())return;
    $('message-form').requestSubmit();
  };
  $('unread-setup').onclick=()=>modal('읽지 않은 대화 표시 설정',body=>{
    body.append(node('p','','현재 저장소에서 읽음 정보를 보내주지 않고 있어요. Supabase SQL Editor에서 수정본의 supabase/03-unread.sql 전체를 실행한 뒤 다시 연결해 주세요. 기존 대화는 유지돼요.'));
    const b=button('설정 후 다시 연결','primary-button',()=>action(async()=>{await S.refresh();closeModal();},b));body.append(b);
  });
  g.addEventListener('focus',scheduleRead);
  $('chat-scroll').addEventListener('scroll',scheduleRead,{passive:true});
  document.addEventListener('visibilitychange',scheduleRead);
  $('new-message-hint').onclick=()=>{boundary=null;scrollBottom();scheduleRead();};
  $('summary-open').onclick=()=>modal('하루 대화 요약',body=>{
    if(!g.RESEARCH_CONFIG.aiEnabled){body.append(node('p','', 'AI 요약은 아직 연결 전이에요. 날짜별 대화 보관과 파일 저장은 지금 사용할 수 있어요.'));return;}
    const source=S.load(),revision=source.days.find(x=>x.day===source.day)?.revision;
    body.append(node('p','muted','선택한 대화방의 '+D.label(source.day)+' 대화만 AI로 보내 요약해요.'));
    const form=node('form','stack-form');form.innerHTML='<label for="summary-code">요약 연결 코드</label><input id="summary-code" type="password" autocomplete="off" required /><p id="summary-error" class="field-error" role="alert"></p><button class="primary-button">요약 만들기</button>';body.append(form);
    form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button');if(b.disabled)return;b.disabled=true;b.textContent='요약하는 중…';const code=$('summary-code').value;try{const text=await g.RTSummary.summarize(source,code);if(S.load()?.self!==source.self)throw new Error('계정이 바뀌었어요.');await S.apply('day.summary',{roomId:source.roomId,day:source.day,text,revision});if(form.isConnected)closeModal();toast('요약을 저장했어요.');}catch(error){if(form.isConnected){$('summary-error').textContent=error.message;b.disabled=false;b.textContent='다시 요약';}}};
  });
  $('invite-create').onclick=()=>action(async()=>{await S.apply('invite.create',{});toast('초대 링크를 만들었어요. 한 사람에게 보내주세요.');},$('invite-create'));
  $('rename-open').onclick=()=>modal('내 이름 바꾸기',body=>{const form=node('form','stack-form');form.innerHTML='<label for="new-name">대화방에서 쓸 이름</label><input id="new-name" maxlength="20" required /><button class="primary-button">이름 저장</button>';body.append(form);$('new-name').value=member(data.self).name;form.onsubmit=e=>{e.preventDefault();action(async()=>{await S.apply('profile.rename',{name:$('new-name').value.trim()});closeModal();},form.querySelector('button'));};});
  $('install-help').onclick=()=>modal('홈 화면에 추가',body=>{body.append(node('p','','아이폰: 사파리에서 공유 버튼 → 홈 화면에 추가를 눌러주세요. ‘웹 앱으로 열기’가 보이면 켜주세요.'),node('p','','안드로이드: 크롬 메뉴 → 홈 화면에 추가 또는 앱 설치를 눌러주세요.'),node('p','muted','설치된 아이콘의 이름은 researchtalk예요.'));});
  $('sign-out').onclick=()=>modal('로그아웃할까요?',body=>{body.append(node('p','','이 기기의 로그인과 임시 보관 기록을 지워요. 서버에 저장한 대화와 일정은 그대로 남아요.'));const b=button('로그아웃','primary-button',()=>action(async()=>{await S.logout();closeModal();$('message-text').value='';$('auth-password').value='';changeTab('home');},b));b.style.marginTop='20px';body.append(b);});
  $('modal-close').onclick=closeModal;$('modal').onclick=e=>{if(e.target===$('modal'))closeModal();};
  document.addEventListener('keydown',e=>{if($('modal').hidden)return;if(e.key==='Escape')closeModal();if(e.key==='Tab'){const items=[...$('modal').querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]')].filter(n=>!n.hidden);if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  function viewport(){document.documentElement.style.setProperty('--app-height',(g.visualViewport?.height||g.innerHeight)+'px');}
  g.visualViewport?.addEventListener('resize',viewport);g.addEventListener('resize',viewport);viewport();
  setInterval(()=>{const today=D.today();if(today===lastToday||!data)return;const old=lastToday;lastToday=today;if(selectedDay===old){selectedDay=today;calendarMonth=today.slice(0,7)+'-01';}renderHome();if(data.day===old)S.view(data.roomId,today).catch(()=>{});},60000);
  S.subscribe(render);render(null,S.info());
  S.init().then(()=>{const p=S.pendingInvite();if(p.code&&!$('auth-invite').value){$('auth-invite').value=p.code;$('auth-name').value=p.name;authMode='signup';renderAuth();}});
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))g.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})(window);
