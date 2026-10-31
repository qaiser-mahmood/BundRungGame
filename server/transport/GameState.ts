import type {FullClientGameState} from '../../shared/types';
import type {BundRungEngine} from '../engine/BundRungEngine';
/** All gameStateUpdated emissions use the engine's viewer serialization. */
export function sendGameState(target:{emit(event:'gameStateUpdated',state:FullClientGameState):unknown},engine:BundRungEngine,viewer=''):void {
  target.emit('gameStateUpdated',engine.getClientGameState(viewer));
}
