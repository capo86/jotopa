import { readFileSync } from 'node:fs'
import { sql } from './local-test-helpers.mjs'

try {
  sql(readFileSync('supabase/tests/profiles_rls.sql', 'utf8'))
  console.log('Profiles RLS: SQL checks passed; all fixtures rolled back.')
  sql(readFileSync('supabase/tests/events_rls.sql', 'utf8'))
  console.log('Events RLS: all seven roles, isolation, invitations, last owner and audit checks passed; fixtures rolled back.')
  sql(readFileSync('supabase/tests/guests_rls.sql', 'utf8'))
  console.log('Guests RLS: all roles, contacts, isolation, preview and unexpected-error rollback passed; fixtures rolled back.')
  sql(readFileSync('supabase/tests/rsvp_rls.sql','utf8'))
  console.log('RSVP RLS: anonymous capabilities, private limits, isolation, companion bounds, stale responses and deadlines passed; fixtures rolled back.')
  sql(readFileSync('supabase/tests/invitations_rls.sql','utf8'))
  console.log('Invitations RLS: roles, immutable timeline, manual send/undo, deduplicated openings and RSVP passed; fixtures rolled back.')
  sql(readFileSync('supabase/tests/design_rls.sql','utf8'))
  console.log('Visual invitation RLS: all roles, draft isolation, publication privileges and private images passed; fixtures rolled back.')
  sql(readFileSync('supabase/tests/information_rls.sql','utf8'))
  console.log('Information RLS: editor isolation, explicit banking publication and private helpers passed; fixtures rolled back.')
  sql(readFileSync('supabase/tests/seating_rls.sql','utf8'))
  console.log('Attendance/table RLS: seven roles, capacities, binary RSVP, own table, deadline and direct DML checks passed; fixtures rolled back.')
  sql(readFileSync('supabase/tests/wall_rls.sql','utf8'))
  console.log('Good wishes RLS: seven roles, token-bound identities, independent periods, mandatory moderation and private media passed; fixtures rolled back.')
  sql(readFileSync('supabase/tests/projection_rls.sql','utf8'))
  console.log('Projection/live wall RLS: seven roles, read-only access, approved deltas, private topics and issuer revocation passed; fixtures rolled back.')
} catch {
  console.error('RLS: SQL checks failed. No credentials were logged.')
  process.exitCode = 1
}
