import { GameType, SeatPosition, TeamId } from '../../shared/types';

/**
 * BaseRungEngine
 * Extensible base platform for Rung card games (Bund Rung, Open Rung, etc.)
 */
export abstract class BaseRungEngine {
  public gameType: GameType = 'BUND_RUNG';

  constructor(gameType: GameType = 'BUND_RUNG') {
    this.gameType = gameType;
  }

  public getGameType(): GameType {
    return this.gameType;
  }

  public setGameType(gameType: GameType): void {
    this.gameType = gameType;
  }

  public static readonly SEAT_ORDER: SeatPosition[] = ['BOTTOM', 'RIGHT', 'TOP', 'LEFT'];

  public static getTeamForSeat(seat: SeatPosition): TeamId {
    return seat === 'BOTTOM' || seat === 'TOP' ? 'TEAM_1' : 'TEAM_2';
  }
}
