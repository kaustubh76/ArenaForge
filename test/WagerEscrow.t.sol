// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WagerEscrow.sol";

contract WagerEscrowTest is Test {
    WagerEscrow public escrow;

    address public arenaAgent = address(this);
    address public agent1 = address(0x1);
    address public agent2 = address(0x2);
    address public unauthorizedCaller = address(0x99);

    function setUp() public {
        escrow = new WagerEscrow(arenaAgent);
        vm.deal(agent1, 100 ether);
        vm.deal(agent2, 100 ether);
        vm.deal(arenaAgent, 100 ether);
    }

    // --- Deposit ---

    function test_Deposit() public {
        escrow.deposit{value: 5 ether}(1, agent1);

        WagerEscrow.EscrowEntry memory entry = escrow.getEscrow(1, agent1);
        assertEq(entry.amount, 5 ether);
        assertTrue(entry.status == WagerEscrow.EscrowStatus.Deposited);
        assertEq(escrow.tournamentPools(1), 5 ether);
    }

    function test_RevertZeroDeposit() public {
        vm.expectRevert("Zero deposit");
        escrow.deposit{value: 0}(1, agent1);
    }

    function test_RevertDoubleDeposit() public {
        escrow.deposit{value: 5 ether}(1, agent1);

        vm.expectRevert("Already deposited");
        escrow.deposit{value: 5 ether}(1, agent1);
    }

    function test_RevertUnauthorizedDeposit() public {
        vm.deal(unauthorizedCaller, 10 ether);
        vm.prank(unauthorizedCaller);
        vm.expectRevert("Not authorized");
        escrow.deposit{value: 5 ether}(1, agent1);
    }

    // --- Lock ---

    function test_LockForMatch() public {
        escrow.deposit{value: 5 ether}(1, agent1);
        escrow.deposit{value: 5 ether}(1, agent2);

        escrow.lockForMatch(1, agent1, agent2);

        WagerEscrow.EscrowEntry memory e1 = escrow.getEscrow(1, agent1);
        WagerEscrow.EscrowEntry memory e2 = escrow.getEscrow(1, agent2);
        assertTrue(e1.status == WagerEscrow.EscrowStatus.Locked);
        assertTrue(e2.status == WagerEscrow.EscrowStatus.Locked);
    }

    function test_RevertUnauthorizedLock() public {
        escrow.deposit{value: 5 ether}(1, agent1);
        escrow.deposit{value: 5 ether}(1, agent2);

        vm.prank(unauthorizedCaller);
        vm.expectRevert("Only arena agent");
        escrow.lockForMatch(1, agent1, agent2);
    }

    // --- Distribute ---

    function test_DistributePrize() public {
        escrow.deposit{value: 5 ether}(1, agent1);
        escrow.deposit{value: 5 ether}(1, agent2);
        escrow.lockForMatch(1, agent1, agent2);

        uint256 balBefore = agent1.balance;
        escrow.distributePrize(1, agent1, 9 ether);

        assertEq(agent1.balance, balBefore + 9 ether);
        WagerEscrow.EscrowEntry memory entry = escrow.getEscrow(1, agent1);
        assertTrue(entry.status == WagerEscrow.EscrowStatus.Released);
    }

    function test_BatchDistribute() public {
        escrow.deposit{value: 5 ether}(1, agent1);
        escrow.deposit{value: 5 ether}(1, agent2);
        escrow.lockForMatch(1, agent1, agent2);

        address[] memory recipients = new address[](2);
        recipients[0] = agent1;
        recipients[1] = agent2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 6 ether;
        amounts[1] = 4 ether;

        uint256 bal1Before = agent1.balance;
        uint256 bal2Before = agent2.balance;

        escrow.batchDistribute(1, recipients, amounts);

        assertEq(agent1.balance, bal1Before + 6 ether);
        assertEq(agent2.balance, bal2Before + 4 ether);
    }

    function test_RevertBatchLengthMismatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = agent1;
        recipients[1] = agent2;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 5 ether;

        vm.expectRevert("Length mismatch");
        escrow.batchDistribute(1, recipients, amounts);
    }

    // --- Refund ---

    function test_Refund() public {
        escrow.deposit{value: 5 ether}(1, agent1);

        uint256 balBefore = agent1.balance;
        escrow.refund(1, agent1);

        assertEq(agent1.balance, balBefore + 5 ether);
        WagerEscrow.EscrowEntry memory entry = escrow.getEscrow(1, agent1);
        assertTrue(entry.status == WagerEscrow.EscrowStatus.Refunded);
        assertEq(escrow.tournamentPools(1), 0);
    }

    function test_RevertRefundLockedFunds() public {
        escrow.deposit{value: 5 ether}(1, agent1);
        escrow.deposit{value: 5 ether}(1, agent2);
        escrow.lockForMatch(1, agent1, agent2);

        vm.expectRevert("Cannot refund");
        escrow.refund(1, agent1);
    }

    function test_RevertUnauthorizedRefund() public {
        escrow.deposit{value: 5 ether}(1, agent1);

        vm.prank(unauthorizedCaller);
        vm.expectRevert("Only arena agent");
        escrow.refund(1, agent1);
    }
}
