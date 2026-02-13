// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract StrategyArena {
    address public arenaAgent;

    enum Move {
        None,
        Cooperate,
        Defect
    }

    struct GameRound {
        bytes32 player1Commitment;
        bytes32 player2Commitment;
        Move player1Move;
        Move player2Move;
        bool player1Revealed;
        bool player2Revealed;
        bool resolved;
    }

    struct MatchState {
        address player1;
        address player2;
        uint256 totalRounds;
        uint256 currentRound;
        uint256 player1Score;
        uint256 player2Score;
        uint256 commitDeadline;
        uint256 revealDeadline;
        bool initialized;
    }

    // Payoff matrix (basis points of round sub-stake)
    uint256 public cooperateCooperate = 6000;
    uint256 public defectCooperate = 10000;
    uint256 public cooperateDefect = 0;
    uint256 public defectDefect = 2000;

    mapping(uint256 => MatchState) public matchStates;
    mapping(uint256 => mapping(uint256 => GameRound)) public gameRounds;

    event MatchInitialized(uint256 indexed matchId, address player1, address player2, uint256 rounds);
    event MoveCommitted(uint256 indexed matchId, uint256 round, address player);
    event MoveRevealed(uint256 indexed matchId, uint256 round, address player, Move move);
    event RoundResolved(uint256 indexed matchId, uint256 round, uint256 p1Payoff, uint256 p2Payoff);

    modifier onlyArenaAgent() {
        require(msg.sender == arenaAgent, "Only arena agent");
        _;
    }

    constructor(address _arenaAgent) {
        arenaAgent = _arenaAgent;
    }

    function initMatch(
        uint256 matchId,
        address player1,
        address player2,
        uint256 totalRounds,
        uint256 commitTimeout,
        uint256 revealTimeout
    ) external onlyArenaAgent {
        require(!matchStates[matchId].initialized, "Already initialized");
        require(player1 != player2, "Same player");

        matchStates[matchId] = MatchState({
            player1: player1,
            player2: player2,
            totalRounds: totalRounds,
            currentRound: 1,
            player1Score: 0,
            player2Score: 0,
            commitDeadline: block.timestamp + commitTimeout,
            revealDeadline: block.timestamp + commitTimeout + revealTimeout,
            initialized: true
        });

        emit MatchInitialized(matchId, player1, player2, totalRounds);
    }

    function commitMove(uint256 matchId, bytes32 moveHash) external {
        MatchState storage state = matchStates[matchId];
        require(state.initialized, "Not initialized");

        GameRound storage round = gameRounds[matchId][state.currentRound];
        require(!round.resolved, "Round resolved");

        if (msg.sender == state.player1) {
            require(round.player1Commitment == bytes32(0), "Already committed");
            round.player1Commitment = moveHash;
        } else if (msg.sender == state.player2) {
            require(round.player2Commitment == bytes32(0), "Already committed");
            round.player2Commitment = moveHash;
        } else {
            revert("Not a player");
        }

        emit MoveCommitted(matchId, state.currentRound, msg.sender);
    }

    function revealMove(uint256 matchId, Move move, bytes32 salt) external {
        MatchState storage state = matchStates[matchId];
        require(state.initialized, "Not initialized");
        require(move == Move.Cooperate || move == Move.Defect, "Invalid move");

        GameRound storage round = gameRounds[matchId][state.currentRound];
        require(!round.resolved, "Round resolved");

        bytes32 expectedHash = keccak256(abi.encodePacked(move, salt));

        if (msg.sender == state.player1) {
            require(round.player1Commitment == expectedHash, "Hash mismatch");
            require(!round.player1Revealed, "Already revealed");
            round.player1Move = move;
            round.player1Revealed = true;
        } else if (msg.sender == state.player2) {
            require(round.player2Commitment == expectedHash, "Hash mismatch");
            require(!round.player2Revealed, "Already revealed");
            round.player2Move = move;
            round.player2Revealed = true;
        } else {
            revert("Not a player");
        }

        emit MoveRevealed(matchId, state.currentRound, msg.sender, move);
    }

    function resolveRound(uint256 matchId) external onlyArenaAgent {
        MatchState storage state = matchStates[matchId];
        require(state.initialized, "Not initialized");

        GameRound storage round = gameRounds[matchId][state.currentRound];
        require(!round.resolved, "Already resolved");
        require(round.player1Revealed && round.player2Revealed, "Not all revealed");

        (uint256 p1Payoff, uint256 p2Payoff) = calculatePayoffs(round.player1Move, round.player2Move);

        state.player1Score += p1Payoff;
        state.player2Score += p2Payoff;
        round.resolved = true;

        emit RoundResolved(matchId, state.currentRound, p1Payoff, p2Payoff);
    }

    function advanceRound(uint256 matchId, uint256 commitTimeout, uint256 revealTimeout) external onlyArenaAgent {
        MatchState storage state = matchStates[matchId];
        require(state.initialized, "Not initialized");
        require(gameRounds[matchId][state.currentRound].resolved, "Current round not resolved");
        require(state.currentRound < state.totalRounds, "All rounds done");

        state.currentRound++;
        state.commitDeadline = block.timestamp + commitTimeout;
        state.revealDeadline = block.timestamp + commitTimeout + revealTimeout;
    }

    function forfeitRound(uint256 matchId, address forfeiter) external onlyArenaAgent {
        MatchState storage state = matchStates[matchId];
        require(state.initialized, "Not initialized");

        GameRound storage round = gameRounds[matchId][state.currentRound];
        require(!round.resolved, "Already resolved");

        if (forfeiter == state.player1) {
            state.player2Score += 10000;
        } else if (forfeiter == state.player2) {
            state.player1Score += 10000;
        } else {
            revert("Not a player");
        }

        round.resolved = true;
        emit RoundResolved(matchId, state.currentRound, state.player1Score, state.player2Score);
    }

    function updatePayoffMatrix(
        uint256 _cc,
        uint256 _dc,
        uint256 _cd,
        uint256 _dd
    ) external onlyArenaAgent {
        cooperateCooperate = _cc;
        defectCooperate = _dc;
        cooperateDefect = _cd;
        defectDefect = _dd;
    }

    function calculatePayoffs(Move p1, Move p2) public view returns (uint256 p1Payoff, uint256 p2Payoff) {
        if (p1 == Move.Cooperate && p2 == Move.Cooperate) {
            return (cooperateCooperate, cooperateCooperate);
        } else if (p1 == Move.Defect && p2 == Move.Cooperate) {
            return (defectCooperate, cooperateDefect);
        } else if (p1 == Move.Cooperate && p2 == Move.Defect) {
            return (cooperateDefect, defectCooperate);
        } else {
            return (defectDefect, defectDefect);
        }
    }

    function getMatchState(uint256 matchId) external view returns (MatchState memory) {
        return matchStates[matchId];
    }

    function getRound(uint256 matchId, uint256 roundNum) external view returns (GameRound memory) {
        return gameRounds[matchId][roundNum];
    }
}
