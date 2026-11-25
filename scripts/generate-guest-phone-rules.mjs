// Generate a NEW migration only. Never overwrite an applied migration.
// Public metadata from libphonenumber-js (MIT), pinned with package-lock.json.
import metadata from 'libphonenumber-js/metadata.max.json'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'

const target = process.argv[2]
if (!target || dirname(resolve(target)) !== resolve('supabase/migrations') || existsSync(target)) throw new Error('Elegí una migración nueva dentro de supabase/migrations.')
const rules = {}
const packageVersion = createRequire(import.meta.url)('libphonenumber-js/package.json').version
for (const country of [...Object.values(metadata.countries), ...Object.values(metadata.nonGeographic ?? {})]) {
  const code = country[0]
  const patterns = Array.isArray(country[11]) ? country[11].filter(type => Array.isArray(type) && typeof type[0] === 'string' && type[0]).map(type => type[0]) : [country[2]]
  rules[code] ??= new Set()
  for (const pattern of patterns) rules[code].add(pattern)
}
const serialized = JSON.stringify(Object.fromEntries(Object.entries(rules).map(([code, patterns]) => [code, `^(?:${[...patterns].join('|')})$`])))
if (serialized.includes('$phone_rules$')) throw new Error('Unexpected metadata delimiter.')
writeFileSync(target, `-- Generated from libphonenumber-js ${packageVersion} public metadata.max.json (MIT).
-- https://github.com/catamphetamine/libphonenumber-js
-- SQL validates the same national number type patterns used by the client.
begin;
create or replace function public.is_valid_guest_phone(p_phone text)
returns boolean language plpgsql immutable set search_path='' as $body$
declare rules constant jsonb := $phone_rules$${serialized}$phone_rules$::jsonb;
  digits text; code text; pattern text; prefix_length integer;
begin
  if p_phone is null then return true; end if;
  if p_phone !~ '^\\+[1-9][0-9]{7,14}$' then return false; end if;
  digits:=substr(p_phone,2);
  for prefix_length in 1..3 loop
    code:=substr(digits,1,prefix_length); pattern:=rules->>code;
    if pattern is not null then return substr(digits,prefix_length+1) ~ pattern; end if;
  end loop;
  return false;
end;
$body$;

create or replace function public.normalize_guest_phone(p_phone text)
returns text language plpgsql immutable set search_path='' as $$
declare result text:=nullif(btrim(p_phone),'');
begin
  if result is null then return null; end if;
  if char_length(result)>80 or result !~ '^[+0-9[:space:]().-]+$' then raise exception 'invalid_phone' using errcode='22023'; end if;
  result:=regexp_replace(result,'[[:space:]().-]','','g');
  if left(result,2)='00' then result:='+'||substr(result,3);
  elsif left(result,1)<>'+' then
    if left(result,3)='595' and char_length(result)>10 then result:='+'||result;
    else result:='+595'||regexp_replace(result,'^0',''); end if;
  end if;
  if not public.is_valid_guest_phone(result) then raise exception 'invalid_phone' using errcode='22023'; end if;
  return result;
end;
$$;
revoke all on function public.is_valid_guest_phone(text),public.normalize_guest_phone(text) from public,anon,authenticated;
commit;
`, { encoding: 'utf8', flag: 'wx' })
console.log('Nueva migración de validación telefónica generada; sin datos personales.')
