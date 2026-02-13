// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IArenaCore.sol";

interface IMatchRegistry {
    enum MatchStatus { Scheduled, InProgress, Completed, Disputed }

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

    function getMatch(uint256 matchId) external view returns (Match memory);
}

contract SpectatorBetting {
    address public arenaAgent;
    address public arenaCoreAddress;
    address public matchRegistryAddress;

    uint256 public constant RAKE_BPS = 300; // 3% rake (300 basis points)
    uint256 public constant MIN_BET = 0.01 ether;
    uint256 public constant MAX_BET = 100 ether;
    uint256 public constant ODDS_PRECISION = 1e18;
    uint256 public constant ELO_WEIGHT = 60; // 60% ELO influence
    uint256 public constant VOLUME_WEIGHT = 40; // 40% volume influence

    enum BetStatus { Active, Won, Lost, Refunded, Claimed }

    struct Bet {
        uint256 id;
        uint256 matchId;
        address bettor;
        address predictedWinner;
        uint256 amount;
        uint256 odds;
        uint256 timestamp;
        BetStatus status;
        uint256 payout;
    }

    struct MatchPool {
        uint256 matchId;
        address player1;
        address player2;
        uint256 totalPlayer1Bets;
        uint256 totalPlayer2Bets;
        bool bettingOpen;
        bool settled;
        address winner;
    }

    struct BettorProfile {
        address bettor;
        uint256 totalBets;
        uint256 wins;
        uint256 losses;
        uint256 totalWagered;
        uint256 totalWon;
        uint256 totalLost;
        int256 currentStreak;
        uint256 longestWinStreak;
    }

    uint256 public betCounter;
    uint256 public totalRakeCollected;

    mapping(uint256 => Bet) public bets;
    mapping(uint256 => MatchPool) public matchPools;
    mapping(address => BettorProfile) public bettorProfiles;
    mapping(address => uint256[]) internal _bettorBets;
    mapping(uint256 => uint256[]) internal _matchBets;

    bool private _locked;

    event BettingOpened(uint256 indexed matchId, address player1, address player2);
    event BettingClosed(uint256 indexed matchId);
    event BetPlaced(
        uint256 indexed betId,
        uint256 indexed matchId,
        address indexed bettor,
        address predictedWinner,
        uint256 amount,
        uint256 odds
    );
    event BetsSettled(uint256 indexed matchId, address winner, uint256 totalPayout, uint256 rake);
    event WinningsClaimed(uint256 indexed betId, address indexed bettor, uint256 payout);
    event BetRefunded(uint256 indexed betId, address indexed bettor, uint256 amount);
    event RakeWithdrawn(address indexed recipient, uint256 amount);

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

    constructor(address _arenaAgent, address _arenaCoreAddress, address _matchRegistryAddress) {
        arenaAgent = _arenaAgent;
        arenaCoreAddress = _arenaCoreAddress;
        matchRegistryAddress = _matchRegistryAddress;
    }

    // ========== Betting Management ==========

    function openBetting(uint256 matchId, address player1, address player2) external onlyArenaAgent {
        require(matchPools[matchId].matchId == 0, "Betting already exists");
        require(player1 != address(0) && player2 != address(0), "Invalid players");
        require(player1 != player2, "Same player");

        matchPools[matchId] = MatchPool({
            matchId: matchId,
            player1: player1,
            player2: player2,
            totalPlayer1Bets: 0,
            totalPlayer2Bets: 0,
            bettingOpen: true,
            settled: false,
            winner: address(0)
        });

        emit BettingOpened(matchId, player1, player2);
    }

    function closeBetting(uint256 matchId) external onlyArenaAgent {
        MatchPool storage pool = matchPools[matchId];
        require(pool.matchId != 0, "Pool not found");
        require(pool.bettingOpen, "Already closed");

        pool.bettingOpen = false;
        emit BettingClosed(matchId);
    }

    function placeBet(uint256 matchId, address predictedWinner) external payable nonReentrant {
        require(msg.value >= MIN_BET, "Bet below minimum");
        require(msg.value <= MAX_BET, "Bet above maximum");

        MatchPool storage pool = matchPools[matchId];
        require(pool.matchId != 0, "Pool not found");
        require(pool.bettingOpen, "Betting closed");
        require(
            predictedWinner == pool.player1 || predictedWinner == pool.player2,
            "Invalid prediction"
        );

        // Calculate current odds before bet
        uint256 odds = calculateOdds(matchId, predictedWinner);

        // Create bet
        uint256 betId = ++betCounter;
        bets[betId] = Bet({
            id: betId,
            matchId: matchId,
            bettor: msg.sender,
            predictedWinner: predictedWinner,
            amount: msg.value,
            odds: odds,
            timestamp: block.timestamp,
            status: BetStatus.Active,
            payout: 0
        });

        // Update pool totals
        if (predictedWinner == pool.player1) {
            pool.totalPlayer1Bets += msg.value;
        } else {
            pool.totalPlayer2Bets += msg.value;
        }

        // Track bets
        _bettorBets[msg.sender].push(betId);
        _matchBets[matchId].push(betId);

        // Initialize bettor profile if needed
        if (bettorProfiles[msg.sender].bettor == address(0)) {
            bettorProfiles[msg.sender] = BettorProfile({
                bettor: msg.sender,
                totalBets: 0,
                wins: 0,
                losses: 0,
                totalWagered: 0,
                totalWon: 0,
                totalLost: 0,
                currentStreak: 0,
                longestWinStreak: 0
            });
        }

        bettorProfiles[msg.sender].totalBets++;
        bettorProfiles[msg.sender].totalWagered += msg.value;

        emit BetPlaced(betId, matchId, msg.sender, predictedWinner, msg.value, odds);
    }

    function settleBets(uint256 matchId, address actualWinner) external onlyArenaAgent {
        MatchPool storage pool = matchPools[matchId];
        require(pool.matchId != 0, "Pool not found");
        require(!pool.settled, "Already settled");
        require(!pool.bettingOpen, "Betting still open");

        pool.settled = true;
        pool.winner = actualWinner;

        uint256[] memory betIds = _matchBets[matchId];
        uint256 totalWinnerPool;
        uint256 totalLoserPool;
        uint256 totalPayout;

        // Calculate pools
        if (actualWinner == pool.player1) {
            totalWinnerPool = pool.totalPlayer1Bets;
            totalLoserPool = pool.totalPlayer2Bets;
        } else if (actualWinner == pool.player2) {
            totalWinnerPool = pool.totalPlayer2Bets;
            totalLoserPool = pool.totalPlayer1Bets;
        } else {
            // Draw or cancelled - refund all
            for (uint256 i = 0; i < betIds.length; i++) {
                bets[betIds[i]].status = BetStatus.Refunded;
            }
            emit BetsSettled(matchId, actualWinner, 0, 0);
            return;
        }

        // Calculate rake from loser pool
        uint256 rake = (totalLoserPool * RAKE_BPS) / 10000;
        uint256 distributablePool = totalLoserPool - rake;
        totalRakeCollected += rake;

        // Process each bet
        for (uint256 i = 0; i < betIds.length; i++) {
            Bet storage bet = bets[betIds[i]];
            BettorProfile storage profile = bettorProfiles[bet.bettor];

            if (bet.predictedWinner == actualWinner) {
                // Winner: get back stake + share of loser pool
                uint256 share = 0;
                if (totalWinnerPool > 0) {
                    share = (bet.amount * distributablePool) / totalWinnerPool;
                }
                uint256 payout = bet.amount + share;

                bet.status = BetStatus.Won;
                bet.payout = payout;
                totalPayout += payout;

                // Update profile
                profile.wins++;
                profile.totalWon += share;
                profile.currentStreak = profile.currentStreak > 0
                    ? profile.currentStreak + 1
                    : int256(1);
                if (uint256(profile.currentStreak) > profile.longestWinStreak) {
                    profile.longestWinStreak = uint256(profile.currentStreak);
                }
            } else {
                // Loser
                bet.status = BetStatus.Lost;
                bet.payout = 0;

                // Update profile
                profile.losses++;
                profile.totalLost += bet.amount;
                profile.currentStreak = profile.currentStreak < 0
                    ? profile.currentStreak - 1
                    : int256(-1);
            }
        }

        emit BetsSettled(matchId, actualWinner, totalPayout, rake);
    }

    function claimWinnings(uint256 betId) external nonReentrant {
        Bet storage bet = bets[betId];
        require(bet.id != 0, "Bet not found");
        require(bet.bettor == msg.sender, "Not your bet");
        require(bet.status == BetStatus.Won, "Bet not won");
        require(bet.payout > 0, "No payout");

        uint256 payout = bet.payout;
        bet.status = BetStatus.Claimed;
        bet.payout = 0;

        (bool success,) = msg.sender.call{value: payout}("");
        require(success, "Transfer failed");

        emit WinningsClaimed(betId, msg.sender, payout);
    }

    function refundBet(uint256 betId) external onlyArenaAgent nonReentrant {
        Bet storage bet = bets[betId];
        require(bet.id != 0, "Bet not found");
        require(bet.status == BetStatus.Active || bet.status == BetStatus.Refunded, "Cannot refund");

        uint256 amount = bet.amount;
        bet.status = BetStatus.Refunded;
        bet.amount = 0;

        (bool success,) = bet.bettor.call{value: amount}("");
        require(success, "Refund failed");

        emit BetRefunded(betId, bet.bettor, amount);
    }

    // ========== Odds Calculation ==========

    function calculateOdds(uint256 matchId, address predictedWinner) public view returns (uint256) {
        MatchPool storage pool = matchPools[matchId];
        if (pool.matchId == 0) return ODDS_PRECISION; // 1:1 default

        // Get ELO-based probability
        uint256 eloProbability = _calculateEloProbability(pool.player1, pool.player2, predictedWinner);

        // Get volume-based probability
        uint256 volumeProbability = _calculateVolumeProbability(pool, predictedWinner);

        // Weighted combination
        uint256 combinedProbability = (eloProbability * ELO_WEIGHT + volumeProbability * VOLUME_WEIGHT) / 100;

        // Convert probability to decimal odds (1/probability)
        // If probability is 0.6, odds = 1/0.6 = 1.67
        if (combinedProbability == 0) return ODDS_PRECISION * 10; // Max 10:1
        if (combinedProbability >= ODDS_PRECISION) return ODDS_PRECISION; // Min 1:1

        uint256 odds = (ODDS_PRECISION * ODDS_PRECISION) / combinedProbability;

        // Cap odds between 1.01 and 10.0
        if (odds < ODDS_PRECISION + ODDS_PRECISION / 100) {
            odds = ODDS_PRECISION + ODDS_PRECISION / 100; // 1.01
        }
        if (odds > ODDS_PRECISION * 10) {
            odds = ODDS_PRECISION * 10; // 10.0
        }

        return odds;
    }

    function _calculateEloProbability(
        address player1,
        address player2,
        address predictedWinner
    ) internal view returns (uint256) {
        uint256 elo1 = 1200;
        uint256 elo2 = 1200;

        try IArenaCore(arenaCoreAddress).getAgent(player1) returns (IArenaCore.AgentProfile memory p1) {
            if (p1.registered) elo1 = p1.elo;
        } catch {}

        try IArenaCore(arenaCoreAddress).getAgent(player2) returns (IArenaCore.AgentProfile memory p2) {
            if (p2.registered) elo2 = p2.elo;
        } catch {}

        // ELO expected score formula: E = 1 / (1 + 10^((Rb - Ra) / 400))
        // Simplified approximation for on-chain calculation
        uint256 targetElo = predictedWinner == player1 ? elo1 : elo2;
        uint256 opponentElo = predictedWinner == player1 ? elo2 : elo1;

        if (targetElo >= opponentElo) {
            uint256 diff = targetElo - opponentElo;
            // Higher ELO = higher probability, capped at 0.9
            uint256 bonus = (diff * ODDS_PRECISION) / 800; // 400 ELO diff = +50%
            uint256 prob = ODDS_PRECISION / 2 + bonus;
            return prob > (ODDS_PRECISION * 9) / 10 ? (ODDS_PRECISION * 9) / 10 : prob;
        } else {
            uint256 diff = opponentElo - targetElo;
            // Lower ELO = lower probability, floored at 0.1
            uint256 penalty = (diff * ODDS_PRECISION) / 800;
            if (penalty > ODDS_PRECISION / 2 - ODDS_PRECISION / 10) {
                return ODDS_PRECISION / 10;
            }
            return ODDS_PRECISION / 2 - penalty;
        }
    }

    function _calculateVolumeProbability(
        MatchPool storage pool,
        address predictedWinner
    ) internal view returns (uint256) {
        uint256 totalVolume = pool.totalPlayer1Bets + pool.totalPlayer2Bets;
        if (totalVolume == 0) return ODDS_PRECISION / 2; // 50/50 if no bets

        uint256 targetVolume = predictedWinner == pool.player1
            ? pool.totalPlayer1Bets
            : pool.totalPlayer2Bets;

        // Inverse: more volume = lower odds (price discovery)
        // If 70% bet on player1, probability is 0.7
        return (targetVolume * ODDS_PRECISION) / totalVolume;
    }

    // ========== View Functions ==========

    function getBet(uint256 betId) external view returns (Bet memory) {
        return bets[betId];
    }

    function getMatchPool(uint256 matchId) external view returns (MatchPool memory) {
        return matchPools[matchId];
    }

    function getBettorProfile(address bettor) external view returns (BettorProfile memory) {
        return bettorProfiles[bettor];
    }

    function getBettorBets(address bettor) external view returns (uint256[] memory) {
        return _bettorBets[bettor];
    }

    function getMatchBets(uint256 matchId) external view returns (uint256[] memory) {
        return _matchBets[matchId];
    }

    function getBettorActiveBets(address bettor) external view returns (Bet[] memory) {
        uint256[] memory betIds = _bettorBets[bettor];
        uint256 activeCount = 0;

        for (uint256 i = 0; i < betIds.length; i++) {
            if (bets[betIds[i]].status == BetStatus.Active) {
                activeCount++;
            }
        }

        Bet[] memory activeBets = new Bet[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < betIds.length; i++) {
            if (bets[betIds[i]].status == BetStatus.Active) {
                activeBets[index++] = bets[betIds[i]];
            }
        }

        return activeBets;
    }

    function getClaimableBets(address bettor) external view returns (Bet[] memory) {
        uint256[] memory betIds = _bettorBets[bettor];
        uint256 claimableCount = 0;

        for (uint256 i = 0; i < betIds.length; i++) {
            if (bets[betIds[i]].status == BetStatus.Won && bets[betIds[i]].payout > 0) {
                claimableCount++;
            }
        }

        Bet[] memory claimableBets = new Bet[](claimableCount);
        uint256 index = 0;

        for (uint256 i = 0; i < betIds.length; i++) {
            if (bets[betIds[i]].status == BetStatus.Won && bets[betIds[i]].payout > 0) {
                claimableBets[index++] = bets[betIds[i]];
            }
        }

        return claimableBets;
    }

    function getImpliedOdds(uint256 matchId) external view returns (uint256 player1Odds, uint256 player2Odds) {
        MatchPool storage pool = matchPools[matchId];
        if (pool.matchId == 0) {
            return (ODDS_PRECISION, ODDS_PRECISION);
        }

        player1Odds = calculateOdds(matchId, pool.player1);
        player2Odds = calculateOdds(matchId, pool.player2);
    }

    function getTotalPoolSize(uint256 matchId) external view returns (uint256) {
        MatchPool storage pool = matchPools[matchId];
        return pool.totalPlayer1Bets + pool.totalPlayer2Bets;
    }

    // ========== Admin Functions ==========

    function withdrawRake(address recipient) external onlyArenaAgent nonReentrant {
        require(totalRakeCollected > 0, "No rake to withdraw");

        uint256 amount = totalRakeCollected;
        totalRakeCollected = 0;

        (bool success,) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");

        emit RakeWithdrawn(recipient, amount);
    }

    function setArenaCoreAddress(address _arenaCoreAddress) external onlyArenaAgent {
        arenaCoreAddress = _arenaCoreAddress;
    }

    function setMatchRegistryAddress(address _matchRegistryAddress) external onlyArenaAgent {
        matchRegistryAddress = _matchRegistryAddress;
    }

    receive() external payable {}
}
