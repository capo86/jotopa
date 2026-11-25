import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mergeWallChanges,nextScrollPosition,personalEntryPath,projectionAccessFromHash,syncPageSchema} from './feed-models.ts'
import type {WallPost} from './models.ts'
const post=(id:string,time:string):WallPost=>({id,author_name:'Titular',participant_name:null,body:'Un recuerdo',created_at:time,media:[]})
const first=post('a0000000-0000-4000-8000-000000000001','2026-11-23T10:00:00Z'),second=post('a0000000-0000-4000-8000-000000000002','2026-11-23T11:00:00Z')
test('live changes append and reorder the full history without replacing older posts',()=>{
  const changes=[{id:second.id,revision:3,post:second},{id:first.id,revision:4,post:first}]
  const merged=mergeWallChanges([second],changes);assert.deepEqual(merged.map(row=>row.id),[first.id,second.id]);assert.deepEqual(mergeWallChanges(merged,changes),merged)
})
test('moderation removals hide only the affected post and later approval restores it',()=>{
  const removed=mergeWallChanges([first,second],[{id:first.id,revision:5,post:null}]);assert.deepEqual(removed,[second]);assert.deepEqual(mergeWallChanges(removed,[{id:first.id,revision:6,post:first}]),[first,second])
})
test('participation QR accepts only personal invitations at trusted origins',()=>{
  const token='a'.repeat(64),origins=['http://localhost:5174','http://localhost:5176']
  assert.equal(personalEntryPath(`http://localhost:5174/i/${token}`,origins),`/i/${token}#buenos-deseos`)
  for(const value of [`https://external.test/i/${token}`,`http://user:pass@localhost:5174/i/${token}`,`http://localhost:5174/i/${token}?secret=1`,'javascript:alert(1)',`http://localhost:5174/e/demo/pantalla#access=${token}`])assert.equal(personalEntryPath(value,origins),null)
})
test('projection credentials are parsed only from a bounded fragment',()=>{
  assert.equal(projectionAccessFromHash(`#access=${'a'.repeat(64)}&qr=1`),'a'.repeat(64));for(const value of ['#access=bad','#token='+ 'a'.repeat(64),'#access='+'a'.repeat(65)])assert.equal(projectionAccessFromHash(value),null)
})
test('automatic scrolling bounds speed, frame pauses and the conversation extent',()=>{
  assert.equal(nextScrollPosition(20,100,1,28),22.8);assert.equal(nextScrollPosition(99,100,.1,45),100);assert.equal(nextScrollPosition(20,100,-1,28),20);assert.equal(nextScrollPosition(0,0,.1,28),0);assert.equal(nextScrollPosition(0,100,.1,1000),7)
})
test('live snapshots reject malformed revisions and do not accept secret-bearing topics',()=>{
  const value={ok:true,changes:[],next_revision:1,snapshot_revision:1,latest_revision:1,has_more:false,stream_topic:'wall-approved:'+'a'.repeat(64),server_time:'2026-11-23T10:00:00Z',access_expires_at:'2026-11-23T11:00:00Z',can_post:true,enabled:true,opens_at:'2026-11-23T09:00:00Z',closes_at:'2026-11-23T11:00:00Z',audio_max_seconds:60}
  assert.equal(syncPageSchema.safeParse(value).success,true);for(const patch of [{next_revision:-1},{stream_topic:'personal-token'},{audio_max_seconds:121}])assert.equal(syncPageSchema.safeParse({...value,...patch}).success,false)
})
