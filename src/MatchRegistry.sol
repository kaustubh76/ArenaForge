// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MatchRegistry {
    address public arenaAgent;
    address public authorizedCaller;

    enum MatchStatus {
        Scheduled,
        InProgress,
        Completed,
        Disputed
    }

    struct Match {
        uint256 id;
        uint256 tournamentId;
        uint256 round;
        address player1;
        address player2;
        address winner;
        bytes32 resultHash;
        uint256 timestamp;
        uint256 startTime;
        uint256 duration;
        MatchStatus status;
    }

    uint256 public matchCounter;
    uint256 public constant DISPUTE_WINDOW = 30;

    struct ReplayMetadata {
        bytes32[] roundStateHashes;
        uint256 roundCount;
        bool available;
    }

    mapping(uint256 => Match) public matches;
    mapping(uint256 => uint256[]) internal _tournamentMatches;
    mapping(address => uint256[]) internal _agentMatches;
    mapping(uint256 => ReplayMetadata) internal _replayData;

    event MatchCreated(uint256 indexed matchId, uint256 indexed tournamentId, address player1, address player2);
    event MatchStarted(uint256 indexed matchId);
    event MatchCompleted(uint256 indexed matchId, address winner);
    event MatchDisputed(uint256 indexed matchId, address disputer);
    event ReplayDataStored(uint256 indexed matchId, uint256 roundCount);

    modifier onlyArenaAgent() {
        require(msg.sender == arenaAgent || msg.sender == authorizedCaller, "Not authorized");
        _;
    }

    constructor(address _arenaAgent) {
        arenaAgent = _arenaAgent;
    }

    function setAuthorizedCaller(address _caller) external {
        require(msg.sender == arenaAgent, "Only arena agent");
        authorizedCaller = _caller;
    }

    function createMatch(
        uint256 tournamentId,
        uint256 round,
        address player1,
        address player2
    ) external onlyArenaAgent returns (uint256) {
        require(player1 != player2, "Same player");
        require(player1 != address(0) && player2 != address(0), "Zero address");

        uint256 id = ++matchCounter;
        matches[id] = Match({
            id: id,
            tournamentId: tournamentId,
            round: round,
            player1: player1,
            player2: player2,
            winner: address(0),
            resultHash: bytes32(0),
            timestamp: 0,
            startTime: 0,
            duration: 0,
            status: MatchStatus.Scheduled
        });

        _tournamentMatches[tournamentId].push(id);
        _agentMatches[player1].push(id);
        _agentMatches[player2].push(id);

        emit MatchCreated(id, tournamentId, player1, player2);
        return id;
    }

    function startMatch(uint256 matchId) external onlyArenaAgent {
        Match storage m = matches[matchId];
        require(m.id != 0, "Match not found");
        require(m.status == MatchStatus.Scheduled, "Not scheduled");
        m.status = MatchStatus.InProgress;
        m.timestamp = block.timestamp;
        m.startTime = block.timestamp;
        emit MatchStarted(matchId);
    }

    function recordResult(uint256 matchId, address winner, bytes32 resultHash) external onlyArenaAgent {
        Match storage m = matches[matchId];
        require(m.id != 0, "Match not found");
        require(m.status == MatchStatus.InProgress, "Not in progress");
        require(
            winner == address(0) || winner == m.player1 || winner == m.player2,
            "Invalid winner"
        );

        m.winner = winner;
        m.resultHash = resultHash;
        m.duration = block.timestamp - m.startTime;
        m.timestamp = block.timestamp;
        m.status = MatchStatus.Completed;

        emit MatchCompleted(matchId, winner);
    }

    function disputeMatch(uint256 matchId) external {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Completed, "Not completed");
        require(msg.sender == m.player1 || msg.sender == m.player2, "Not a player");
        require(block.timestamp <= m.timestamp + DISPUTE_WINDOW, "Dispute window closed");

        m.status = MatchStatus.Disputed;
        emit MatchDisputed(matchId, msg.sender);
    }

    function getTournamentMatches(uint256 tournamentId) external view returns (uint256[] memory) {
        return _tournamentMatches[tournamentId];
    }

    function getAgentMatches(address agent) external view returns (uint256[] memory) {
        return _agentMatches[agent];
    }

    function getMatch(uint256 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    // ========== Replay Data Functions ==========

    function storeRoundState(uint256 matchId, bytes32 stateHash) external onlyArenaAgent {
        require(matches[matchId].id != 0, "Match not found");

        _replayData[matchId].roundStateHashes.push(stateHash);
        _replayData[matchId].roundCount++;
        _replayData[matchId].available = true;

        emit ReplayDataStored(matchId, _replayData[matchId].roundCount);
    }

    function getReplayData(uint256 matchId) external view returns (
        bytes32[] memory roundStateHashes,
        uint256 roundCount,
        bool available
    ) {
        ReplayMetadata storage data = _replayData[matchId];
        return (data.roundStateHashes, data.roundCount, data.available);
    }

    function isReplayAvailable(uint256 matchId) external view returns (bool) {
        return _replayData[matchId].available;
    }

    function getReplayRoundCount(uint256 matchId) external view returns (uint256) {
        return _replayData[matchId].roundCount;
    }

    function getRoundStateHash(uint256 matchId, uint256 roundIndex) external view returns (bytes32) {
        require(roundIndex < _replayData[matchId].roundCount, "Invalid round index");
        return _replayData[matchId].roundStateHashes[roundIndex];
    }
}
