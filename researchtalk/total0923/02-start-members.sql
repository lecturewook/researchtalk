-- 사용자가 지정한 여섯 로그인 계정을 researchtalk에 등록합니다.
-- 표시 이름은 앱의 '참여자 → 내 이름 바꾸기'에서 바꿀 수 있습니다.
begin;
lock table public.rt_members in share row exclusive mode;
insert into public.rt_members(user_id,name) values
 ('0c39c044-1d8a-4166-a656-eef89b5ce607','MR.Cho'),
 ('a2a52ffc-9881-48ce-986d-f75d0acfd3a6','Mr.K'),
 ('6d549026-07e6-46be-a194-e8cb3d48ae08','Madam.Um'),
 ('e3067d44-1d8d-4551-a08e-15cb31cb0dcf','Madam.Hee'),
 ('5fc705a6-6b46-421a-a661-f0d5733ad189','Madam.Fall'),
 ('74d8c7f3-cdce-433b-828d-41dadc91473a','Madam.MK')
on conflict(user_id) do nothing;
do $$ begin
 if (select count(*) from public.rt_members)>6 then raise exception '참여자는 최대 여섯 명이에요.'; end if;
end $$;
insert into public.rt_signals(user_id) select user_id from public.rt_members on conflict do nothing;
commit;
select name as "이름",user_id as "계정 UID" from public.rt_members order by joined_at,user_id;
