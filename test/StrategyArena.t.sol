// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/game-modes/StrategyArena.sol";

contract StrategyArenaTest is Test {
    StrategyArena public arena;

    address public arenaAgent = address(this);
    address public player1 = address(0x1);
    address public player2 = address(0x2);

    bytes32 public salt1 = keccak256("salt1");
    bytes32 public salt2 = keccak256("salt2");

    function setUp() public {
        arena = new StrategyArena(arenaAgent);
    }

    // --------------- helpers ---------------

    function _commitReveal(
        uint256 matchId,
        address player,
        StrategyArena.Move move,
        bytes32 salt
    ) internal {
        bytes32 moveHash = keccak256(abi.encodePacked(move, salt));

        vm.prank(player);
        arena.commitMove(matchId, moveHash);

        vm.prank(player);
        arena.revealMove(matchId, move, salt);
    }

    // --------------- 1. test_InitMatch ---------------

    function test_InitMatch() public {
        arena.initMatch(1, player1, player2, 3, 60, 60);

        StrategyArena.MatchState memory s = arena.getMatchState(1);
        assertEq(s.player1, player1);
        assertEq(s.player2, player2);
        assertEq(s.totalRounds, 3);
        assertEq(s.currentRound, 1);
        assertEq(s.player1Score, 0);
        assertEq(s.player2Score, 0);
        assertEq(s.commitDeadline, block.timestamp + 60);
        assertEq(s.revealDeadline, block.timestamp + 60 + 60);
        assertTrue(s.initialized);
    }

    // --------------- 2. test_CommitRevealResolve_CC ---------------

    function test_CommitRevealResolve_CC() public {
        arena.initMatch(1, player1, player2, 1, 60, 60);

        _commitReveal(1, player1, StrategyArena.Move.Cooperate, salt1);
        _commitReveal(1, player2, StrategyArena.Move.Cooperate, salt2);

        arena.resolveRound(1);

        StrategyArena.MatchState memory s = arena.getMatchState(1);
        assertEq(s.player1Score, 6000);
        assertEq(s.player2Score, 6000);

        StrategyArena.GameRound memory r = arena.getRound(1, 1);
        assertTrue(r.resolved);
    }

    // --------------- 3. test_CommitRevealResolve_DC ---------------

    function test_CommitRevealResolve_DC() public {
        arena.initMatch(1, player1, player2, 1, 60, 60);

        _commitReveal(1, player1, StrategyArena.Move.Defect, salt1);
        _commitReveal(1, player2, StrategyArena.Move.Cooperate, salt2);

        arena.resolveRound(1);

        StrategyArena.MatchState memory s = arena.getMatchState(1);
        assertEq(s.player1Score, 10000);
        assertEq(s.player2Score, 0);
    }

    // --------------- 4. test_CommitRevealResolve_DD ---------------

    function test_CommitRevealResolve_DD() public {
        arena.initMatch(1, player1, player2, 1, 60, 60);

        _commitReveal(1, player1, StrategyArena.Move.Defect, salt1);
        _commitReveal(1, player2, StrategyArena.Move.Defect, salt2);

        arena.resolveRound(1);

        StrategyArena.MatchState memory s = arena.getMatchState(1);
        assertEq(s.player1Score, 2000);
        assertEq(s.player2Score, 2000);
    }

    // --------------- 5. test_AdvanceRound ---------------

    function test_AdvanceRound() public {
        arena.initMatch(1, player1, player2, 3, 60, 60);

        _commitReveal(1, player1, StrategyArena.Move.Cooperate, salt1);
        _commitReveal(1, player2, StrategyArena.Move.Cooperate, salt2);
        arena.resolveRound(1);

        arena.advanceRound(1, 60, 60);

        StrategyArena.MatchState memory s = arena.getMatchState(1);
        assertEq(s.currentRound, 2);
        assertEq(s.commitDeadline, block.timestamp + 60);
        assertEq(s.revealDeadline, block.timestamp + 60 + 60);
    }

    // --------------- 6. test_TwoRoundsFullGame ---------------

    function test_TwoRoundsFullGame() public {
        arena.initMatch(1, player1, player2, 2, 60, 60);

        // Round 1: player1 Cooperate, player2 Defect => p1 gets 0, p2 gets 10000
        _commitReveal(1, player1, StrategyArena.Move.Cooperate, salt1);
        _commitReveal(1, player2, StrategyArena.Move.Defect, salt2);
        arena.resolveRound(1);

        StrategyArena.MatchState memory s1 = arena.getMatchState(1);
        assertEq(s1.player1Score, 0);
        assertEq(s1.player2Score, 10000);

        arena.advanceRound(1, 60, 60);

        // Round 2: player1 Defect, player2 Cooperate => p1 gets 10000, p2 gets 0
        bytes32 salt1r2 = keccak256("salt1_round2");
        bytes32 salt2r2 = keccak256("salt2_round2");

        _commitReveal(1, player1, StrategyArena.Move.Defect, salt1r2);
        _commitReveal(1, player2, StrategyArena.Move.Cooperate, salt2r2);
        arena.resolveRound(1);

        // Accumulated: p1 = 0 + 10000 = 10000, p2 = 10000 + 0 = 10000
        StrategyArena.MatchState memory s2 = arena.getMatchState(1);
        assertEq(s2.player1Score, 10000);
        assertEq(s2.player2Score, 10000);
        assertEq(s2.currentRound, 2);
    }

    // --------------- 7. test_ForfeitRound ---------------

    function test_ForfeitRound() public {
        arena.initMatch(1, player1, player2, 1, 60, 60);

        arena.forfeitRound(1, player1);

        StrategyArena.MatchState memory s = arena.getMatchState(1);
        assertEq(s.player2Score, 10000);
        assertEq(s.player1Score, 0);

        StrategyArena.GameRound memory r = arena.getRound(1, 1);
        assertTrue(r.resolved);
    }

    // --------------- 8. test_UpdatePayoffMatrix ---------------

    function test_UpdatePayoffMatrix() public {
        // Update the matrix to custom values
        arena.updatePayoffMatrix(5000, 8000, 1000, 3000);

        assertEq(arena.cooperateCooperate(), 5000);
        assertEq(arena.defectCooperate(), 8000);
        assertEq(arena.cooperateDefect(), 1000);
        assertEq(arena.defectDefect(), 3000);

        // Play a round with the updated matrix: Cooperate + Cooperate = 5000/5000
        arena.initMatch(1, player1, player2, 1, 60, 60);

        _commitReveal(1, player1, StrategyArena.Move.Cooperate, salt1);
        _commitReveal(1, player2, StrategyArena.Move.Cooperate, salt2);
        arena.resolveRound(1);

        StrategyArena.MatchState memory s = arena.getMatchState(1);
        assertEq(s.player1Score, 5000);
        assertEq(s.player2Score, 5000);
    }

    // --------------- 9. test_Revert_CommitNotPlayer ---------------

    function test_Revert_CommitNotPlayer() public {
        arena.initMatch(1, player1, player2, 1, 60, 60);

        bytes32 moveHash = keccak256(
            abi.encodePacked(StrategyArena.Move.Cooperate, salt1)
        );

        vm.prank(address(0x99));
        vm.expectRevert("Not a player");
        arena.commitMove(1, moveHash);
    }

    // --------------- 10. test_Revert_RevealHashMismatch ---------------

    function test_Revert_RevealHashMismatch() public {
        arena.initMatch(1, player1, player2, 1, 60, 60);

        // Commit with salt1
        bytes32 moveHash = keccak256(
            abi.encodePacked(StrategyArena.Move.Cooperate, salt1)
        );
        vm.prank(player1);
        arena.commitMove(1, moveHash);

        // Reveal with wrong salt
        bytes32 wrongSalt = keccak256("wrong_salt");
        vm.prank(player1);
        vm.expectRevert("Hash mismatch");
        arena.revealMove(1, StrategyArena.Move.Cooperate, wrongSalt);
    }

    // --------------- 11. test_Revert_ResolveNotRevealed ---------------

    function test_Revert_ResolveNotRevealed() public {
        arena.initMatch(1, player1, player2, 1, 60, 60);

        // Only player1 commits and reveals
        _commitReveal(1, player1, StrategyArena.Move.Cooperate, salt1);

        // Attempt to resolve before player2 has revealed
        vm.expectRevert("Not all revealed");
        arena.resolveRound(1);
    }

    // --------------- 12. test_Revert_UnauthorizedInit ---------------

    function test_Revert_UnauthorizedInit() public {
        vm.prank(address(0x99));
        vm.expectRevert("Only arena agent");
        arena.initMatch(1, player1, player2, 1, 60, 60);
    }
}
