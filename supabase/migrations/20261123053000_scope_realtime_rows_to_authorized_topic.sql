begin;
-- Channel authorization and stored signal visibility are both scoped to the
-- requested topic. Knowing one approved topic never reveals other event topics.
alter policy wall_receive_private_broadcast on realtime.messages using(
  extension='broadcast' and topic=(select realtime.topic()) and public.can_receive_wall_updates((select realtime.topic()))
);
commit;
