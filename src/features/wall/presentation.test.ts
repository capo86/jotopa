import {test} from 'node:test'
import assert from 'node:assert/strict'
import {advanceConversation,projectionOptionsFromHash,projectionFragment,eventInitials,audioDuration} from './presentation-models.ts'
import type {ScrollPlayback} from './presentation-models.ts'

test('legacy projection links retain safe display defaults and ignore arbitrary style input',()=>{
  assert.deepEqual(projectionOptionsFromHash('#access=ignored'),{look:'olive',font:'classic',size:'comfortable',presentation:false})
  assert.deepEqual(projectionOptionsFromHash('#look=url(javascript:bad)&font=remote&size=huge&present=script'),{look:'olive',font:'classic',size:'comfortable',presentation:false})
})
test('display options survive a fragment round trip without becoming query parameters',()=>{
  const options={look:'rose',font:'modern',size:'large',presentation:true} as const
  const fragment=projectionFragment('a'.repeat(64),false,options)
  assert.deepEqual(projectionOptionsFromHash('#'+fragment),options);assert.equal(new URLSearchParams(fragment).get('qr'),'0')
  assert.throws(()=>projectionFragment('invalid',true,options))
})
test('event identity and durations support Spanish names without interpreting markup',()=>{
  assert.equal(eventInitials('Lucía & Mateo'),'LM');assert.equal(eventInitials('15 años · Valentina'),'AV');assert.equal(eventInitials(''),'J')
  assert.equal(audioDuration(0),'0:00');assert.equal(audioDuration(75),'1:15');assert.equal(audioDuration(-20),'0:00')
})
test('slow reading accumulates fractional pixels and a delayed frame never jumps',()=>{
  let state:ScrollPlayback={position:0,phase:'forward',remaining:0}
  for(let frame=0;frame<60;frame++)state=advanceConversation(state,1000,1/60,18)
  assert.ok(Math.abs(state.position-18)<.001)
  assert.ok(advanceConversation(state,1000,3600,18).position-state.position<=1.81)
})
test('the end holds for reading and returns continuously instead of resetting the history',()=>{
  let state:ScrollPlayback=advanceConversation({position:99,phase:'forward',remaining:0},100,.1,28)
  assert.equal(state.position,100);assert.equal(state.phase,'end-pause')
  for(let tick=0;tick<79;tick++)state=advanceConversation(state,100,.1,28)
  assert.equal(state.position,100)
  for(let tick=0;tick<3;tick++)state=advanceConversation(state,100,.1,28)
  assert.equal(state.phase,'return');assert.ok(state.position>90)
})
test('new messages during the end pause resume forward without jumping to the newest',()=>{
  const state=advanceConversation({position:100,phase:'end-pause',remaining:5},300,.1,28)
  assert.deepEqual(state,{position:100,phase:'forward',remaining:0})
  assert.ok(advanceConversation(state,300,.1,28).position<104)
})
test('the return stops at the beginning and holds before starting the next full traversal',()=>{
  const state=advanceConversation({position:1,phase:'return',remaining:0},100,.1,28)
  assert.deepEqual(state,{position:0,phase:'start-pause',remaining:4})
  assert.deepEqual(advanceConversation({position:0,phase:'start-pause',remaining:.05},100,.1,28),{position:0,phase:'forward',remaining:0})
})
test('empty and reduced histories remain bounded without discarding their data',()=>{
  assert.deepEqual(advanceConversation({position:500,phase:'return',remaining:0},0,.1,28),{position:0,phase:'forward',remaining:0})
  assert.ok(advanceConversation({position:500,phase:'return',remaining:0},20,.1,28).position<=20)
})
