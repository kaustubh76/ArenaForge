// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SpectatorBetting.sol";
import "../src/ArenaCore.sol";
import "../src/WagerEscrow.sol";
import "../src/MatchRegistry.sol";

contract SpectatorBettingTest is Test {
    SpectatorBetting public betting;
    ArenaCore public arenaCore;
    WagerEscrow public escrow;
    MatchRegistry public registry;

    address public arenaAgent = address(0x1);
    address public agent1 = address(0x100);
    address public agent2 = address(0x200);
    address public bettor1 = address(0x300);
    address public bettor2 = address(0x400);
    address public bettor3 = address(0x500);

    uint256 public constant MATCH_ID = 1;

    function setUp() public {
        vm.startPrank(arenaAgent);

        escrow = new WagerEscrow(arenaAgent);
        registry = new MatchRegistry(arenaAgent);
        arenaCore = new ArenaCore(arenaAgent, address(escrow), address(registry));
        betting = new SpectatorBetting(arenaAgent, address(arenaCore), address(registry));

        escrow.setAuthorizedCaller(address(arenaCore));
        registry.setAuthorizedCaller(address(arenaCore));

        vm.stopPrank();

        // Register agents
        vm.prank(agent1);
        arenaCore.registerAgent("Agent1");

        vm.prank(agent2);
        arenaCore.registerAgent("Agent2");

        // Fund bettors
        vm.deal(bettor1, 100 ether);
        vm.deal(bettor2, 100 ether);
        vm.deal(bettor3, 100 ether);
    }

    // ========== Betting Management Tests ==========

    function test_OpenBetting() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        SpectatorBetting.MatchPool memory pool = betting.getMatchPool(MATCH_ID);
        assertEq(pool.matchId, MATCH_ID);
        assertEq(pool.player1, agent1);
        assertEq(pool.player2, agent2);
        assertTrue(pool.bettingOpen);
        assertFalse(pool.settled);
    }

    function test_OpenBetting_RevertAlreadyExists() public {
        vm.startPrank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.expectRevert("Betting already exists");
        betting.openBetting(MATCH_ID, agent1, agent2);
        vm.stopPrank();
    }

    function test_CloseBetting() public {
        vm.startPrank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);
        betting.closeBetting(MATCH_ID);
        vm.stopPrank();

        SpectatorBetting.MatchPool memory pool = betting.getMatchPool(MATCH_ID);
        assertFalse(pool.bettingOpen);
    }

    // ========== Place Bet Tests ==========

    function test_PlaceBet_ValidAmount() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 1 ether}(MATCH_ID, agent1);

        SpectatorBetting.Bet memory bet = betting.getBet(1);
        assertEq(bet.id, 1);
        assertEq(bet.matchId, MATCH_ID);
        assertEq(bet.bettor, bettor1);
        assertEq(bet.predictedWinner, agent1);
        assertEq(bet.amount, 1 ether);
        assertEq(uint256(bet.status), uint256(SpectatorBetting.BetStatus.Active));

        SpectatorBetting.MatchPool memory pool = betting.getMatchPool(MATCH_ID);
        assertEq(pool.totalPlayer1Bets, 1 ether);
        assertEq(pool.totalPlayer2Bets, 0);
    }

    function test_PlaceBet_RevertBelowMin() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        vm.expectRevert("Bet below minimum");
        betting.placeBet{value: 0.001 ether}(MATCH_ID, agent1);
    }

    function test_PlaceBet_RevertAboveMax() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        // Give bettor1 more than max bet amount
        vm.deal(bettor1, 200 ether);

        vm.prank(bettor1);
        vm.expectRevert("Bet above maximum");
        betting.placeBet{value: 101 ether}(MATCH_ID, agent1);
    }

    function test_PlaceBet_RevertBettingClosed() public {
        vm.startPrank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);
        betting.closeBetting(MATCH_ID);
        vm.stopPrank();

        vm.prank(bettor1);
        vm.expectRevert("Betting closed");
        betting.placeBet{value: 1 ether}(MATCH_ID, agent1);
    }

    function test_PlaceBet_RevertInvalidPrediction() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        vm.expectRevert("Invalid prediction");
        betting.placeBet{value: 1 ether}(MATCH_ID, address(0x999));
    }

    function test_PlaceBet_MultipleBettors() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 2 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 3 ether}(MATCH_ID, agent2);

        vm.prank(bettor3);
        betting.placeBet{value: 1 ether}(MATCH_ID, agent1);

        SpectatorBetting.MatchPool memory pool = betting.getMatchPool(MATCH_ID);
        assertEq(pool.totalPlayer1Bets, 3 ether);
        assertEq(pool.totalPlayer2Bets, 3 ether);
    }

    // ========== Odds Calculation Tests ==========

    function test_OddsCalculation_EqualELO() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        // Both agents have 1200 ELO, so odds should be close to 2.0 (even split)
        uint256 odds1 = betting.calculateOdds(MATCH_ID, agent1);
        uint256 odds2 = betting.calculateOdds(MATCH_ID, agent2);

        // Should be approximately 2.0 (2e18) for 50/50
        assertGt(odds1, 1.5e18);
        assertLt(odds1, 2.5e18);
        assertGt(odds2, 1.5e18);
        assertLt(odds2, 2.5e18);
    }

    function test_OddsCalculation_EloAdvantage() public {
        // Give agent1 higher ELO
        vm.prank(arenaAgent);
        arenaCore.updateElo(agent1, 1600, true);

        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        uint256 odds1 = betting.calculateOdds(MATCH_ID, agent1);
        uint256 odds2 = betting.calculateOdds(MATCH_ID, agent2);

        // Agent1 should have lower odds (favorite), agent2 higher odds (underdog)
        assertLt(odds1, odds2);
    }

    function test_OddsCalculation_VolumeInfluence() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        // Initial odds
        uint256 initialOdds1 = betting.calculateOdds(MATCH_ID, agent1);

        // Heavy betting on agent1
        vm.prank(bettor1);
        betting.placeBet{value: 10 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 1 ether}(MATCH_ID, agent2);

        // Odds should have shifted
        uint256 finalOdds1 = betting.calculateOdds(MATCH_ID, agent1);
        uint256 finalOdds2 = betting.calculateOdds(MATCH_ID, agent2);

        // Agent1 now has lower odds (more backed), agent2 has higher odds
        assertLt(finalOdds1, finalOdds2);
    }

    // ========== Settlement Tests ==========

    function test_SettleBets_WinnerTakesAll() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent2);

        vm.startPrank(arenaAgent);
        betting.closeBetting(MATCH_ID);
        betting.settleBets(MATCH_ID, agent1);
        vm.stopPrank();

        SpectatorBetting.MatchPool memory pool = betting.getMatchPool(MATCH_ID);
        assertTrue(pool.settled);
        assertEq(pool.winner, agent1);

        SpectatorBetting.Bet memory winnerBet = betting.getBet(1);
        assertEq(uint256(winnerBet.status), uint256(SpectatorBetting.BetStatus.Won));
        assertGt(winnerBet.payout, 5 ether); // Should be stake + winnings

        SpectatorBetting.Bet memory loserBet = betting.getBet(2);
        assertEq(uint256(loserBet.status), uint256(SpectatorBetting.BetStatus.Lost));
        assertEq(loserBet.payout, 0);
    }

    function test_SettleBets_RakeCalculation() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 10 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 10 ether}(MATCH_ID, agent2);

        vm.startPrank(arenaAgent);
        betting.closeBetting(MATCH_ID);
        betting.settleBets(MATCH_ID, agent1);
        vm.stopPrank();

        // 3% rake on loser pool (10 ether)
        uint256 expectedRake = (10 ether * 300) / 10000; // 0.3 ether
        assertEq(betting.totalRakeCollected(), expectedRake);

        // Winner should get stake + (loser pool - rake)
        SpectatorBetting.Bet memory winnerBet = betting.getBet(1);
        uint256 expectedPayout = 10 ether + (10 ether - expectedRake);
        assertEq(winnerBet.payout, expectedPayout);
    }

    function test_SettleBets_DrawRefundsAll() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent2);

        vm.startPrank(arenaAgent);
        betting.closeBetting(MATCH_ID);
        betting.settleBets(MATCH_ID, address(0)); // Draw
        vm.stopPrank();

        SpectatorBetting.Bet memory bet1 = betting.getBet(1);
        SpectatorBetting.Bet memory bet2 = betting.getBet(2);

        assertEq(uint256(bet1.status), uint256(SpectatorBetting.BetStatus.Refunded));
        assertEq(uint256(bet2.status), uint256(SpectatorBetting.BetStatus.Refunded));
    }

    // ========== Claim Winnings Tests ==========

    function test_ClaimWinnings() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent2);

        vm.startPrank(arenaAgent);
        betting.closeBetting(MATCH_ID);
        betting.settleBets(MATCH_ID, agent1);
        vm.stopPrank();

        uint256 balanceBefore = bettor1.balance;

        vm.prank(bettor1);
        betting.claimWinnings(1);

        uint256 balanceAfter = bettor1.balance;
        assertGt(balanceAfter, balanceBefore);

        SpectatorBetting.Bet memory bet = betting.getBet(1);
        assertEq(uint256(bet.status), uint256(SpectatorBetting.BetStatus.Claimed));
    }

    function test_ClaimWinnings_RevertNotYourBet() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent2);

        vm.startPrank(arenaAgent);
        betting.closeBetting(MATCH_ID);
        betting.settleBets(MATCH_ID, agent1);
        vm.stopPrank();

        vm.prank(bettor2);
        vm.expectRevert("Not your bet");
        betting.claimWinnings(1);
    }

    function test_ClaimWinnings_RevertBetNotWon() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent2);

        vm.startPrank(arenaAgent);
        betting.closeBetting(MATCH_ID);
        betting.settleBets(MATCH_ID, agent1);
        vm.stopPrank();

        vm.prank(bettor2);
        vm.expectRevert("Bet not won");
        betting.claimWinnings(2); // Loser's bet
    }

    // ========== Refund Tests ==========

    function test_RefundBet() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 5 ether}(MATCH_ID, agent1);

        uint256 balanceBefore = bettor1.balance;

        vm.prank(arenaAgent);
        betting.refundBet(1);

        uint256 balanceAfter = bettor1.balance;
        assertEq(balanceAfter - balanceBefore, 5 ether);
    }

    // ========== Bettor Profile Tests ==========

    function test_BettorProfileTracking() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 1 ether}(MATCH_ID, agent1);

        SpectatorBetting.BettorProfile memory profile = betting.getBettorProfile(bettor1);
        assertEq(profile.totalBets, 1);
        assertEq(profile.totalWagered, 1 ether);

        vm.prank(bettor1);
        betting.placeBet{value: 2 ether}(MATCH_ID, agent2);

        profile = betting.getBettorProfile(bettor1);
        assertEq(profile.totalBets, 2);
        assertEq(profile.totalWagered, 3 ether);
    }

    function test_StreakTracking() public {
        // Match 1: bettor1 wins
        vm.prank(arenaAgent);
        betting.openBetting(1, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 1 ether}(1, agent1);

        vm.startPrank(arenaAgent);
        betting.closeBetting(1);
        betting.settleBets(1, agent1);
        vm.stopPrank();

        SpectatorBetting.BettorProfile memory profile = betting.getBettorProfile(bettor1);
        assertEq(profile.wins, 1);
        assertEq(profile.currentStreak, 1);

        // Match 2: bettor1 wins again
        vm.prank(arenaAgent);
        betting.openBetting(2, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 1 ether}(2, agent1);

        vm.startPrank(arenaAgent);
        betting.closeBetting(2);
        betting.settleBets(2, agent1);
        vm.stopPrank();

        profile = betting.getBettorProfile(bettor1);
        assertEq(profile.wins, 2);
        assertEq(profile.currentStreak, 2);
        assertEq(profile.longestWinStreak, 2);

        // Match 3: bettor1 loses
        vm.prank(arenaAgent);
        betting.openBetting(3, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 1 ether}(3, agent1);

        vm.startPrank(arenaAgent);
        betting.closeBetting(3);
        betting.settleBets(3, agent2); // agent2 wins
        vm.stopPrank();

        profile = betting.getBettorProfile(bettor1);
        assertEq(profile.losses, 1);
        assertEq(profile.currentStreak, -1);
        assertEq(profile.longestWinStreak, 2); // Should still be 2
    }

    // ========== View Functions Tests ==========

    function test_GetBettorBets() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 1 ether}(MATCH_ID, agent1);

        vm.prank(bettor1);
        betting.placeBet{value: 2 ether}(MATCH_ID, agent2);

        uint256[] memory betIds = betting.getBettorBets(bettor1);
        assertEq(betIds.length, 2);
        assertEq(betIds[0], 1);
        assertEq(betIds[1], 2);
    }

    function test_GetImpliedOdds() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        (uint256 odds1, uint256 odds2) = betting.getImpliedOdds(MATCH_ID);
        assertGt(odds1, 0);
        assertGt(odds2, 0);
    }

    function test_GetTotalPoolSize() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 3 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 2 ether}(MATCH_ID, agent2);

        uint256 poolSize = betting.getTotalPoolSize(MATCH_ID);
        assertEq(poolSize, 5 ether);
    }

    // ========== Admin Tests ==========

    function test_WithdrawRake() public {
        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.prank(bettor1);
        betting.placeBet{value: 10 ether}(MATCH_ID, agent1);

        vm.prank(bettor2);
        betting.placeBet{value: 10 ether}(MATCH_ID, agent2);

        vm.startPrank(arenaAgent);
        betting.closeBetting(MATCH_ID);
        betting.settleBets(MATCH_ID, agent1);

        uint256 rake = betting.totalRakeCollected();
        assertGt(rake, 0);

        address treasury = address(0x999);
        uint256 balanceBefore = treasury.balance;

        betting.withdrawRake(treasury);

        assertEq(treasury.balance - balanceBefore, rake);
        assertEq(betting.totalRakeCollected(), 0);

        vm.stopPrank();
    }

    function test_OnlyArenaAgent() public {
        vm.prank(bettor1);
        vm.expectRevert("Only arena agent");
        betting.openBetting(MATCH_ID, agent1, agent2);
    }

    // ========== Fuzz Tests ==========

    function testFuzz_PlaceBet(uint256 amount) public {
        amount = bound(amount, 0.01 ether, 100 ether);

        vm.prank(arenaAgent);
        betting.openBetting(MATCH_ID, agent1, agent2);

        vm.deal(bettor1, amount);
        vm.prank(bettor1);
        betting.placeBet{value: amount}(MATCH_ID, agent1);

        SpectatorBetting.Bet memory bet = betting.getBet(1);
        assertEq(bet.amount, amount);
    }
}
