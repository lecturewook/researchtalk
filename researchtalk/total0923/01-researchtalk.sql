-- researchtalk 읽음 + 답장 표시 보완
-- 기존 대화·계정·메시지는 유지합니다.
-- Supabase SQL Editor에서 전체를 한 번 실행하세요. 재실행해도 됩니다.

begin;

-- ------------------------------------------------------------
-- 1) 답장 대상 컬럼 보장
-- ------------------------------------------------------------
alter table public.rt_messages
  add column if not exists reply_to uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rt_messages_reply_to_fkey'
      and conrelid = 'public.rt_messages'::regclass
  ) then
    alter table public.rt_messages
      add constraint rt_messages_reply_to_fkey
      foreign key (reply_to)
      references public.rt_messages(id)
      on delete set null;
  end if;
end $$;

create index if not exists rt_messages_reply_to
  on public.rt_messages(reply_to);

-- ------------------------------------------------------------
-- 2) 읽음 기록 테이블
-- ------------------------------------------------------------
create table if not exists public.rt_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.rt_messages(id) on delete cascade,
  primary key(user_id,message_id)
);

alter table public.rt_reads enable row level security;

revoke all on public.rt_reads
  from public,anon,authenticated;

-- ------------------------------------------------------------
-- 3) 메시지 읽음 처리
-- ------------------------------------------------------------
create or replace function public.rt_mark_read(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.rt_is_member() then
    raise exception 'RT_NOT_MEMBER' using errcode='42501';
  end if;

  if coalesce(array_length(p_ids,1),0) > 500 then
    raise exception '한 번에 너무 많은 메시지입니다.';
  end if;

  insert into public.rt_reads(user_id,message_id)
  select
    auth.uid(),
    m.id
  from public.rt_messages m
  where m.id = any(p_ids)
    and m.author_id <> auth.uid()
    and public.rt_can_room(m.room_id)
  on conflict do nothing;

  if found then
    perform public.rt_bump(array[auth.uid()]);
  end if;
end;
$$;

revoke all on function public.rt_mark_read(uuid[])
  from public,anon;

grant execute on function public.rt_mark_read(uuid[])
  to authenticated;

-- ------------------------------------------------------------
-- 4) 현재 상태 조회
--
-- 중요:
-- 03-unread.sql이 기존 rt_snapshot()을 덮어쓸 때
-- replyTo를 빠뜨리지 않도록 함께 반환합니다.
-- ------------------------------------------------------------
create or replace function public.rt_snapshot(
  p_room uuid default '00000000-0000-4000-8000-000000000001',
  p_day date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.rt_is_member() then
    raise exception 'RT_NOT_MEMBER' using errcode='42501';
  end if;

  if not public.rt_can_room(p_room) then
    raise exception '이 대화방에 접근할 수 없어요.' using errcode='42501';
  end if;

  return jsonb_build_object(
    'version',1,

    'revision',
      (select revision
       from public.rt_signals
       where user_id=auth.uid()),

    'unread',
      (
        select coalesce(jsonb_agg(u),'[]'::jsonb)
        from (
          select distinct on (m.room_id)
            m.room_id as "roomId",
            m.id,
            m.day
          from public.rt_messages m
          where m.author_id <> auth.uid()
            and public.rt_can_room(m.room_id)
            and not exists (
              select 1
              from public.rt_reads x
              where x.user_id = auth.uid()
                and x.message_id = m.id
            )
          order by m.room_id,m.created_at,m.id
        ) u
      ),

    'self',auth.uid(),
    'roomId',p_room,
    'day',p_day,

    'members',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id',user_id,
              'name',name
            )
            order by joined_at,user_id
          ),
          '[]'::jsonb
        )
        from public.rt_members
      ),

    'rooms',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id',id,
              'kind',kind,
              'a',user_a,
              'b',user_b,
              'invitedBy',invited_by,
              'status',status
            )
            order by created_at,id
          ),
          '[]'::jsonb
        )
        from public.rt_rooms
        where kind='group'
           or auth.uid() in (user_a,user_b)
      ),

    -- 핵심 수정:
    -- unread뿐 아니라 replyTo도 앱으로 다시 내려줍니다.
    'messages',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id',m.id,
              'roomId',m.room_id,
              'authorId',m.author_id,
              'text',m.body,
              'day',m.day,
              'localTime',m.local_time,
              'replyTo',m.reply_to,
              'createdAt',m.created_at,
              'unread',
                (
                  m.author_id <> auth.uid()
                  and not exists (
                    select 1
                    from public.rt_reads x
                    where x.user_id = auth.uid()
                      and x.message_id = m.id
                  )
                )
            )
            order by m.created_at,m.id
          ),
          '[]'::jsonb
        )
        from public.rt_messages m
        where m.room_id=p_room
          and m.day=p_day
      ),

    'days',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'day',d.day,
              'revision',d.revision,
              'archivedAt',d.archived_at,
              'archivedRevision',d.archived_revision,
              'summary',d.summary,
              'summaryRevision',d.summary_revision,
              'count',
                (
                  select count(*)
                  from public.rt_messages m
                  where m.room_id=d.room_id
                    and m.day=d.day
                )
            )
            order by d.day desc
          ),
          '[]'::jsonb
        )
        from public.rt_days d
        where d.room_id=p_room
      ),

    'todos',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id',id,
              'day',day,
              'text',body,
              'done',done
            )
            order by created_at,id
          ),
          '[]'::jsonb
        )
        from public.rt_todos
        where owner_id=auth.uid()
      ),

    'events',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id',id,
              'authorId',author_id,
              'day',day,
              'time',coalesce(local_time,''),
              'title',title,
              'detail',detail
            )
            order by day,local_time nulls first,id
          ),
          '[]'::jsonb
        )
        from public.rt_events
      ),

    'invites',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'code',code,
              'expiresAt',expires_at
            )
            order by expires_at
          ),
          '[]'::jsonb
        )
        from public.rt_invites
        where created_by=auth.uid()
          and consumed_by is null
          and not revoked
          and expires_at>now()
      ),

    'reserved',
      (
        select count(*)
        from public.rt_invites
        where consumed_by is null
          and not revoked
          and expires_at>now()
      )
  );
end;
$$;

commit;
