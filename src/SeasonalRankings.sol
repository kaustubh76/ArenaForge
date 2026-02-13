// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IArenaCore.sol";

contract SeasonalRankings {
    address public arenaAgent;
    address public arenaCoreAddress;

    uint256 public constant SEASON_DURATION = 30 days;
    uint256 public constant ELO_DECAY_PERCENT = 10; // 10% decay toward 1200 baseline
    uint256 public constant ELO_BASELINE = 1200;
    uint256 public constant PLACEMENT_MATCHES = 5;

    // Tier thresholds
    uint256 public constant IRON_MAX = 799;
    uint256 public constant BRONZE_MAX = 1099;
    uint256 public constant SILVER_MAX = 1399;
    uint256 public constant GOLD_MAX = 1699;
    uint256 public constant PLATINUM_MAX = 1999;
    // Diamond: 2000+

    enum RankTier { Iron, Bronze, Silver, Gold, Platinum, Diamond }

    struct Season {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        bool active;
        bool rewardsDistributed;
        uint256 totalPrizePool;
    }

    struct SeasonalProfile {
        address agent;
        uint256 seasonId;
        uint256 seasonalElo;
        uint256 peakElo;
        uint256 matchesPlayed;
        uint256 wins;
        uint256 losses;
        RankTier tier;
        bool placementComplete;
        uint256 placementMatches;
        bool rewardClaimed;
    }

    struct SeasonReward {
        uint256 tokenAmount;
        string badgeURI;
    }

    uint256 public currentSeasonId;

    mapping(uint256 => Season) public seasons;
    mapping(uint256 => mapping(address => SeasonalProfile)) public seasonalProfiles;
    mapping(uint256 => address[]) internal _seasonParticipants;
    mapping(RankTier => SeasonReward) public tierRewards;

    bool private _locked;

    event SeasonStarted(uint256 indexed seasonId, uint256 startTime, uint256 endTime);
    event SeasonEnded(uint256 indexed seasonId);
    event PlacementComplete(uint256 indexed seasonId, address indexed agent, uint256 initialElo, RankTier tier);
    event SeasonalMatchRecorded(uint256 indexed seasonId, address indexed winner, address indexed loser, int256 eloChange);
    event TierChanged(uint256 indexed seasonId, address indexed agent, RankTier oldTier, RankTier newTier);
    event RewardsDistributed(uint256 indexed seasonId, uint256 totalRewards);
    event RewardClaimed(uint256 indexed seasonId, address indexed agent, uint256 tokenAmount, string badgeURI);

    modifier onlyArenaAgent() {
        require(msg.sender == arenaAgent, "Only arena agent");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address _arenaAgent, address _arenaCoreAddress) {
        arenaAgent = _arenaAgent;
        arenaCoreAddress = _arenaCoreAddress;

        // Initialize tier rewards (can be updated later)
        tierRewards[RankTier.Iron] = SeasonReward({ tokenAmount: 0, badgeURI: "" });
        tierRewards[RankTier.Bronze] = SeasonReward({ tokenAmount: 0.1 ether, badgeURI: "ipfs://bronze-badge" });
        tierRewards[RankTier.Silver] = SeasonReward({ tokenAmount: 0.25 ether, badgeURI: "ipfs://silver-badge" });
        tierRewards[RankTier.Gold] = SeasonReward({ tokenAmount: 0.5 ether, badgeURI: "ipfs://gold-badge" });
        tierRewards[RankTier.Platinum] = SeasonReward({ tokenAmount: 1 ether, badgeURI: "ipfs://platinum-badge" });
        tierRewards[RankTier.Diamond] = SeasonReward({ tokenAmount: 2 ether, badgeURI: "ipfs://diamond-badge" });
    }

    // ========== Season Management ==========

    function startNewSeason() external onlyArenaAgent returns (uint256) {
        // End current season if active
        if (currentSeasonId > 0 && seasons[currentSeasonId].active) {
            _endSeason(currentSeasonId);
        }

        uint256 newSeasonId = ++currentSeasonId;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + SEASON_DURATION;

        seasons[newSeasonId] = Season({
            id: newSeasonId,
            startTime: startTime,
            endTime: endTime,
            active: true,
            rewardsDistributed: false,
            totalPrizePool: 0
        });

        emit SeasonStarted(newSeasonId, startTime, endTime);
        return newSeasonId;
    }

    function endCurrentSeason() external onlyArenaAgent {
        require(currentSeasonId > 0, "No active season");
        require(seasons[currentSeasonId].active, "Season not active");

        _endSeason(currentSeasonId);
    }

    function _endSeason(uint256 seasonId) internal {
        Season storage season = seasons[seasonId];
        season.active = false;
        emit SeasonEnded(seasonId);
    }

    // ========== Match Recording ==========

    function recordSeasonalMatch(
        address winner,
        address loser,
        int256 eloChange
    ) external onlyArenaAgent {
        require(currentSeasonId > 0, "No active season");
        Season storage season = seasons[currentSeasonId];
        require(season.active, "Season not active");

        // Initialize profiles if needed
        _initializeProfile(winner, currentSeasonId);
        _initializeProfile(loser, currentSeasonId);

        SeasonalProfile storage winnerProfile = seasonalProfiles[currentSeasonId][winner];
        SeasonalProfile storage loserProfile = seasonalProfiles[currentSeasonId][loser];

        // Update winner
        winnerProfile.matchesPlayed++;
        winnerProfile.wins++;
        if (eloChange > 0) {
            winnerProfile.seasonalElo += uint256(eloChange);
        }
        if (winnerProfile.seasonalElo > winnerProfile.peakElo) {
            winnerProfile.peakElo = winnerProfile.seasonalElo;
        }

        // Update loser
        loserProfile.matchesPlayed++;
        loserProfile.losses++;
        if (eloChange > 0 && loserProfile.seasonalElo >= uint256(eloChange)) {
            loserProfile.seasonalElo -= uint256(eloChange);
        } else if (eloChange > 0) {
            loserProfile.seasonalElo = ELO_BASELINE / 2; // Floor at 600
        }

        // Check placement completion
        if (!winnerProfile.placementComplete) {
            winnerProfile.placementMatches++;
            if (winnerProfile.placementMatches >= PLACEMENT_MATCHES) {
                winnerProfile.placementComplete = true;
                winnerProfile.tier = calculateTier(winnerProfile.seasonalElo);
                emit PlacementComplete(currentSeasonId, winner, winnerProfile.seasonalElo, winnerProfile.tier);
            }
        }

        if (!loserProfile.placementComplete) {
            loserProfile.placementMatches++;
            if (loserProfile.placementMatches >= PLACEMENT_MATCHES) {
                loserProfile.placementComplete = true;
                loserProfile.tier = calculateTier(loserProfile.seasonalElo);
                emit PlacementComplete(currentSeasonId, loser, loserProfile.seasonalElo, loserProfile.tier);
            }
        }

        // Update tiers if placement complete
        if (winnerProfile.placementComplete) {
            _updateTier(currentSeasonId, winner);
        }
        if (loserProfile.placementComplete) {
            _updateTier(currentSeasonId, loser);
        }

        emit SeasonalMatchRecorded(currentSeasonId, winner, loser, eloChange);
    }

    function _initializeProfile(address agent, uint256 seasonId) internal {
        if (seasonalProfiles[seasonId][agent].agent == address(0)) {
            // Get base ELO from ArenaCore
            uint256 baseElo = ELO_BASELINE;
            try IArenaCore(arenaCoreAddress).getAgent(agent) returns (IArenaCore.AgentProfile memory profile) {
                if (profile.registered) {
                    baseElo = profile.elo;
                }
            } catch {}

            // Apply ELO decay from previous season
            uint256 decayedElo = _applyEloDecay(baseElo);

            seasonalProfiles[seasonId][agent] = SeasonalProfile({
                agent: agent,
                seasonId: seasonId,
                seasonalElo: decayedElo,
                peakElo: decayedElo,
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                tier: RankTier.Iron, // Start at Iron until placement complete
                placementComplete: false,
                placementMatches: 0,
                rewardClaimed: false
            });

            _seasonParticipants[seasonId].push(agent);
        }
    }

    function _applyEloDecay(uint256 elo) internal pure returns (uint256) {
        // Decay 10% toward baseline (1200)
        if (elo > ELO_BASELINE) {
            uint256 diff = elo - ELO_BASELINE;
            uint256 decay = (diff * ELO_DECAY_PERCENT) / 100;
            return elo - decay;
        } else if (elo < ELO_BASELINE) {
            uint256 diff = ELO_BASELINE - elo;
            uint256 recovery = (diff * ELO_DECAY_PERCENT) / 100;
            return elo + recovery;
        }
        return elo;
    }

    function _updateTier(uint256 seasonId, address agent) internal {
        SeasonalProfile storage profile = seasonalProfiles[seasonId][agent];
        RankTier newTier = calculateTier(profile.seasonalElo);

        if (newTier != profile.tier) {
            RankTier oldTier = profile.tier;
            profile.tier = newTier;
            emit TierChanged(seasonId, agent, oldTier, newTier);
        }
    }

    // ========== Rewards ==========

    function fundSeasonRewards() external payable onlyArenaAgent {
        require(currentSeasonId > 0, "No active season");
        seasons[currentSeasonId].totalPrizePool += msg.value;
    }

    function distributeSeasonRewards(uint256 seasonId) external onlyArenaAgent {
        Season storage season = seasons[seasonId];
        require(!season.active, "Season still active");
        require(!season.rewardsDistributed, "Already distributed");

        season.rewardsDistributed = true;
        emit RewardsDistributed(seasonId, season.totalPrizePool);
    }

    function claimReward(uint256 seasonId) external nonReentrant {
        Season storage season = seasons[seasonId];
        require(!season.active, "Season still active");
        require(season.rewardsDistributed, "Rewards not distributed");

        SeasonalProfile storage profile = seasonalProfiles[seasonId][msg.sender];
        require(profile.agent == msg.sender, "No profile found");
        require(profile.placementComplete, "Placement not complete");
        require(!profile.rewardClaimed, "Already claimed");

        profile.rewardClaimed = true;

        SeasonReward memory reward = tierRewards[profile.tier];

        if (reward.tokenAmount > 0 && address(this).balance >= reward.tokenAmount) {
            (bool success,) = msg.sender.call{value: reward.tokenAmount}("");
            require(success, "Transfer failed");
        }

        emit RewardClaimed(seasonId, msg.sender, reward.tokenAmount, reward.badgeURI);
    }

    // ========== View Functions ==========

    function calculateTier(uint256 elo) public pure returns (RankTier) {
        if (elo <= IRON_MAX) return RankTier.Iron;
        if (elo <= BRONZE_MAX) return RankTier.Bronze;
        if (elo <= SILVER_MAX) return RankTier.Silver;
        if (elo <= GOLD_MAX) return RankTier.Gold;
        if (elo <= PLATINUM_MAX) return RankTier.Platinum;
        return RankTier.Diamond;
    }

    function getSeason(uint256 seasonId) external view returns (Season memory) {
        return seasons[seasonId];
    }

    function getCurrentSeason() external view returns (Season memory) {
        return seasons[currentSeasonId];
    }

    function getSeasonalProfile(uint256 seasonId, address agent) external view returns (SeasonalProfile memory) {
        return seasonalProfiles[seasonId][agent];
    }

    function getCurrentSeasonProfile(address agent) external view returns (SeasonalProfile memory) {
        return seasonalProfiles[currentSeasonId][agent];
    }

    function getSeasonParticipants(uint256 seasonId) external view returns (address[] memory) {
        return _seasonParticipants[seasonId];
    }

    function getSeasonParticipantCount(uint256 seasonId) external view returns (uint256) {
        return _seasonParticipants[seasonId].length;
    }

    function getSeasonLeaderboard(uint256 seasonId, uint256 limit) external view returns (address[] memory) {
        address[] memory participants = _seasonParticipants[seasonId];
        uint256 count = participants.length < limit ? participants.length : limit;

        // Simple bubble sort for top N (gas-efficient for small limits)
        address[] memory sorted = new address[](participants.length);
        for (uint256 i = 0; i < participants.length; i++) {
            sorted[i] = participants[i];
        }

        for (uint256 i = 0; i < count; i++) {
            for (uint256 j = i + 1; j < sorted.length; j++) {
                if (seasonalProfiles[seasonId][sorted[j]].seasonalElo >
                    seasonalProfiles[seasonId][sorted[i]].seasonalElo) {
                    address temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }

        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = sorted[i];
        }

        return result;
    }

    function isSeasonActive() external view returns (bool) {
        return currentSeasonId > 0 && seasons[currentSeasonId].active;
    }

    function getTimeRemaining() external view returns (uint256) {
        if (currentSeasonId == 0 || !seasons[currentSeasonId].active) {
            return 0;
        }
        Season storage season = seasons[currentSeasonId];
        if (block.timestamp >= season.endTime) {
            return 0;
        }
        return season.endTime - block.timestamp;
    }

    // ========== Admin ==========

    function updateTierReward(
        RankTier tier,
        uint256 tokenAmount,
        string calldata badgeURI
    ) external onlyArenaAgent {
        tierRewards[tier] = SeasonReward({
            tokenAmount: tokenAmount,
            badgeURI: badgeURI
        });
    }

    function setArenaCoreAddress(address _arenaCoreAddress) external onlyArenaAgent {
        arenaCoreAddress = _arenaCoreAddress;
    }

    receive() external payable {}
}
