// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MatchRegistry.sol";

contract MatchRegistryTest is Test {
    MatchRegistry public registry;

    address public arenaAgent = address(this);
    address public player1 = address(0x1);
    address public player2 = address(0x2);

    function setUp() public {
        registry = new MatchRegistry(arenaAgent);
    }

    // --- Create Match ---

    function test_CreateMatch() public {
        uint256 id = registry.createMatch(1, 1, player1, player2);
        assertEq(id, 1);

        MatchRegistry.Match memory m = registry.getMatch(1);
        assertEq(m.id, 1);
        assertEq(m.tournamentId, 1);
        assertEq(m.round, 1);
        assertEq(m.player1, player1);
        assertEq(m.player2, player2);
        assertEq(m.winner, address(0));
        assertTrue(m.status == MatchRegistry.MatchStatus.Scheduled);
    }

    function test_CreateMultipleMatches() public {
        registry.createMatch(1, 1, player1, player2);
        uint256 id2 = registry.createMatch(1, 1, address(0x3), address(0x4));
        assertEq(id2, 2);
        assertEq(registry.matchCounter(), 2);
    }

    function test_RevertSamePlayer() public {
        vm.expectRevert("Same player");
        registry.createMatch(1, 1, player1, player1);
    }

    function test_RevertZeroAddress() public {
        vm.expectRevert("Zero address");
        registry.createMatch(1, 1, address(0), player2);
    }

    function test_TournamentMatchesTracked() public {
        registry.createMatch(1, 1, player1, player2);
        registry.createMatch(1, 2, player1, address(0x3));

        uint256[] memory ids = registry.getTournamentMatches(1);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
    }

    function test_AgentMatchesTracked() public {
        registry.createMatch(1, 1, player1, player2);
        registry.createMatch(2, 1, player1, address(0x3));

        uint256[] memory ids = registry.getAgentMatches(player1);
        assertEq(ids.length, 2);
    }

    // --- Start Match ---

    function test_StartMatch() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);

        MatchRegistry.Match memory m = registry.getMatch(1);
        assertTrue(m.status == MatchRegistry.MatchStatus.InProgress);
        assertTrue(m.timestamp > 0);
    }

    function test_RevertStartNonexistent() public {
        vm.expectRevert("Match not found");
        registry.startMatch(99);
    }

    function test_RevertStartAlreadyStarted() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);

        vm.expectRevert("Not scheduled");
        registry.startMatch(1);
    }

    // --- Record Result ---

    function test_RecordResult() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);

        bytes32 resultHash = keccak256("player1 wins");
        registry.recordResult(1, player1, resultHash);

        MatchRegistry.Match memory m = registry.getMatch(1);
        assertEq(m.winner, player1);
        assertEq(m.resultHash, resultHash);
        assertTrue(m.status == MatchRegistry.MatchStatus.Completed);
    }

    function test_RecordDraw() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);

        registry.recordResult(1, address(0), keccak256("draw"));

        MatchRegistry.Match memory m = registry.getMatch(1);
        assertEq(m.winner, address(0));
    }

    function test_RevertRecordBeforeStart() public {
        registry.createMatch(1, 1, player1, player2);

        vm.expectRevert("Not in progress");
        registry.recordResult(1, player1, keccak256("result"));
    }

    function test_RevertInvalidWinner() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);

        vm.expectRevert("Invalid winner");
        registry.recordResult(1, address(0x99), keccak256("result"));
    }

    // --- Dispute ---

    function test_DisputeWithinWindow() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);
        registry.recordResult(1, player1, keccak256("result"));

        vm.prank(player2);
        registry.disputeMatch(1);

        MatchRegistry.Match memory m = registry.getMatch(1);
        assertTrue(m.status == MatchRegistry.MatchStatus.Disputed);
    }

    function test_RevertDisputeAfterWindow() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);
        registry.recordResult(1, player1, keccak256("result"));

        vm.warp(block.timestamp + 31);

        vm.prank(player2);
        vm.expectRevert("Dispute window closed");
        registry.disputeMatch(1);
    }

    function test_RevertDisputeByNonPlayer() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);
        registry.recordResult(1, player1, keccak256("result"));

        vm.prank(address(0x99));
        vm.expectRevert("Not a player");
        registry.disputeMatch(1);
    }

    // --- Access Control ---

    function test_RevertUnauthorizedCreateMatch() public {
        vm.prank(address(0x99));
        vm.expectRevert("Not authorized");
        registry.createMatch(1, 1, player1, player2);
    }

    function test_RevertUnauthorizedRecordResult() public {
        registry.createMatch(1, 1, player1, player2);
        registry.startMatch(1);

        vm.prank(address(0x99));
        vm.expectRevert("Not authorized");
        registry.recordResult(1, player1, keccak256("result"));
    }
}
