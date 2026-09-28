      ) then
        raise exception '답장할 원본 메시지를 찾을 수 없어요. 화면을 새로 확인해 주세요.';
      end if;
    end if;

    select * into v_message
    from public.rt_messages
    where id=v_id;

    if found then
      -- 동일 요청 재전송은 성공으로 처리하되 reply_to까지 같아야 합니다.
      if v_message.author_id=v_uid
         and v_message.room_id=v_room
         and v_message.body=v_text
         and v_message.day=v_day
         and v_message.reply_to is not distinct from v_reply_to then
        return jsonb_build_object(
          'state',public.rt_snapshot(p_room,p_day),
          'result','{}'::jsonb
        );
      end if;

      raise exception '전송 번호가 겹쳤어요. 다시 보내주세요.';
    end if;

    insert into public.rt_messages(
      id,
      room_id,
      author_id,
      body,
      day,
      local_time,
      reply_to
    )
    values(
      v_id,
      v_room,
      v_uid,
      v_text,
      v_day,
      p_data->>'time',
      v_reply_to
    );

    insert into public.rt_days(room_id,day,revision)
    values(v_room,v_day,1)
      on conflict(room_id,day)
      do update set revision=public.rt_days.revision+1;
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
