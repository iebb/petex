const {test}=require('node:test'),assert=require('node:assert/strict');
const {snapPosition,walkTarget}=require('../app/placement.cjs');
const area={x:-1600,y:50,width:1600,height:1000};
test('edge snapping works on negative-coordinate displays and leaves distant positions alone',()=>{
  assert.deepEqual(snapPosition({x:-1592,y:63,width:192,height:208},area),{x:-1600,y:50});
  assert.deepEqual(snapPosition({x:-200,y:833,width:192,height:208},area),{x:-192,y:842});
  assert.deepEqual(snapPosition({x:-900,y:200,width:192,height:208},area),{x:-900,y:200});
});
test('short walks stay inside their starting display and stop at its edges',()=>{
  assert.deepEqual(walkTarget({x:-1580,y:300,width:192,height:208},area,'running-left',96),{x:-1600,y:300});
  assert.deepEqual(walkTarget({x:-200,y:300,width:192,height:208},area,'running-right',96),{x:-192,y:300});
});
