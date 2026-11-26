begin;
do $$
declare source jsonb; result jsonb;
begin
  source:='{"version":2,"sections":[{"id":"gallery","enabled":false},{"id":"gifts","enabled":true},{"id":"lodging","enabled":true},{"id":"schedule","enabled":true}],"gallery":[{"asset_id":"hidden-photo"}],"schedule":[{"enabled":false,"description":"hidden-schedule"},{"enabled":true}],"lodging":[{"enabled":false,"phone":"hidden-phone"},{"enabled":true}],"gifts":{"items":[{"enabled":false,"name":"hidden-gift"}],"banking":{"enabled":false,"bank_name":"hidden-bank","holder":"hidden-holder","account":"hidden-account","alias":"hidden-alias","notes":"hidden-notes"}}}'::jsonb;
  result:=private.public_invitation_design(source);
  if result::text like '%hidden-%' then raise exception 'Hidden content leaked through the public design';end if;
  if jsonb_array_length(result->'gallery')<>0 or jsonb_array_length(result->'schedule')<>1 or jsonb_array_length(result->'lodging')<>1 then raise exception 'Incorrect public section filtering';end if;
end $$;
rollback;
