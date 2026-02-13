// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AuctionWars {
    address public arenaAgent;

    struct AuctionRound {
        bytes32 mysteryBoxHash;
        uint256 biddingDeadline;
        uint256 revealDeadline;
        uint256 actualValue;
        address winner;
        uint256 winningBid;
        bool resolved;
    }

    struct Bid {
        address agent;
        bytes32 bidHash;
        uint256 revealedAmount;
        bool committed;
        bool revealed;
    }

    struct MatchState {
        uint256 totalRounds;
        uint256 currentRound;
        address[] players;
        mapping(address => int256) scores;
        bool initialized;
    }

    mapping(uint256 => MatchState) internal _matchStates;
    mapping(uint256 => mapping(uint256 => AuctionRound)) public auctionRounds;
    mapping(uint256 => mapping(uint256 => mapping(address => Bid))) public bids;

    event AuctionStarted(uint256 indexed matchId, uint256 round, bytes32 mysteryBoxHash);
    event BidCommitted(uint256 indexed matchId, uint256 round, address agent);
    event BidRevealed(uint256 indexed matchId, uint256 round, address agent, uint256 amount);
    event AuctionResolved(uint256 indexed matchId, uint256 round, address winner, uint256 winningBid, uint256 actualValue);

    modifier onlyArenaAgent() {
        require(msg.sender == arenaAgent, "Only arena agent");
        _;
    }

    constructor(address _arenaAgent) {
        arenaAgent = _arenaAgent;
    }

    function initMatch(uint256 matchId, address[] calldata players, uint256 totalRounds) external onlyArenaAgent {
        require(!_matchStates[matchId].initialized, "Already initialized");
        require(players.length >= 2, "Need at least 2 players");

        MatchState storage state = _matchStates[matchId];
        state.totalRounds = totalRounds;
        state.currentRound = 0;
        state.players = players;
        state.initialized = true;
    }

    function startAuctionRound(
        uint256 matchId,
        bytes32 mysteryBoxHash,
        uint256 biddingDuration,
        uint256 revealDuration
    ) external onlyArenaAgent {
        MatchState storage state = _matchStates[matchId];
        require(state.initialized, "Not initialized");

        state.currentRound++;
        require(state.currentRound <= state.totalRounds, "All rounds done");

        auctionRounds[matchId][state.currentRound] = AuctionRound({
            mysteryBoxHash: mysteryBoxHash,
            biddingDeadline: block.timestamp + biddingDuration,
            revealDeadline: block.timestamp + biddingDuration + revealDuration,
            actualValue: 0,
            winner: address(0),
            winningBid: 0,
            resolved: false
        });

        emit AuctionStarted(matchId, state.currentRound, mysteryBoxHash);
    }

    function commitBid(uint256 matchId, uint256 roundNum, bytes32 bidHash) external {
        MatchState storage state = _matchStates[matchId];
        require(state.initialized, "Not initialized");
        require(_isPlayer(matchId, msg.sender), "Not a player");

        AuctionRound storage round = auctionRounds[matchId][roundNum];
        require(!round.resolved, "Round resolved");
        require(block.timestamp <= round.biddingDeadline, "Bidding closed");

        Bid storage b = bids[matchId][roundNum][msg.sender];
        require(!b.committed, "Already committed");

        b.agent = msg.sender;
        b.bidHash = bidHash;
        b.committed = true;

        emit BidCommitted(matchId, roundNum, msg.sender);
    }

    function revealBid(uint256 matchId, uint256 roundNum, uint256 amount, bytes32 salt) external {
        MatchState storage state = _matchStates[matchId];
        require(state.initialized, "Not initialized");

        AuctionRound storage round = auctionRounds[matchId][roundNum];
        require(!round.resolved, "Round resolved");
        require(block.timestamp <= round.revealDeadline, "Reveal closed");

        Bid storage b = bids[matchId][roundNum][msg.sender];
        require(b.committed, "Not committed");
        require(!b.revealed, "Already revealed");

        bytes32 expectedHash = keccak256(abi.encodePacked(amount, salt));
        require(b.bidHash == expectedHash, "Hash mismatch");

        b.revealedAmount = amount;
        b.revealed = true;

        emit BidRevealed(matchId, roundNum, msg.sender, amount);
    }

    function resolveAuction(uint256 matchId, uint256 roundNum, uint256 actualValue) external onlyArenaAgent {
        MatchState storage state = _matchStates[matchId];
        AuctionRound storage round = auctionRounds[matchId][roundNum];
        require(!round.resolved, "Already resolved");

        round.actualValue = actualValue;

        address highestBidder;
        uint256 highestBid;

        for (uint256 i = 0; i < state.players.length; i++) {
            Bid storage b = bids[matchId][roundNum][state.players[i]];
            if (b.revealed && b.revealedAmount > highestBid) {
                highestBid = b.revealedAmount;
                highestBidder = state.players[i];
            }
        }

        round.winner = highestBidder;
        round.winningBid = highestBid;
        round.resolved = true;

        // Score = actualValue - bid (can be negative)
        if (highestBidder != address(0)) {
            _matchStates[matchId].scores[highestBidder] += int256(actualValue) - int256(highestBid);
        }

        emit AuctionResolved(matchId, roundNum, highestBidder, highestBid, actualValue);
    }

    function getScore(uint256 matchId, address player) external view returns (int256) {
        return _matchStates[matchId].scores[player];
    }

    function getPlayers(uint256 matchId) external view returns (address[] memory) {
        return _matchStates[matchId].players;
    }

    function getCurrentRound(uint256 matchId) external view returns (uint256) {
        return _matchStates[matchId].currentRound;
    }

    function _isPlayer(uint256 matchId, address player) internal view returns (bool) {
        address[] storage players = _matchStates[matchId].players;
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == player) return true;
        }
        return false;
    }
}
