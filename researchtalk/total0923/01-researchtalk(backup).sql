-- researchtalk 전용 저장소. 기존 couple_* 데이터는 수정하지 않습니다.
-- Supabase SQL Editor에서 전체를 한 번 실행합니다. 재실행해도 기록을 보존합니다.
begin;

create table if not exists public.rt_workspace (
  id integer primary key check (id=1)
);
insert into public.rt_workspace values (1) on conflict do nothing;

create table if not exists public.rt_members (
  user_id uuid primary key references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 20),
  joined_at timestamptz not null default now()
);
create table if not exists public.rt_signals (
  user_id uuid primary key references public.rt_members(user_id),
  revision bigint not null default 0
);
create table if not exists public.rt_invites (
  code uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.rt_members(user_id),
  expires_at timestamptz not null default (now()+interval '7 days'),
  consumed_by uuid references auth.users(id),
  revoked boolean not null default false
);
create table if not exists public.rt_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('group','direct')),
  user_a uuid references public.rt_members(user_id),
  user_b uuid references public.rt_members(user_id),
  invited_by uuid references public.rt_members(user_id),
  status text not null default 'active' check (status in ('pending','active','declined')),
  created_at timestamptz not null default now(),
  unique(user_a,user_b),
  check ((kind='group' and user_a is null and user_b is null and status='active') or
    (kind='direct' and user_a is not null and user_b is not null and user_a<user_b
      and invited_by is not null and invited_by in (user_a,user_b)))
);
create unique index if not exists rt_one_group on public.rt_rooms(kind) where kind='group';
insert into public.rt_rooms(id,kind) values ('00000000-0000-4000-8000-000000000001','group') on conflict do nothing;

create table if not exists public.rt_messages (
  id uuid primary key,
  room_id uuid not null references public.rt_rooms(id),
  author_id uuid not null references public.rt_members(user_id),
  body text not null check(char_length(btrim(body)) between 1 and 1000),
  day date not null check(day between date '1900-01-01' and date '2200-12-31'),
  local_time text not null check(local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists rt_messages_day on public.rt_messages(room_id,day,created_at,id);
create table if not exists public.rt_days (
  room_id uuid not null references public.rt_rooms(id),
  day date not null,
  revision bigint not null default 0,
  archived_at timestamptz,
  archived_revision bigint,
  summary text,
  summary_revision bigint,
  primary key(room_id,day)
);
create table if not exists public.rt_todos (
  id uuid primary key,
  owner_id uuid not null references public.rt_members(user_id),
  day date not null check(day between date '1900-01-01' and date '2200-12-31'),
  body text not null check(char_length(btrim(body)) between 1 and 300),
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists rt_todos_owner on public.rt_todos(owner_id,day);
create table if not exists public.rt_events (
  id uuid primary key,
  author_id uuid not null references public.rt_members(user_id),
  day date not null check(day between date '1900-01-01' and date '2200-12-31'),
  local_time text check(local_time is null or local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  title text not null check(char_length(btrim(title)) between 1 and 200),
  detail text not null default '' check(char_length(detail)<=1000)
);

alter table public.rt_workspace enable row level security;
alter table public.rt_members enable row level security;
alter table public.rt_signals enable row level security;
alter table public.rt_invites enable row level security;
alter table public.rt_rooms enable row level security;
alter table public.rt_messages enable row level security;
alter table public.rt_days enable row level security;
alter table public.rt_todos enable row level security;
alter table public.rt_events enable row level security;
revoke all on public.rt_workspace,public.rt_members,public.rt_signals,public.rt_invites,
  public.rt_rooms,public.rt_messages,public.rt_days,public.rt_todos,public.rt_events from anon,authenticated;

create or replace function public.rt_is_member() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.rt_members where user_id=(select auth.uid()));
$$;
create or replace function public.rt_can_room(p_room uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.rt_is_member() and exists(select 1 from public.rt_rooms r where r.id=p_room
    and r.status='active' and (r.kind='group' or auth.uid() in (r.user_a,r.user_b)));
$$;
create or replace function public.rt_bump(p_users uuid[]) returns void
language sql security definer set search_path='' as $$
  update public.rt_signals set revision=revision+1 where user_id=any(p_users);
$$;
revoke all on function public.rt_is_member(),public.rt_can_room(uuid),public.rt_bump(uuid[]) from public,anon,authenticated;
grant execute on function public.rt_is_member() to authenticated;
grant select on public.rt_signals to authenticated;
drop policy if exists rt_own_signal on public.rt_signals;
create policy rt_own_signal on public.rt_signals for select to authenticated
  using (user_id=(select auth.uid()) and (select public.rt_is_member()));

create or replace function public.rt_snapshot(
  p_room uuid default '00000000-0000-4000-8000-000000000001', p_day date default current_date
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.rt_is_member() then raise exception 'RT_NOT_MEMBER' using errcode='42501'; end if;
  if not public.rt_can_room(p_room) then raise exception '이 대화방에 접근할 수 없어요.' using errcode='42501'; end if;
  return jsonb_build_object(
    'version',1,'revision',(select revision from public.rt_signals where user_id=auth.uid()),
    'self',auth.uid(),'roomId',p_room,'day',p_day,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',name) order by joined_at,user_id),'[]') from public.rt_members),
    'rooms',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'a',user_a,'b',user_b,'invitedBy',invited_by,'status',status) order by created_at,id),'[]') from public.rt_rooms where kind='group' or auth.uid() in (user_a,user_b)),
    'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'roomId',room_id,'authorId',author_id,'text',body,'day',day,'localTime',local_time,'createdAt',created_at) order by created_at,id),'[]') from public.rt_messages where room_id=p_room and day=p_day),
    'days',(select coalesce(jsonb_agg(jsonb_build_object('day',d.day,'revision',d.revision,'archivedAt',d.archived_at,'archivedRevision',d.archived_revision,'summary',d.summary,'summaryRevision',d.summary_revision,'count',(select count(*) from public.rt_messages m where m.room_id=d.room_id and m.day=d.day)) order by d.day desc),'[]') from public.rt_days d where d.room_id=p_room),
    'todos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'day',day,'text',body,'done',done) order by created_at,id),'[]') from public.rt_todos where owner_id=auth.uid()),
    'events',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'authorId',author_id,'day',day,'time',coalesce(local_time,''),'title',title,'detail',detail) order by day,local_time nulls first,id),'[]') from public.rt_events),
    'invites',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'expiresAt',expires_at) order by expires_at),'[]') from public.rt_invites where created_by=auth.uid() and consumed_by is null and not revoked and expires_at>now()),
    'reserved',(select count(*) from public.rt_invites where consumed_by is null and not revoked and expires_at>now())
  );
