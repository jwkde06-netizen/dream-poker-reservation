const assert=require('node:assert/strict');
const {canRecoverGatewayPhoto}=require('../.test-build/accounting-recovery');
const j={update_id:1,message_id:299,sender_id:'12',status:'failed',failure_reason:'AI Gateway request failed 403',source_message:{date:1792747448,photo:[{}]},plan:{}};
assert(canRecoverGatewayPhoto(j));
assert(canRecoverGatewayPhoto({...j,failure_reason:'AI_GATEWAY:paid_credits_required:403'}));
for(const patch of [{status:'applied'},{status:'writing'},{status:'uncertain'},{status:'received'},{failure_reason:'Google Sheets request failed 403'},{failure_reason:'AI Gateway request failed 503'},{plan:{changes:[{}]}},{plan:{operations:[{}]}},{plan:{manual_handoff:{}}},{plan:{resolvedBy:1}},{sender_id:'x'},{source_message:{date:1792747448}}])assert(!canRecoverGatewayPhoto({...j,...patch}),JSON.stringify(patch));
console.log('Saved-photo recovery guards passed');
