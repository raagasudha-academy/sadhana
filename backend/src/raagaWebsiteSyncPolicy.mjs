/** Keep M95 pilot behaviour unchanged, but use an independently acknowledged
 * final-only policy for post-import Raagasudha website synchronisation.
 */
const fail = (status,message) => {throw Object.assign(new Error(message),{status});};
export function assertRaagaWebsiteSyncPolicy(execute=false,env=process.env) {
  if(env.SADHANA_ENTITY_TABLE_SET==='final') {
    if(env.SADHANA_DATA_MODE==='split'||env.SADHANA_ENTITY_FINAL_ACK!=='enabled')
      fail(503,'Final-table website sync is not authorised.');
    if(execute&&(env.SADHANA_FINAL_RAAGA_WEBSITE_SYNC_WRITES!=='enabled'||
                 env.SADHANA_FINAL_RAAGA_IDENTITY_RECONCILED!=='enabled'))
      fail(403,'Final Raagasudha website sync writes are disabled.');
    return;
  }
  if(env.M95_ONBOARDING_MODE!=='enabled')fail(404,'Not enabled.');
  if(execute&&env.M95_WEBSITE_SYNC_WRITES!=='enabled')fail(403,'M9 website status writes are disabled.');
}