end;
$$;

create or replace function public.rt_join(p_code uuid,p_name text,p_day date default current_date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_name text:=btrim(p_name); v_invite public.rt_invites%rowtype;
begin
  if v_uid is null then raise exception '먼저 로그인해 주세요.' using errcode='42501'; end if;
  perform 1 from public.rt_workspace where id=1 for update;
  if public.rt_is_member() then return public.rt_snapshot('00000000-0000-4000-8000-000000000001',p_day); end if;
  if v_name is null or char_length(v_name) not between 1 and 20 then raise exception '이름은 1~20자로 입력해 주세요.'; end if;
  select * into v_invite from public.rt_invites where code=p_code;
  if not found or v_invite.revoked or v_invite.consumed_by is not null or v_invite.expires_at<=now() then raise exception '초대 코드가 없거나 만료됐어요. 새 초대를 받아주세요.'; end if;
  if (select count(*) from public.rt_members)>=6 then raise exception '여섯 명이 모두 참여했어요.'; end if;
  insert into public.rt_members(user_id,name) values (v_uid,v_name);
  insert into public.rt_signals(user_id) values(v_uid);
  update public.rt_invites set consumed_by=v_uid where code=p_code;
  perform public.rt_bump(array(select user_id from public.rt_members));
  return public.rt_snapshot('00000000-0000-4000-8000-000000000001',p_day);
end;
$$;

create or replace function public.rt_apply(p_action text,p_data jsonb,
  p_room uuid default '00000000-0000-4000-8000-000000000001',p_day date default current_date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_id uuid; v_room uuid; v_day date; v_text text;
  v_target uuid; v_room_row public.rt_rooms%rowtype; v_message public.rt_messages%rowtype;
  v_users uuid[]; v_result jsonb:='{}'; v_revision bigint;
begin
  if not public.rt_is_member() then raise exception 'RT_NOT_MEMBER' using errcode='42501'; end if;
  -- 동시 전송과 초대 정원 확인을 한 번의 안전한 저장 작업으로 처리합니다.
  perform 1 from public.rt_workspace where id=1 for update;
  v_users:=array(select user_id from public.rt_members);
  if p_action='message.add' then
    v_id:=(p_data->>'id')::uuid; v_room:=(p_data->>'roomId')::uuid;
    v_day:=(p_data->>'day')::date; v_text:=btrim(p_data->>'text');
    if not public.rt_can_room(v_room) then raise exception '초대를 수락한 대화방에서만 보낼 수 있어요.' using errcode='42501'; end if;
    select * into v_message from public.rt_messages where id=v_id;
    if found then
      if v_message.author_id=v_uid and v_message.room_id=v_room and v_message.body=v_text and v_message.day=v_day then
        return jsonb_build_object('state',public.rt_snapshot(p_room,p_day),'result','{}'::jsonb);
      end if;
      raise exception '전송 번호가 겹쳤어요. 다시 보내주세요.';
    end if;
    insert into public.rt_messages(id,room_id,author_id,body,day,local_time) values(v_id,v_room,v_uid,v_text,v_day,p_data->>'time');
    insert into public.rt_days(room_id,day,revision) values(v_room,v_day,1)
      on conflict(room_id,day) do update set revision=public.rt_days.revision+1;
  elsif p_action='message.delete' then
    v_id:=(p_data->>'id')::uuid;
    select * into v_message from public.rt_messages where id=v_id;
    if not found then return jsonb_build_object('state',public.rt_snapshot(p_room,p_day),'result','{}'::jsonb); end if;
    if v_message.author_id<>v_uid or not public.rt_can_room(v_message.room_id) then raise exception '내가 보낸 대화만 지울 수 있어요.' using errcode='42501'; end if;
    v_room:=v_message.room_id; v_day:=v_message.day;
    delete from public.rt_messages where id=v_id;
    update public.rt_days set revision=revision+1,summary=null,summary_revision=null where room_id=v_room and day=v_day;
  elsif p_action in ('day.archive','day.summary') then
    v_room:=(p_data->>'roomId')::uuid; v_day:=(p_data->>'day')::date;
    if not public.rt_can_room(v_room) then raise exception '이 대화방을 볼 수 없어요.' using errcode='42501'; end if;
    if not exists(select 1 from public.rt_messages where room_id=v_room and day=v_day) then raise exception '이 날짜에 대화가 없어요.'; end if;
    if p_action='day.archive' then
      update public.rt_days set archived_at=clock_timestamp(),archived_revision=revision where room_id=v_room and day=v_day;
    else
      select revision into v_revision from public.rt_days where room_id=v_room and day=v_day;
      if (p_data->>'revision')::bigint is distinct from v_revision then raise exception '대화가 바뀌었어요. 다시 요약해 주세요.'; end if;
      v_text:=btrim(p_data->>'text');
      if v_text is null or char_length(v_text) not between 1 and 5000 then raise exception '요약 내용을 확인해 주세요.'; end if;
      update public.rt_days set summary=v_text,summary_revision=revision where room_id=v_room and day=v_day;
    end if;
  elsif p_action='todo.add' then
    insert into public.rt_todos(id,owner_id,day,body) values((p_data->>'id')::uuid,v_uid,(p_data->>'day')::date,btrim(p_data->>'text'));
    v_users:=array[v_uid];
  elsif p_action in ('todo.toggle','todo.delete') then
    v_id:=(p_data->>'id')::uuid;
    if not exists(select 1 from public.rt_todos where id=v_id and owner_id=v_uid) then raise exception '내 할 일만 바꿀 수 있어요.' using errcode='42501'; end if;
    if p_action='todo.delete' then delete from public.rt_todos where id=v_id;
    else update public.rt_todos set done=(p_data->>'done')::boolean where id=v_id; end if;
    v_users:=array[v_uid];
  elsif p_action='event.save' then
    v_id:=(p_data->>'id')::uuid;
    if exists(select 1 from public.rt_events where id=v_id and author_id<>v_uid) then raise exception '내가 등록한 약속만 수정할 수 있어요.' using errcode='42501'; end if;
    insert into public.rt_events(id,author_id,day,local_time,title,detail)
      values(v_id,v_uid,(p_data->>'day')::date,nullif(p_data->>'time',''),btrim(p_data->>'title'),coalesce(p_data->>'detail',''))
      on conflict(id) do update set day=excluded.day,local_time=excluded.local_time,title=excluded.title,detail=excluded.detail;
  elsif p_action='event.delete' then
    v_id:=(p_data->>'id')::uuid;
    if not exists(select 1 from public.rt_events where id=v_id and author_id=v_uid) then raise exception '내가 등록한 약속만 지울 수 있어요.' using errcode='42501'; end if;
    delete from public.rt_events where id=v_id;
  elsif p_action='invite.create' then
    if (select count(*) from public.rt_members)+(select count(*) from public.rt_invites where consumed_by is null and not revoked and expires_at>now())>=6 then raise exception '참여자와 아직 사용하지 않은 초대가 여섯 자리예요. 기존 초대를 확인해 주세요.'; end if;
    insert into public.rt_invites(created_by) values(v_uid) returning code into v_id;
    v_result:=jsonb_build_object('code',v_id);
  elsif p_action='invite.revoke' then
    update public.rt_invites set revoked=true where code=(p_data->>'code')::uuid and created_by=v_uid and consumed_by is null;
    if not found then raise exception '내가 만든 미사용 초대만 취소할 수 있어요.'; end if;
  elsif p_action='dm.invite' then
    v_target:=(p_data->>'userId')::uuid;
    if v_target=v_uid or not exists(select 1 from public.rt_members where user_id=v_target) then raise exception '다른 참여자 한 명을 골라주세요.'; end if;
    select * into v_room_row from public.rt_rooms where user_a=least(v_uid,v_target) and user_b=greatest(v_uid,v_target);
    if found then
      v_id:=v_room_row.id;
      if v_room_row.status='declined' then update public.rt_rooms set status='pending',invited_by=v_uid where id=v_id; end if;
    else
      insert into public.rt_rooms(kind,user_a,user_b,invited_by,status) values('direct',least(v_uid,v_target),greatest(v_uid,v_target),v_uid,'pending') returning id into v_id;
    end if;
    v_users:=array[v_uid,v_target]; v_result:=jsonb_build_object('roomId',v_id);
  elsif p_action='dm.respond' then
    v_id:=(p_data->>'roomId')::uuid;
    select * into v_room_row from public.rt_rooms where id=v_id;
    if not found or v_room_row.kind<>'direct' or v_uid not in (v_room_row.user_a,v_room_row.user_b) or v_room_row.invited_by=v_uid or v_room_row.status<>'pending' then raise exception '받은 개인 대화 초대만 응답할 수 있어요.' using errcode='42501'; end if;
    if p_data->>'accept' not in ('true','false') or p_data->>'accept' is null then raise exception '초대 응답을 확인해 주세요.'; end if;
    update public.rt_rooms set status=case when (p_data->>'accept')::boolean then 'active' else 'declined' end where id=v_id;
    v_users:=array[v_room_row.user_a,v_room_row.user_b];
  elsif p_action='profile.rename' then
    v_text:=btrim(p_data->>'name');
    update public.rt_members set name=v_text where user_id=v_uid;
  else raise exception '지원하지 않는 요청이에요.';
  end if;
  if v_room is not null then
    select * into v_room_row from public.rt_rooms where id=v_room;
    if v_room_row.kind='direct' then v_users:=array[v_room_row.user_a,v_room_row.user_b]; end if;
  end if;
  perform public.rt_bump(v_users);
  return jsonb_build_object('state',public.rt_snapshot(p_room,p_day),'result',v_result);
end;
$$;
revoke all on function public.rt_snapshot(uuid,date),public.rt_join(uuid,text,date),public.rt_apply(text,jsonb,uuid,date) from public,anon,authenticated;
grant execute on function public.rt_snapshot(uuid,date),public.rt_join(uuid,text,date),public.rt_apply(text,jsonb,uuid,date) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='rt_signals'
  ) then alter publication supabase_realtime add table public.rt_signals; end if;
end $$;
commit;
