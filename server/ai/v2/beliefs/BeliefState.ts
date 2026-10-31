import type {PrivatePlayerState,PublicGameState} from '../../../../shared/types';
import {CardTracker} from '../../planning/CardTracker';
/** Snapshot ownership; recreated for every observer decision, no room caches. */
export class BeliefState {
 readonly hardVoids;
 readonly knownPlayed;
 constructor(readonly publicState:PublicGameState,readonly privateState:PrivatePlayerState){
  this.hardVoids=CardTracker.getVoidMatrix(publicState);
  this.knownPlayed=[...CardTracker.getPlayedCards(publicState),...Object.values(privateState.knownConcealedCards??{})];
 }
}
