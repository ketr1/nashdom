import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.LOCAL_DB='1';
process.env.DB_PATH=':memory:';
process.env.SETUP_KEY='test-key-only-not-for-production-123456789';
delete process.env.DATABASE_URL;
const { handleApi }=await import('../lib/api.mjs');
const origin='http://localhost:5173';
async function call(route, method='GET', body, cookie='', otherOrigin=origin){
  const r=await handleApi(new Request(origin+'/api/'+route,{method,headers:{'content-type':'application/json',origin:otherOrigin,...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
let child,mother,invite,billId;
test('two real profiles share household records, but mother finances stay private',async t=>{
  await t.test('setup is protected and only creates the child role',async()=>{
    assert.equal((await call('session')).data.configured,false);
    assert.equal((await call('setup','POST',{email:'child@example.test',password:'TestHousehold123!',name:'Саша',key:'wrong'})).status,403);
    const r=await call('setup','POST',{email:'child@example.test',password:'TestHousehold123!',name:'Саша',key:process.env.SETUP_KEY,role:'mother'});
    assert.equal(r.status,201);assert.equal(r.data.user.role,'child');child=r.cookie;
    assert.equal((await call('state')).status,401);
    assert.equal((await call('setup','POST',{email:'other@example.test',password:'TestHousehold123!',name:'Другой',key:process.env.SETUP_KEY})).status,409);
  });
  await t.test('only the invited email can join; role cannot be forged',async()=>{
    const r=await call('invite','POST',{email:'mother@example.test'},child);assert.equal(r.status,200);invite=r.data.token;
    assert.equal((await call('join','POST',{token:invite,email:'stranger@example.test',name:'Незнакомец',password:'TestHousehold123!'})).status,403);
    const joined=await call('join','POST',{token:invite,email:'mother@example.test',name:'Мама',password:'DifferentPass123!',role:'child'});
    assert.equal(joined.status,201);assert.equal(joined.data.user.role,'mother');mother=joined.cookie;
    assert.equal((await call('join','POST',{token:invite,email:'mother@example.test',name:'Мама',password:'DifferentPass123!'})).status,403);
    assert.equal((await call('invite','POST',{email:'third@example.test'},mother)).status,403);
  });
  await t.test('independent updates are merged; both devices see the same list',async()=>{
    const results=await Promise.all([call('items','POST',{kind:'shopping',title:'Молоко'},child),call('items','POST',{kind:'shopping',title:'Хлеб'},mother)]);
    assert.ok(results.every(r=>r.status===201));
    const a=await call('state','GET',null,child),b=await call('state','GET',null,mother);
    assert.equal(a.data.items.length,2);assert.deepEqual(a.data.items,b.data.items);
    await call('items/'+a.data.items[0].id,'PATCH',{done:true},mother);
    assert.equal((await call('state','GET',null,child)).data.items.filter(i=>i.done).length,1);
    assert.ok(!JSON.stringify(a.data).includes('password'));
  });
  await t.test('task claim cannot be stolen by the other participant',async()=>{
    const {data:{id}}=await call('items','POST',{kind:'tasks',title:'Забрать заказ'},child);
    const state=await call('state','GET',null,child);const childId=state.data.user.id;const motherId=state.data.members.find(m=>m.role==='mother').id;
    assert.equal((await call('items/'+id,'PATCH',{assignee:childId},child)).status,200);
    assert.equal((await call('items/'+id,'PATCH',{assignee:motherId},mother)).status,409);
    assert.equal((await call('items/'+id,'PATCH',{assignee:''},mother)).status,409);
  });
  await t.test('dinner statuses and notes are shared',async()=>{
    assert.equal((await call('dinner','POST',{status:'late',arrival:'20:30'},child)).status,200);
    assert.equal((await call('dinner','POST',{status:'yes',arrival:'19:00'},mother)).status,200);
    await call('note','POST',{note:'Суп в холодильнике 💚'},mother);
    const r=await call('state','GET',null,child);assert.equal(r.data.dinner.length,2);assert.equal(r.data.note,'Суп в холодильнике 💚');
    assert.equal((await call('dinner','POST',{status:'yes',arrival:'25:99'},child)).status,400);
  });
  await t.test('both participants can explicitly assign and reassign tasks to real household members',async()=>{
    const state=(await call('state','GET',null,child)).data;
    const motherId=state.members.find(m=>m.role==='mother').id;
    const childId=state.user.id;
    const created=await call('items','POST',{kind:'tasks',title:'Определённо для мамы',assigned_to:motherId},child);
    assert.equal(created.status,201);
    let item=(await call('state','GET',null,mother)).data.items.find(i=>i.id===created.data.id);
    assert.equal(item.assignee,motherId);
    assert.equal((await call('items/'+item.id,'PATCH',{assigned_to:childId},mother)).status,200);
    item=(await call('state','GET',null,child)).data.items.find(i=>i.id===item.id);
    assert.equal(item.assignee,childId);
    assert.equal((await call('items/'+item.id,'PATCH',{assigned_to:'outside-household'},mother)).status,403);
    assert.equal((await call('items','POST',{kind:'tasks',title:'Чужому',assigned_to:'outside-household'},child)).status,403);
    assert.equal((await call('items/'+item.id,'PATCH',{assigned_to:''},child)).status,200);
  });
  await t.test('bills are hidden and forbidden to child at API level',async()=>{
    const r=await call('bills','POST',{title:'Аренда',amount:35000,due_day:31},mother);assert.equal(r.status,201);billId=r.data.id;
    assert.equal((await call('bills','POST',{title:'X',amount:1,due_day:1},child)).status,403);
    assert.equal((await call('bills/'+billId,'PATCH',{paid:true},child)).status,403);
    assert.equal((await call('bills/'+billId,'DELETE',{},child)).status,403);
    assert.equal('bills' in (await call('state','GET',null,child)).data,false);
    assert.equal('bills' in (await call('export','GET',null,child)).data,false);
    assert.equal((await call('state','GET',null,mother)).data.bills[0].amount,3500000);
    assert.equal((await call('bills/'+billId,'PATCH',{paid:true},mother)).status,200);
    assert.ok((await call('state','GET',null,mother)).data.bills[0].paid_at);
    const exported=await call('export','GET',null,mother);assert.equal(exported.data.payments.length,1);
    await call('bills/'+billId,'PATCH',{paid:false},mother);
    assert.equal((await call('state','GET',null,mother)).data.bills[0].paid_at,null);
  });
  await t.test('CSRF, validation and session logout are enforced',async()=>{
    assert.equal((await call('note','POST',{note:'foreign'},child,'https://evil.example')).status,403);
    assert.equal((await call('items','POST',{kind:'bogus',title:'x'},child)).status,400);
    assert.equal((await call('bills','POST',{title:'Неверно',amount:0,due_day:32},mother)).status,400);
    assert.equal((await call('logout','POST',{},child)).status,200);
    assert.equal((await call('state','GET',null,child)).status,401);
    const r=await call('login','POST',{email:'child@example.test',password:'TestHousehold123!'});assert.equal(r.status,200);child=r.cookie;
    assert.equal((await call('state','GET',null,child)).status,200);
  });
  await t.test('password changes revoke earlier sessions without exposing other data',async()=>{
    const second=await call('login','POST',{email:'child@example.test',password:'TestHousehold123!'});
    const changed=await call('password','POST',{current:'TestHousehold123!',password:'NewPassword123!'},child);assert.equal(changed.status,200);
    assert.equal((await call('state','GET',null,second.cookie)).status,401);
    assert.equal((await call('state','GET',null,changed.cookie)).status,200);
  });
});
