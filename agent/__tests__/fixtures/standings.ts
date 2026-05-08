import type { AgentStanding } from "../../game-engine/game-mode.interface";
import { agentAddresses, handles } from "./agents";

function makeStanding(idx: number, elo: number): AgentStanding {
  return {
    address: agentAddresses[idx],
    handle: handles[idx],
    elo,
    tournamentPoints: 0,
    eliminated: false,
  };
}

// Four-player roster with descending ELO.
export const sampleStandings4: AgentStanding[] = [
  makeStanding(0, 1600),
  makeStanding(1, 1500),
  makeStanding(2, 1400),
  makeStanding(3, 1300),
];

// Eight-player roster with descending ELO.
export const sampleStandings8: AgentStanding[] = [
  makeStanding(0, 1700),
  makeStanding(1, 1600),
  makeStanding(2, 1550),
  makeStanding(3, 1500),
  makeStanding(4, 1450),
  makeStanding(5, 1400),
  makeStanding(6, 1350),
  makeStanding(7, 1300),
];

export { makeStanding };
