-- 기존 대화·계정은 유지합니다. SQL Editor에서 한 번 실행하세요. 재실행도 가능합니다.
begin;
create table if not exists public.rt_reads (
 user_id uuid not null references auth.users(id) on delete cascade,
 message_id uuid not null references public.rt_messages(id) on delete cascade,
 primary key(user_id,message_id)
);
alter table public.rt_reads enable row level security;
revoke all on public.rt_reads from public,anon,authenticated;
create or replace function public.rt_mark_read(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.rt_is_member() then raise exception 'RT_NOT_MEMBER' using errcode='42501'; end if;
 if coalesce(array_length(p_ids,1),0)>500 then raise exception '한 번에 너무 많은 메시지입니다.'; end if;
 insert into public.rt_reads(user_id,message_id)
 select auth.uid(),m.id from public.rt_messages m where m.id=any(p_ids)
 and m.author_id<>auth.uid() and public.rt_can_room(m.room_id) on conflict do nothing;
 if found then perform public.rt_bump(array[auth.uid()]); end if;
end; $$;
revoke all on function public.rt_mark_read(uuid[]) from public,anon;
grant execute on function public.rt_mark_read(uuid[]) to authenticated;
create or replace function public.rt_snapshot(
  p_room uuid default '00000000-0000-4000-8000-000000000001', p_day date default current_date
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.rt_is_member() then raise exception 'RT_NOT_MEMBER' using errcode='42501'; end if;
  if not public.rt_can_room(p_room) then raise exception '이 대화방에 접근할 수 없어요.' using errcode='42501'; end if;
  return jsonb_build_object(
    'version',1,'revision',(select revision from public.rt_signals where user_id=auth.uid()),
    'unread',(select coalesce(jsonb_agg(u),'[]') from (
      select distinct on (m.room_id) m.room_id as "roomId",m.id,m.day
      from public.rt_messages m where m.author_id<>auth.uid() and public.rt_can_room(m.room_id)
      and not exists(select 1 from public.rt_reads x where x.user_id=auth.uid() and x.message_id=m.id)
      order by m.room_id,m.created_at,m.id) u),
    'self',auth.uid(),'roomId',p_room,'day',p_day,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',name) order by joined_at,user_id),'[]') from public.rt_members),
    'rooms',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'a',user_a,'b',user_b,'invitedBy',invited_by,'status',status) order by created_at,id),'[]') from public.rt_rooms where kind='group' or auth.uid() in (user_a,user_b)),
    'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'roomId',room_id,'authorId',author_id,'text',body,'day',day,'localTime',local_time,'createdAt',created_at,'unread',author_id<>auth.uid() and not exists(select 1 from public.rt_reads x where x.user_id=auth.uid() and x.message_id=rt_messages.id)) order by created_at,id),'[]') from public.rt_messages where room_id=p_room and day=p_day),
    'days',(select coalesce(jsonb_agg(jsonb_build_object('day',d.day,'revision',d.revision,'archivedAt',d.archived_at,'archivedRevision',d.archived_revision,'summary',d.summary,'summaryRevision',d.summary_revision,'count',(select count(*) from public.rt_messages m where m.room_id=d.room_id and m.day=d.day)) order by d.day desc),'[]') from public.rt_days d where d.room_id=p_room),
    'todos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'day',day,'text',body,'done',done) order by created_at,id),'[]') from public.rt_todos where owner_id=auth.uid()),
    'events',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'authorId',author_id,'day',day,'time',coalesce(local_time,''),'title',title,'detail',detail) order by day,local_time nulls first,id),'[]') from public.rt_events),
    'invites',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'expiresAt',expires_at) order by expires_at),'[]') from public.rt_invites where created_by=auth.uid() and consumed_by is null and not revoked and expires_at>now()),
    'reserved',(select count(*) from public.rt_invites where consumed_by is null and not revoked and expires_at>now())
  );
end;
$$;

commit;
