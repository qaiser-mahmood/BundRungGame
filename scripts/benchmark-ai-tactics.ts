import {tacticalFixtures} from './ai-tactical-fixtures';
import {rankPartnershipActions} from '../server/ai/planning/PartnershipStrategy';
const results=tacticalFixtures().map(f=>{const actual=rankPartnershipActions(f.state,f.priv,f.legal)[0].card.id;return {name:f.name,expected:f.expected,actual,passed:actual===f.expected};});
console.log(JSON.stringify({scope:'partnership continuation preferences; synthetic observations, not match strength',passed:results.filter(r=>r.passed).length,total:results.length,results},null,2));
if(results.some(r=>!r.passed))process.exitCode=1;
