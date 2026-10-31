import type { PlayedCard, VisiblePlayedCard } from './types';
export function isVisiblePlay(play: VisiblePlayedCard): play is PlayedCard {
  return play.card !== null;
}
