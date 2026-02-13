// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OracleDuel {
    address public arenaAgent;

    struct Duel {
        uint256 matchId;
        address tokenAddress;
        uint256 snapshotPrice;
        uint256 resolutionTime;
        address bullPlayer;
        address bearPlayer;
        uint256 resolvedPrice;
        bool resolved;
    }

    mapping(uint256 => Duel) public duels;

    event DuelInitialized(uint256 indexed matchId, address tokenAddress, address bullPlayer, address bearPlayer);
    event DuelResolved(uint256 indexed matchId, address winner, uint256 resolvedPrice);

    modifier onlyArenaAgent() {
        require(msg.sender == arenaAgent, "Only arena agent");
        _;
    }

    constructor(address _arenaAgent) {
        arenaAgent = _arenaAgent;
    }

    function initDuel(
        uint256 matchId,
        address tokenAddress,
        uint256 snapshotPrice,
        uint256 durationSeconds,
        address bullPlayer,
        address bearPlayer
    ) external onlyArenaAgent {
        require(!duels[matchId].resolved, "Duel exists");
        require(bullPlayer != bearPlayer, "Same player");
        require(tokenAddress != address(0), "Zero token");
        require(snapshotPrice > 0, "Zero price");

        duels[matchId] = Duel({
            matchId: matchId,
            tokenAddress: tokenAddress,
            snapshotPrice: snapshotPrice,
            resolutionTime: block.timestamp + durationSeconds,
            bullPlayer: bullPlayer,
            bearPlayer: bearPlayer,
            resolvedPrice: 0,
            resolved: false
        });

        emit DuelInitialized(matchId, tokenAddress, bullPlayer, bearPlayer);
    }

    function resolveDuel(uint256 matchId, uint256 currentPrice) external onlyArenaAgent returns (address winner) {
        Duel storage d = duels[matchId];
        require(d.snapshotPrice > 0, "Duel not found");
        require(!d.resolved, "Already resolved");
        require(block.timestamp >= d.resolutionTime, "Too early");

        d.resolvedPrice = currentPrice;
        d.resolved = true;

        if (currentPrice > d.snapshotPrice) {
            winner = d.bullPlayer;
        } else if (currentPrice < d.snapshotPrice) {
            winner = d.bearPlayer;
        } else {
            winner = address(0); // Draw
        }

        emit DuelResolved(matchId, winner, currentPrice);
    }

    function getDuel(uint256 matchId) external view returns (Duel memory) {
        return duels[matchId];
    }
}
