// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SeasonalRankings.sol";
import "../src/ArenaCore.sol";
import "../src/WagerEscrow.sol";
import "../src/MatchRegistry.sol";

contract SeasonalRankingsTest is Test {
    SeasonalRankings public rankings;
    ArenaCore public arenaCore;
    WagerEscrow public escrow;
    MatchRegistry public registry;

    address public arenaAgent = address(0x1);
    address public agent1 = address(0x100);
    address public agent2 = address(0x200);
    address public agent3 = address(0x300);

    function setUp() public {
        vm.startPrank(arenaAgent);

        escrow = new WagerEscrow(arenaAgent);
        registry = new MatchRegistry(arenaAgent);
        arenaCore = new ArenaCore(arenaAgent, address(escrow), address(registry));
        rankings = new SeasonalRankings(arenaAgent, address(arenaCore));

        escrow.setAuthorizedCaller(address(arenaCore));
        registry.setAuthorizedCaller(address(arenaCore));

        vm.stopPrank();

        // Register agents
        vm.prank(agent1);
        arenaCore.registerAgent("Agent1");

        vm.prank(agent2);
        arenaCore.registerAgent("Agent2");

        vm.prank(agent3);
        arenaCore.registerAgent("Agent3");
    }

    // ========== Season Management Tests ==========

    function test_StartNewSeason() public {
        vm.prank(arenaAgent);
        uint256 seasonId = rankings.startNewSeason();

        assertEq(seasonId, 1);
        assertEq(rankings.currentSeasonId(), 1);

        SeasonalRankings.Season memory season = rankings.getSeason(1);
        assertEq(season.id, 1);
        assertTrue(season.active);
        assertFalse(season.rewardsDistributed);
        assertEq(season.endTime, season.startTime + 30 days);
    }

    function test_StartNewSeason_EndsCurrentSeason() public {
        vm.startPrank(arenaAgent);

        rankings.startNewSeason();
        SeasonalRankings.Season memory season1Before = rankings.getSeason(1);
        assertTrue(season1Before.active);

        rankings.startNewSeason();

        SeasonalRankings.Season memory season1After = rankings.getSeason(1);
        assertFalse(season1After.active);

        SeasonalRankings.Season memory season2 = rankings.getSeason(2);
        assertTrue(season2.active);

        vm.stopPrank();
    }

    function test_EndCurrentSeason() public {
        vm.startPrank(arenaAgent);

        rankings.startNewSeason();
        rankings.endCurrentSeason();

        SeasonalRankings.Season memory season = rankings.getSeason(1);
        assertFalse(season.active);

        vm.stopPrank();
    }

    function test_EndCurrentSeason_RevertNoActiveSeason() public {
        vm.prank(arenaAgent);
        vm.expectRevert("No active season");
        rankings.endCurrentSeason();
    }

    // ========== Match Recording Tests ==========

    function test_RecordSeasonalMatch() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();

        rankings.recordSeasonalMatch(agent1, agent2, 16);

        SeasonalRankings.SeasonalProfile memory winner = rankings.getSeasonalProfile(1, agent1);
        SeasonalRankings.SeasonalProfile memory loser = rankings.getSeasonalProfile(1, agent2);

        assertEq(winner.matchesPlayed, 1);
        assertEq(winner.wins, 1);
        assertEq(winner.losses, 0);
        assertGt(winner.seasonalElo, 1200); // Should have gained ELO

        assertEq(loser.matchesPlayed, 1);
        assertEq(loser.wins, 0);
        assertEq(loser.losses, 1);

        vm.stopPrank();
    }

    function test_RecordSeasonalMatch_RevertNoActiveSeason() public {
        vm.prank(arenaAgent);
        vm.expectRevert("No active season");
        rankings.recordSeasonalMatch(agent1, agent2, 16);
    }

    // ========== Placement Tests ==========

    function test_PlacementMatches() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();

        // Play 4 matches - not complete yet
        for (uint256 i = 0; i < 4; i++) {
            rankings.recordSeasonalMatch(agent1, agent2, 16);
        }

        SeasonalRankings.SeasonalProfile memory profile = rankings.getSeasonalProfile(1, agent1);
        assertEq(profile.placementMatches, 4);
        assertFalse(profile.placementComplete);

        // 5th match completes placement
        rankings.recordSeasonalMatch(agent1, agent2, 16);

        profile = rankings.getSeasonalProfile(1, agent1);
        assertEq(profile.placementMatches, 5);
        assertTrue(profile.placementComplete);

        vm.stopPrank();
    }

    // ========== Tier Calculation Tests ==========

    function test_TierCalculation_Iron() public view {
        assertEq(uint256(rankings.calculateTier(500)), uint256(SeasonalRankings.RankTier.Iron));
        assertEq(uint256(rankings.calculateTier(799)), uint256(SeasonalRankings.RankTier.Iron));
    }

    function test_TierCalculation_Bronze() public view {
        assertEq(uint256(rankings.calculateTier(800)), uint256(SeasonalRankings.RankTier.Bronze));
        assertEq(uint256(rankings.calculateTier(1099)), uint256(SeasonalRankings.RankTier.Bronze));
    }

    function test_TierCalculation_Silver() public view {
        assertEq(uint256(rankings.calculateTier(1100)), uint256(SeasonalRankings.RankTier.Silver));
        assertEq(uint256(rankings.calculateTier(1399)), uint256(SeasonalRankings.RankTier.Silver));
    }

    function test_TierCalculation_Gold() public view {
        assertEq(uint256(rankings.calculateTier(1400)), uint256(SeasonalRankings.RankTier.Gold));
        assertEq(uint256(rankings.calculateTier(1699)), uint256(SeasonalRankings.RankTier.Gold));
    }

    function test_TierCalculation_Platinum() public view {
        assertEq(uint256(rankings.calculateTier(1700)), uint256(SeasonalRankings.RankTier.Platinum));
        assertEq(uint256(rankings.calculateTier(1999)), uint256(SeasonalRankings.RankTier.Platinum));
    }

    function test_TierCalculation_Diamond() public view {
        assertEq(uint256(rankings.calculateTier(2000)), uint256(SeasonalRankings.RankTier.Diamond));
        assertEq(uint256(rankings.calculateTier(3000)), uint256(SeasonalRankings.RankTier.Diamond));
    }

    // ========== ELO Decay Tests ==========

    function test_EloDecay_AboveBaseline() public {
        // Agent with 1400 ELO should decay to 1380 (10% of 200 diff)
        vm.prank(arenaAgent);
        arenaCore.updateElo(agent1, 1400, true);

        vm.startPrank(arenaAgent);
        rankings.startNewSeason();
        rankings.recordSeasonalMatch(agent1, agent2, 0);

        SeasonalRankings.SeasonalProfile memory profile = rankings.getSeasonalProfile(1, agent1);
        // 1400 -> 1400 - (200 * 10 / 100) = 1380
        assertEq(profile.seasonalElo, 1380);

        vm.stopPrank();
    }

    function test_EloDecay_BelowBaseline() public {
        // Agent with 1000 ELO should recover to 1020 (10% of 200 diff)
        vm.prank(arenaAgent);
        arenaCore.updateElo(agent1, 1000, false);

        vm.startPrank(arenaAgent);
        rankings.startNewSeason();
        rankings.recordSeasonalMatch(agent1, agent2, 0);

        SeasonalRankings.SeasonalProfile memory profile = rankings.getSeasonalProfile(1, agent1);
        // 1000 -> 1000 + (200 * 10 / 100) = 1020
        assertEq(profile.seasonalElo, 1020);

        vm.stopPrank();
    }

    // ========== Rewards Tests ==========

    function test_FundSeasonRewards() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();

        vm.deal(arenaAgent, 10 ether);
        rankings.fundSeasonRewards{value: 5 ether}();

        SeasonalRankings.Season memory season = rankings.getSeason(1);
        assertEq(season.totalPrizePool, 5 ether);

        vm.stopPrank();
    }

    function test_DistributeSeasonRewards() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();
        rankings.endCurrentSeason();
        rankings.distributeSeasonRewards(1);

        SeasonalRankings.Season memory season = rankings.getSeason(1);
        assertTrue(season.rewardsDistributed);

        vm.stopPrank();
    }

    function test_DistributeSeasonRewards_RevertIfActive() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();

        vm.expectRevert("Season still active");
        rankings.distributeSeasonRewards(1);

        vm.stopPrank();
    }

    function test_ClaimReward() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();

        // Complete placement for agent1
        for (uint256 i = 0; i < 5; i++) {
            rankings.recordSeasonalMatch(agent1, agent2, 16);
        }

        // Fund rewards
        vm.deal(arenaAgent, 10 ether);
        rankings.fundSeasonRewards{value: 5 ether}();

        rankings.endCurrentSeason();
        rankings.distributeSeasonRewards(1);
        vm.stopPrank();

        // Agent1 claims reward
        uint256 balanceBefore = agent1.balance;
        vm.prank(agent1);
        rankings.claimReward(1);

        SeasonalRankings.SeasonalProfile memory profile = rankings.getSeasonalProfile(1, agent1);
        assertTrue(profile.rewardClaimed);

        // Should have received tier reward (Silver tier for ~1280 ELO)
        // Note: actual amount depends on tier achieved
    }

    function test_ClaimReward_RevertAlreadyClaimed() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();

        for (uint256 i = 0; i < 5; i++) {
            rankings.recordSeasonalMatch(agent1, agent2, 16);
        }

        vm.deal(arenaAgent, 10 ether);
        rankings.fundSeasonRewards{value: 5 ether}();
        rankings.endCurrentSeason();
        rankings.distributeSeasonRewards(1);
        vm.stopPrank();

        vm.prank(agent1);
        rankings.claimReward(1);

        vm.prank(agent1);
        vm.expectRevert("Already claimed");
        rankings.claimReward(1);
    }

    // ========== Leaderboard Tests ==========

    function test_GetSeasonLeaderboard() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();

        // Agent1 wins multiple times -> higher ELO
        rankings.recordSeasonalMatch(agent1, agent2, 20);
        rankings.recordSeasonalMatch(agent1, agent3, 20);
        rankings.recordSeasonalMatch(agent1, agent2, 20);

        // Agent3 wins once
        rankings.recordSeasonalMatch(agent3, agent2, 15);

        address[] memory leaderboard = rankings.getSeasonLeaderboard(1, 3);

        // Agent1 should be first (most wins, highest ELO)
        assertEq(leaderboard[0], agent1);

        vm.stopPrank();
    }

    // ========== View Function Tests ==========

    function test_IsSeasonActive() public {
        assertFalse(rankings.isSeasonActive());

        vm.prank(arenaAgent);
        rankings.startNewSeason();

        assertTrue(rankings.isSeasonActive());

        vm.prank(arenaAgent);
        rankings.endCurrentSeason();

        assertFalse(rankings.isSeasonActive());
    }

    function test_GetTimeRemaining() public {
        assertEq(rankings.getTimeRemaining(), 0);

        vm.prank(arenaAgent);
        rankings.startNewSeason();

        uint256 timeRemaining = rankings.getTimeRemaining();
        assertGt(timeRemaining, 0);
        assertLe(timeRemaining, 30 days);

        // Fast forward past season end
        vm.warp(block.timestamp + 31 days);
        assertEq(rankings.getTimeRemaining(), 0);
    }

    function test_GetSeasonParticipants() public {
        vm.startPrank(arenaAgent);
        rankings.startNewSeason();

        rankings.recordSeasonalMatch(agent1, agent2, 16);
        rankings.recordSeasonalMatch(agent3, agent2, 16);

        address[] memory participants = rankings.getSeasonParticipants(1);
        assertEq(participants.length, 3);

        vm.stopPrank();
    }

    // ========== Admin Tests ==========

    function test_UpdateTierReward() public {
        vm.prank(arenaAgent);
        rankings.updateTierReward(SeasonalRankings.RankTier.Gold, 2 ether, "ipfs://new-gold-badge");

        (uint256 tokenAmount, string memory badgeURI) = rankings.tierRewards(SeasonalRankings.RankTier.Gold);
        assertEq(tokenAmount, 2 ether);
        assertEq(badgeURI, "ipfs://new-gold-badge");
    }

    function test_OnlyArenaAgent() public {
        vm.prank(agent1);
        vm.expectRevert("Only arena agent");
        rankings.startNewSeason();
    }

    // ========== Fuzz Tests ==========

    function testFuzz_TierCalculation(uint256 elo) public view {
        elo = bound(elo, 0, 5000);
        SeasonalRankings.RankTier tier = rankings.calculateTier(elo);
        assertTrue(uint256(tier) <= uint256(SeasonalRankings.RankTier.Diamond));
    }
}
