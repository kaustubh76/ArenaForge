// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWagerEscrow {
    function deposit(uint256 tournamentId, address agent) external payable;
}

contract ArenaCore {
    address public arenaAgent;
    address public escrowAddress;
    address public registryAddress;
    uint256 public tournamentCounter;

    enum TournamentStatus {
        Open,
        Active,
        Completed,
        Cancelled
    }

    enum TournamentFormat {
        SwissSystem,
        SingleElimination
    }

    enum GameType {
        OracleDuel,
        StrategyArena,
        AuctionWars,
        QuizBowl
    }

    struct Tournament {
        uint256 id;
        string name;
        GameType gameType;
        TournamentFormat format;
        TournamentStatus status;
        uint256 entryStake;
        uint256 maxParticipants;
        uint256 currentParticipants;
        uint256 prizePool;
        uint256 startTime;
        uint256 roundCount;
        uint256 currentRound;
        bytes32 parametersHash;
    }

    struct AgentProfile {
        address agentAddress;
        string moltbookHandle;
        string avatarURI;
        uint256 elo;
        uint256 matchesPlayed;
        uint256 wins;
        uint256 losses;
        int256 currentStreak;
        uint256 longestWinStreak;
        bool registered;
    }

    mapping(uint256 => Tournament) public tournaments;
    mapping(address => AgentProfile) public agents;
    mapping(uint256 => address[]) internal _tournamentParticipants;
    mapping(uint256 => mapping(address => bool)) public isParticipant;
    mapping(uint256 => address) public gameModeContracts;

    event TournamentCreated(uint256 indexed id, GameType gameType, uint256 entryStake);
    event AgentRegistered(address indexed agent, string moltbookHandle);
    event AgentJoinedTournament(uint256 indexed tournamentId, address indexed agent);
    event TournamentStarted(uint256 indexed tournamentId);
    event TournamentCompleted(uint256 indexed tournamentId, address winner);
    event ParametersEvolved(uint256 indexed tournamentId, bytes32 newParamsHash);
    event AvatarUpdated(address indexed agent, string avatarURI);

    modifier onlyArenaAgent() {
        require(msg.sender == arenaAgent, "Only arena agent");
        _;
    }

    constructor(address _arenaAgent, address _escrowAddress, address _registryAddress) {
        arenaAgent = _arenaAgent;
        escrowAddress = _escrowAddress;
        registryAddress = _registryAddress;
    }

    function registerAgent(string calldata moltbookHandle) external {
        require(!agents[msg.sender].registered, "Already registered");
        require(bytes(moltbookHandle).length > 0, "Empty handle");

        agents[msg.sender] = AgentProfile({
            agentAddress: msg.sender,
            moltbookHandle: moltbookHandle,
            avatarURI: "",
            elo: 1200,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            currentStreak: 0,
            longestWinStreak: 0,
            registered: true
        });

        emit AgentRegistered(msg.sender, moltbookHandle);
    }

    function createTournament(
        string calldata name,
        GameType gameType,
        TournamentFormat format,
        uint256 entryStake,
        uint256 maxParticipants,
        uint256 roundCount,
        bytes32 parametersHash
    ) external onlyArenaAgent returns (uint256) {
        require(maxParticipants >= 2, "Need at least 2 max");
        require(roundCount > 0, "Need at least 1 round");

        uint256 id = ++tournamentCounter;
        tournaments[id] = Tournament({
            id: id,
            name: name,
            gameType: gameType,
            format: format,
            status: TournamentStatus.Open,
            entryStake: entryStake,
            maxParticipants: maxParticipants,
            currentParticipants: 0,
            prizePool: 0,
            startTime: 0,
            roundCount: roundCount,
            currentRound: 0,
            parametersHash: parametersHash
        });

        emit TournamentCreated(id, gameType, entryStake);
        return id;
    }

    function joinTournament(uint256 tournamentId) external payable {
        Tournament storage t = tournaments[tournamentId];
        require(t.id != 0, "Tournament not found");
        require(t.status == TournamentStatus.Open, "Not open");
        require(agents[msg.sender].registered, "Not registered");
        require(!isParticipant[tournamentId][msg.sender], "Already joined");
        require(msg.value == t.entryStake, "Wrong stake amount");
        require(t.currentParticipants < t.maxParticipants, "Tournament full");

        isParticipant[tournamentId][msg.sender] = true;
        _tournamentParticipants[tournamentId].push(msg.sender);
        t.currentParticipants++;
        t.prizePool += msg.value;

        IWagerEscrow(escrowAddress).deposit{value: msg.value}(tournamentId, msg.sender);

        emit AgentJoinedTournament(tournamentId, msg.sender);
    }

    function startTournament(uint256 tournamentId) external onlyArenaAgent {
        Tournament storage t = tournaments[tournamentId];
        require(t.id != 0, "Tournament not found");
        require(t.status == TournamentStatus.Open, "Not open");
        require(t.currentParticipants >= 2, "Need at least 2 participants");

        t.status = TournamentStatus.Active;
        t.startTime = block.timestamp;
        t.currentRound = 1;

        emit TournamentStarted(tournamentId);
    }

    function completeTournament(uint256 tournamentId, address winner) external onlyArenaAgent {
        Tournament storage t = tournaments[tournamentId];
        require(t.id != 0, "Tournament not found");
        require(t.status == TournamentStatus.Active, "Not active");

        t.status = TournamentStatus.Completed;
        emit TournamentCompleted(tournamentId, winner);
    }

    function cancelTournament(uint256 tournamentId) external onlyArenaAgent {
        Tournament storage t = tournaments[tournamentId];
        require(t.id != 0, "Tournament not found");
        require(t.status == TournamentStatus.Open, "Can only cancel open");

        t.status = TournamentStatus.Cancelled;
    }

    function advanceRound(uint256 tournamentId) external onlyArenaAgent {
        Tournament storage t = tournaments[tournamentId];
        require(t.status == TournamentStatus.Active, "Not active");
        require(t.currentRound < t.roundCount, "All rounds done");

        t.currentRound++;
    }

    function evolveParameters(uint256 tournamentId, bytes32 newParametersHash) external onlyArenaAgent {
        Tournament storage t = tournaments[tournamentId];
        require(t.status == TournamentStatus.Active, "Not active");

        t.parametersHash = newParametersHash;
        emit ParametersEvolved(tournamentId, newParametersHash);
    }

    function updateElo(address agent, uint256 newElo, bool won) external onlyArenaAgent {
        AgentProfile storage a = agents[agent];
        require(a.registered, "Agent not registered");

        a.elo = newElo;
        a.matchesPlayed++;
        if (won) {
            a.wins++;
            // Update win streak: if positive, increment; otherwise start new streak at 1
            a.currentStreak = a.currentStreak > 0 ? a.currentStreak + 1 : int256(1);
            // Update longest win streak if current exceeds it
            if (uint256(a.currentStreak) > a.longestWinStreak) {
                a.longestWinStreak = uint256(a.currentStreak);
            }
        } else {
            a.losses++;
            // Update loss streak: if negative, decrement; otherwise start new streak at -1
            a.currentStreak = a.currentStreak < 0 ? a.currentStreak - 1 : int256(-1);
        }
    }

    function updateAvatar(string calldata _avatarURI) external {
        require(agents[msg.sender].registered, "Not registered");
        agents[msg.sender].avatarURI = _avatarURI;
        emit AvatarUpdated(msg.sender, _avatarURI);
    }

    function registerGameMode(uint256 gameTypeId, address contractAddress) external onlyArenaAgent {
        gameModeContracts[gameTypeId] = contractAddress;
    }

    function getTournamentParticipants(uint256 tournamentId) external view returns (address[] memory) {
        return _tournamentParticipants[tournamentId];
    }

    function getTournament(uint256 id) external view returns (Tournament memory) {
        return tournaments[id];
    }

    function getAgent(address agent) external view returns (AgentProfile memory) {
        return agents[agent];
    }
}
