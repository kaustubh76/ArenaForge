// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/game-modes/OracleDuel.sol";

contract OracleDuelTest is Test {
    OracleDuel public duel;

    address public arenaAgent = address(this);
    address public bull = address(0x1);
    address public bear = address(0x2);
    address public token = address(0xABCD);

    function setUp() public {
        duel = new OracleDuel(arenaAgent);
    }

    function test_InitDuel() public {
        duel.initDuel(1, token, 1000, 300, bull, bear);

        OracleDuel.Duel memory d = duel.getDuel(1);
        assertEq(d.matchId, 1);
        assertEq(d.tokenAddress, token);
        assertEq(d.snapshotPrice, 1000);
        assertEq(d.bullPlayer, bull);
        assertEq(d.bearPlayer, bear);
        assertFalse(d.resolved);
        assertEq(d.resolutionTime, block.timestamp + 300);
    }

    function test_ResolveBullWins() public {
        duel.initDuel(1, token, 1000, 300, bull, bear);
        vm.warp(block.timestamp + 300);

        address winner = duel.resolveDuel(1, 1500);

        assertEq(winner, bull);
        OracleDuel.Duel memory d = duel.getDuel(1);
        assertTrue(d.resolved);
        assertEq(d.resolvedPrice, 1500);
    }

    function test_ResolveBearWins() public {
        duel.initDuel(1, token, 1000, 300, bull, bear);
        vm.warp(block.timestamp + 300);

        address winner = duel.resolveDuel(1, 500);

        assertEq(winner, bear);
    }

    function test_ResolveDraw() public {
        duel.initDuel(1, token, 1000, 300, bull, bear);
        vm.warp(block.timestamp + 300);

        address winner = duel.resolveDuel(1, 1000);

        assertEq(winner, address(0));
    }

    function test_RevertResolveTooEarly() public {
        duel.initDuel(1, token, 1000, 300, bull, bear);

        vm.expectRevert("Too early");
        duel.resolveDuel(1, 1500);
    }

    function test_RevertResolveAlreadyResolved() public {
        duel.initDuel(1, token, 1000, 300, bull, bear);
        vm.warp(block.timestamp + 300);
        duel.resolveDuel(1, 1500);

        vm.expectRevert("Already resolved");
        duel.resolveDuel(1, 2000);
    }

    function test_RevertResolveNonexistent() public {
        vm.warp(block.timestamp + 300);
        vm.expectRevert("Duel not found");
        duel.resolveDuel(99, 1000);
    }

    function test_RevertInitSamePlayer() public {
        vm.expectRevert("Same player");
        duel.initDuel(1, token, 1000, 300, bull, bull);
    }

    function test_RevertInitZeroToken() public {
        vm.expectRevert("Zero token");
        duel.initDuel(1, address(0), 1000, 300, bull, bear);
    }

    function test_RevertUnauthorizedInit() public {
        vm.prank(address(0x99));
        vm.expectRevert("Only arena agent");
        duel.initDuel(1, token, 1000, 300, bull, bear);
    }

    function test_RevertUnauthorizedResolve() public {
        duel.initDuel(1, token, 1000, 300, bull, bear);
        vm.warp(block.timestamp + 300);

        vm.prank(address(0x99));
        vm.expectRevert("Only arena agent");
        duel.resolveDuel(1, 1500);
    }
}
