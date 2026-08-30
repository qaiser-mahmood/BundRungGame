import {
  TeamId,
  TrumpMode,
  OpenTrumpModifier,
  BwinjiModifier,
  ScorecardState,
  ScorecardEntry,
} from '../../shared/types';

export interface ScoreCalculationInput {
  gameIndex: number;
  dealerPlayerId: string;
  dealerTeam: TeamId;
  trumpMode: TrumpMode;
  modifier?: OpenTrumpModifier | BwinjiModifier | 'STANDARD';
  colorChosenByTeam: TeamId;
  colorChosenByPlayerId: string;
  winningTeam: TeamId;
}

export interface ScoreCalculationResult {
  scoreAdjustment: number;
  newDealerScore: number;
  dealerTransferred: boolean;
  inheritedPositiveScore: number | null;
  isKhoti: boolean;
  losingTeam: TeamId | null;
  winningTeam: TeamId | null;
  entry: ScorecardEntry;
}

export class ScoringEngine {
  private state: ScorecardState;

  constructor() {
    this.state = this.getInitialState();
  }

  public getInitialState(): ScorecardState {
    return {
      dealerScore: 0,
      history: [],
      team1CumulativeKhotiPoints: 0,
      team2CumulativeKhotiPoints: 0,
    };
  }

  public getState(): ScorecardState {
    return {
      ...this.state,
      history: [...this.state.history],
    };
  }

  public resetMatch(): void {
    this.state = this.getInitialState();
  }

  /**
   * Evaluates the point adjustment according to the Section 6.2 Master Scoring Matrix
   */
  public static calculateAdjustment(
    trumpMode: TrumpMode,
    modifier: string,
    colorChosenByTeam: TeamId,
    dealerTeam: TeamId,
    winningTeam: TeamId
  ): number {
    const isDealerTeamColor = colorChosenByTeam === dealerTeam;
    const isDealerTeamWin = winningTeam === dealerTeam;

    if (trumpMode === 'CLOSE_TRUMP') {
      if (!isDealerTeamColor) {
        // Color Chosen By Other Team
        return isDealerTeamWin ? -26 : +13;
      } else {
        // Color Chosen By Dealer Team
        return isDealerTeamWin ? -13 : +26;
      }
    }

    if (trumpMode === 'OPEN_TRUMP') {
      if (modifier === 'FACE_UP' || modifier === 'STANDARD') {
        if (!isDealerTeamColor) {
          return isDealerTeamWin ? -52 : +26;
        } else {
          return isDealerTeamWin ? -26 : +52;
        }
      } else if (modifier === 'FACE_DOWN_NO_PLAY') {
        if (!isDealerTeamColor) {
          return +26; // Other Team Wins automatically
        } else {
          return -26; // Dealer Team Wins automatically
        }
      } else if (modifier === 'FACE_DOWN_PLAY') {
        if (!isDealerTeamColor) {
          return isDealerTeamWin ? -104 : +52;
        } else {
          return isDealerTeamWin ? -52 : +104;
        }
      }
    }

    if (trumpMode === 'BWINJI') {
      if (modifier === 'FACE_UP' || modifier === 'STANDARD') {
        if (!isDealerTeamColor) {
          return isDealerTeamWin ? -104 : +52;
        } else {
          return isDealerTeamWin ? -52 : +104;
        }
      } else if (modifier === 'FACE_DOWN_NO_PLAY') {
        if (!isDealerTeamColor) {
          return +52; // Other Team Wins
        } else {
          return -52; // Dealer Team Wins
        }
      } else if (modifier === 'FACE_DOWN_PLAY') {
        if (!isDealerTeamColor) {
          return isDealerTeamWin ? -208 : +104;
        } else {
          return isDealerTeamWin ? -104 : +208;
        }
      }
    }

    throw new Error(`Invalid scoring configuration: ${trumpMode}, ${modifier}`);
  }

  /**
   * Applies the game result to the Scorecard, handles dealership transfer on < 0,
   * and tracks 100-point KHOTI threshold.
   */
  public applyGameResult(input: ScoreCalculationInput): ScoreCalculationResult {
    const modifierStr = input.modifier || 'STANDARD';
    const adjustment = ScoringEngine.calculateAdjustment(
      input.trumpMode,
      modifierStr,
      input.colorChosenByTeam,
      input.dealerTeam,
      input.winningTeam
    );

    const calculatedScore = this.state.dealerScore + adjustment;
    let newScore = calculatedScore;
    let dealerTransferred = false;
    let inheritedPositiveScore: number | null = null;
    let isKhoti = false;
    let losingTeam: TeamId | null = null;
    let winningTeam: TeamId | null = null;

    /**
     * Criteria from scoreTable.txt:
     * 1. If score reaches above 100 (>= 100):
     *    The dealer team is KHOTI and dealership transfers to second player of dealer team starting with 0 score.
     * 2. If score reaches below -100 (<= -100):
     *    The opponent team is KHOTI and dealership transfers to player right of dealer starting with 0 score.
     * 3. If score reaches below 0 but above -100 (< 0 && > -100):
     *    Only dealership transfers to player right of dealer starting with absolute value of score. No KHOTI is declared.
     */
    if (calculatedScore >= 100) {
      isKhoti = true;
      losingTeam = input.dealerTeam;
      winningTeam = input.dealerTeam === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1';
      newScore = calculatedScore;
    } else if (calculatedScore <= -100) {
      isKhoti = true;
      losingTeam = input.dealerTeam === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1';
      winningTeam = input.dealerTeam;
      newScore = calculatedScore;
    } else if (calculatedScore < 0) {
      dealerTransferred = true;
      inheritedPositiveScore = Math.abs(calculatedScore);
      newScore = inheritedPositiveScore;
    } else {
      newScore = calculatedScore;
    }

    this.state.dealerScore = newScore;

    if (input.dealerTeam === 'TEAM_1') {
      this.state.team1CumulativeKhotiPoints = this.state.dealerScore;
    } else {
      this.state.team2CumulativeKhotiPoints = this.state.dealerScore;
    }

    const entry: ScorecardEntry = {
      gameIndex: input.gameIndex,
      dealerPlayerId: input.dealerPlayerId,
      dealerTeam: input.dealerTeam,
      trumpMode: input.trumpMode,
      modifier: modifierStr,
      colorChosenByTeam: input.colorChosenByTeam,
      colorChosenByPlayerId: input.colorChosenByPlayerId,
      winningTeam: input.winningTeam,
      scoreAdjustment: adjustment,
      scorecardAfter: newScore,
      dealerTransferred,
      notes: isKhoti
        ? calculatedScore >= 100
          ? `Score reached ${calculatedScore} (>= 100). Dealer team (${losingTeam}) is declared KHOTI!`
          : `Score reached ${calculatedScore} (<= -100). Opponent team (${losingTeam}) is declared KHOTI!`
        : dealerTransferred
        ? `Score fell below 0 (${calculatedScore}). Dealership transfers to player right of dealer with +${inheritedPositiveScore} pts.`
        : `Scorecard updated to ${newScore} points.`,
    };

    this.state.history.push(entry);

    return {
      scoreAdjustment: adjustment,
      newDealerScore: newScore,
      dealerTransferred,
      inheritedPositiveScore,
      isKhoti,
      losingTeam,
      winningTeam,
      entry,
    };
  }
}
