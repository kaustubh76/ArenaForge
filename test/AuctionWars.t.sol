// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/game-modes/AuctionWars.sol";

contract AuctionWarsTest is Test {
    AuctionWars public auction;
    address public arenaAgent = address(this);
    address public player1 = address(0x1);
    address public player2 = address(0x2);
    address public player3 = address(0x3);

    uint256 constant MATCH_ID = 1;
    uint256 constant TOTAL_ROUNDS = 3;
    uint256 constant BIDDING_DURATION = 1 hours;
    uint256 constant REVEAL_DURATION = 30 minutes;

    function setUp() public {
        auction = new AuctionWars(arenaAgent);
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    function _initDefaultMatch() internal {
        address[] memory players = new address[](3);
        players[0] = player1;
        players[1] = player2;
        players[2] = player3;
        auction.initMatch(MATCH_ID, players, TOTAL_ROUNDS);
    }

    function _startRound(uint256 matchId, bytes32 boxHash) internal {
        auction.startAuctionRound(matchId, boxHash, BIDDING_DURATION, REVEAL_DURATION);
    }

    function _commitAndReveal(
        address player,
        uint256 matchId,
        uint256 roundNum,
        uint256 amount,
        bytes32 salt
    ) internal {
        bytes32 bidHash = keccak256(abi.encodePacked(amount, salt));

        vm.prank(player);
        auction.commitBid(matchId, roundNum, bidHash);

        vm.prank(player);
        auction.revealBid(matchId, roundNum, amount, salt);
    }

    // ---------------------------------------------------------------
    // 1. test_InitMatch
    // ---------------------------------------------------------------

    function test_InitMatch() public {
        _initDefaultMatch();

        address[] memory players = auction.getPlayers(MATCH_ID);
        assertEq(players.length, 3, "Should have 3 players");
        assertEq(players[0], player1);
        assertEq(players[1], player2);
        assertEq(players[2], player3);

        uint256 currentRound = auction.getCurrentRound(MATCH_ID);
        assertEq(currentRound, 0, "Current round should be 0 before any round starts");
    }

    // ---------------------------------------------------------------
    // 2. test_StartAuctionRound
    // ---------------------------------------------------------------

    function test_StartAuctionRound() public {
        _initDefaultMatch();

        bytes32 boxHash = keccak256("mystery_box_1");
        _startRound(MATCH_ID, boxHash);

        uint256 currentRound = auction.getCurrentRound(MATCH_ID);
        assertEq(currentRound, 1, "Current round should be 1 after starting first round");

        (
            bytes32 mysteryBoxHash,
            uint256 biddingDeadline,
            uint256 revealDeadline,
            uint256 actualValue,
            address winner,
            uint256 winningBid,
            bool resolved
        ) = auction.auctionRounds(MATCH_ID, 1);

        assertEq(mysteryBoxHash, boxHash, "Mystery box hash mismatch");
        assertEq(biddingDeadline, block.timestamp + BIDDING_DURATION, "Bidding deadline mismatch");
        assertEq(revealDeadline, block.timestamp + BIDDING_DURATION + REVEAL_DURATION, "Reveal deadline mismatch");
        assertEq(actualValue, 0, "Actual value should be 0 before resolution");
        assertEq(winner, address(0), "Winner should be zero address before resolution");
        assertEq(winningBid, 0, "Winning bid should be 0 before resolution");
        assertFalse(resolved, "Round should not be resolved yet");
    }

    // ---------------------------------------------------------------
    // 3. test_CommitRevealBid
    // ---------------------------------------------------------------

    function test_CommitRevealBid() public {
        _initDefaultMatch();
        _startRound(MATCH_ID, keccak256("box"));

        uint256 amount = 100;
        bytes32 salt = keccak256("secret_salt");
        bytes32 bidHash = keccak256(abi.encodePacked(amount, salt));

        // Commit
        vm.prank(player1);
        auction.commitBid(MATCH_ID, 1, bidHash);

        (
            address agent,
            bytes32 storedHash,
            uint256 revealedAmount,
            bool committed,
            bool revealed
        ) = auction.bids(MATCH_ID, 1, player1);

        assertEq(agent, player1, "Agent should be player1");
        assertEq(storedHash, bidHash, "Stored hash should match committed hash");
        assertEq(revealedAmount, 0, "Revealed amount should be 0 before reveal");
        assertTrue(committed, "Bid should be marked as committed");
        assertFalse(revealed, "Bid should not be revealed yet");

        // Reveal
        vm.prank(player1);
        auction.revealBid(MATCH_ID, 1, amount, salt);

        (
            ,
            ,
            uint256 revealedAmountAfter,
            ,
            bool revealedAfter
        ) = auction.bids(MATCH_ID, 1, player1);

        assertEq(revealedAmountAfter, amount, "Revealed amount should match bid amount");
        assertTrue(revealedAfter, "Bid should be marked as revealed");
    }

    // ---------------------------------------------------------------
    // 4. test_ResolveAuction
    // ---------------------------------------------------------------

    function test_ResolveAuction() public {
        _initDefaultMatch();
        _startRound(MATCH_ID, keccak256("box"));

        bytes32 salt1 = keccak256("salt1");
        bytes32 salt2 = keccak256("salt2");
        uint256 amount1 = 150; // player1 bids 150 (highest)
        uint256 amount2 = 80;  // player2 bids 80

        _commitAndReveal(player1, MATCH_ID, 1, amount1, salt1);
        _commitAndReveal(player2, MATCH_ID, 1, amount2, salt2);

        uint256 actualValue = 200;
        auction.resolveAuction(MATCH_ID, 1, actualValue);

        // Verify round resolution
        (
            ,
            ,
            ,
            uint256 storedActualValue,
            address winner,
            uint256 winningBid,
            bool resolved
        ) = auction.auctionRounds(MATCH_ID, 1);

        assertTrue(resolved, "Round should be resolved");
        assertEq(winner, player1, "Player1 should be the winner (highest bid)");
        assertEq(winningBid, amount1, "Winning bid should be 150");
        assertEq(storedActualValue, actualValue, "Actual value should be stored");

        // Score = actualValue - winningBid = 200 - 150 = 50
        int256 score1 = auction.getScore(MATCH_ID, player1);
        assertEq(score1, int256(actualValue) - int256(amount1), "Score should be actualValue - bid");
        assertEq(score1, 50, "Player1 score should be 50");

        // Player2 did not win, so score stays 0
        int256 score2 = auction.getScore(MATCH_ID, player2);
        assertEq(score2, 0, "Player2 score should be 0 (did not win)");
    }

    // ---------------------------------------------------------------
    // 5. test_MultiRoundAuction
    // ---------------------------------------------------------------

    function test_MultiRoundAuction() public {
        _initDefaultMatch();

        // --- Round 1 ---
        _startRound(MATCH_ID, keccak256("box_r1"));

        _commitAndReveal(player1, MATCH_ID, 1, 100, keccak256("s1r1"));
        _commitAndReveal(player2, MATCH_ID, 1, 80, keccak256("s2r1"));

        // actualValue = 120, winner = player1, score = 120 - 100 = 20
        auction.resolveAuction(MATCH_ID, 1, 120);

        int256 score1AfterR1 = auction.getScore(MATCH_ID, player1);
        assertEq(score1AfterR1, 20, "Player1 score after round 1 should be 20");

        // --- Round 2 ---
        _startRound(MATCH_ID, keccak256("box_r2"));

        uint256 currentRound = auction.getCurrentRound(MATCH_ID);
        assertEq(currentRound, 2, "Current round should be 2");

        _commitAndReveal(player1, MATCH_ID, 2, 50, keccak256("s1r2"));
        _commitAndReveal(player2, MATCH_ID, 2, 90, keccak256("s2r2"));

        // actualValue = 70, winner = player2 (bid 90), score = 70 - 90 = -20
        auction.resolveAuction(MATCH_ID, 2, 70);

        // Player1 score unchanged from round 1 (did not win round 2)
        int256 score1AfterR2 = auction.getScore(MATCH_ID, player1);
        assertEq(score1AfterR2, 20, "Player1 score should still be 20 after round 2");

        // Player2 score accumulated: 0 + (70 - 90) = -20
        int256 score2AfterR2 = auction.getScore(MATCH_ID, player2);
        assertEq(score2AfterR2, -20, "Player2 score after round 2 should be -20");
    }

    // ---------------------------------------------------------------
    // 6. test_Revert_CommitNotPlayer
    // ---------------------------------------------------------------

    function test_Revert_CommitNotPlayer() public {
        _initDefaultMatch();
        _startRound(MATCH_ID, keccak256("box"));

        bytes32 bidHash = keccak256(abi.encodePacked(uint256(100), keccak256("salt")));

        vm.prank(address(0x99));
        vm.expectRevert("Not a player");
        auction.commitBid(MATCH_ID, 1, bidHash);
    }

    // ---------------------------------------------------------------
    // 7. test_Revert_CommitAfterDeadline
    // ---------------------------------------------------------------

    function test_Revert_CommitAfterDeadline() public {
        _initDefaultMatch();
        _startRound(MATCH_ID, keccak256("box"));

        // Warp past the bidding deadline
        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        bytes32 bidHash = keccak256(abi.encodePacked(uint256(100), keccak256("salt")));

        vm.prank(player1);
        vm.expectRevert("Bidding closed");
        auction.commitBid(MATCH_ID, 1, bidHash);
    }

    // ---------------------------------------------------------------
    // 8. test_Revert_RevealHashMismatch
    // ---------------------------------------------------------------

    function test_Revert_RevealHashMismatch() public {
        _initDefaultMatch();
        _startRound(MATCH_ID, keccak256("box"));

        uint256 amount = 100;
        bytes32 correctSalt = keccak256("correct_salt");
        bytes32 wrongSalt = keccak256("wrong_salt");
        bytes32 bidHash = keccak256(abi.encodePacked(amount, correctSalt));

        // Commit with correct hash
        vm.prank(player1);
        auction.commitBid(MATCH_ID, 1, bidHash);

        // Reveal with wrong salt -> hash mismatch
        vm.prank(player1);
        vm.expectRevert("Hash mismatch");
        auction.revealBid(MATCH_ID, 1, amount, wrongSalt);
    }

    // ---------------------------------------------------------------
    // 9. test_Revert_UnauthorizedInit
    // ---------------------------------------------------------------

    function test_Revert_UnauthorizedInit() public {
        address[] memory players = new address[](2);
        players[0] = player1;
        players[1] = player2;

        vm.prank(address(0x99));
        vm.expectRevert("Only arena agent");
        auction.initMatch(MATCH_ID, players, TOTAL_ROUNDS);
    }

    // ---------------------------------------------------------------
    // 10. test_Revert_NeedTwoPlayers
    // ---------------------------------------------------------------

    function test_Revert_NeedTwoPlayers() public {
        address[] memory players = new address[](1);
        players[0] = player1;

        vm.expectRevert("Need at least 2 players");
        auction.initMatch(MATCH_ID, players, TOTAL_ROUNDS);
    }
}
