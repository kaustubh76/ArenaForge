// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ArenaCore.sol";
import "../src/WagerEscrow.sol";
import "../src/MatchRegistry.sol";

contract ArenaCoreTest is Test {
    ArenaCore public core;
    WagerEscrow public escrow;
    MatchRegistry public registry;

    address public arenaAgent = address(this);
    address public agent1 = address(0x1);
    address public agent2 = address(0x2);
    address public agent3 = address(0x3);

    function setUp() public {
        escrow = new WagerEscrow(arenaAgent);
        registry = new MatchRegistry(arenaAgent);
        core = new ArenaCore(arenaAgent, address(escrow), address(registry));
        escrow.setAuthorizedCaller(address(core));
        registry.setAuthorizedCaller(address(core));

        vm.deal(agent1, 100 ether);
        vm.deal(agent2, 100 ether);
        vm.deal(agent3, 100 ether);
    }

    // --- Agent Registration ---

    function test_RegisterAgent() public {
        vm.prank(agent1);
        core.registerAgent("AlphaBot");

        ArenaCore.AgentProfile memory profile = core.getAgent(agent1);
        assertTrue(profile.registered);
        assertEq(profile.elo, 1200);
        assertEq(profile.moltbookHandle, "AlphaBot");
        assertEq(profile.matchesPlayed, 0);
    }

    function test_RevertDoubleRegistration() public {
        vm.prank(agent1);
        core.registerAgent("AlphaBot");

        vm.prank(agent1);
        vm.expectRevert("Already registered");
        core.registerAgent("AlphaBot2");
    }

    function test_RevertEmptyHandle() public {
        vm.prank(agent1);
        vm.expectRevert("Empty handle");
        core.registerAgent("");
    }

    // --- Tournament Creation ---

    function test_CreateTournament() public {
        uint256 id = core.createTournament(
            "Test Tournament",
            ArenaCore.GameType.OracleDuel,
            ArenaCore.TournamentFormat.SingleElimination,
            5 ether,
            8,
            3,
            keccak256("params")
        );

        assertEq(id, 1);
        ArenaCore.Tournament memory t = core.getTournament(1);
        assertEq(t.id, 1);
        assertEq(t.entryStake, 5 ether);
        assertEq(t.maxParticipants, 8);
        assertTrue(t.status == ArenaCore.TournamentStatus.Open);
    }

    function test_RevertNonAgentCreateTournament() public {
        vm.prank(agent1);
        vm.expectRevert("Only arena agent");
        core.createTournament("Test", ArenaCore.GameType.OracleDuel, ArenaCore.TournamentFormat.SingleElimination, 5 ether, 8, 3, keccak256("p"));
    }

    function test_RevertTooFewMaxParticipants() public {
        vm.expectRevert("Need at least 2 max");
        core.createTournament("Test", ArenaCore.GameType.OracleDuel, ArenaCore.TournamentFormat.SingleElimination, 5 ether, 1, 3, keccak256("p"));
    }

    // --- Tournament Joining ---

    function test_JoinTournament() public {
        _createDefaultTournament();
        _registerAgent(agent1, "Agent1");

        vm.prank(agent1);
        core.joinTournament{value: 5 ether}(1);

        ArenaCore.Tournament memory t = core.getTournament(1);
        assertEq(t.currentParticipants, 1);
        assertEq(t.prizePool, 5 ether);
        assertTrue(core.isParticipant(1, agent1));
    }

    function test_RevertWrongStake() public {
        _createDefaultTournament();
        _registerAgent(agent1, "Agent1");

        vm.prank(agent1);
        vm.expectRevert("Wrong stake amount");
        core.joinTournament{value: 3 ether}(1);
    }

    function test_RevertUnregisteredJoin() public {
        _createDefaultTournament();

        vm.prank(agent1);
        vm.expectRevert("Not registered");
        core.joinTournament{value: 5 ether}(1);
    }

    function test_RevertDoubleJoin() public {
        _createDefaultTournament();
        _registerAgent(agent1, "Agent1");

        vm.prank(agent1);
        core.joinTournament{value: 5 ether}(1);

        vm.prank(agent1);
        vm.expectRevert("Already joined");
        core.joinTournament{value: 5 ether}(1);
    }

    function test_RevertJoinFullTournament() public {
        core.createTournament("Tiny", ArenaCore.GameType.OracleDuel, ArenaCore.TournamentFormat.SingleElimination, 5 ether, 2, 1, keccak256("p"));
        _registerAgent(agent1, "Agent1");
        _registerAgent(agent2, "Agent2");
        _registerAgent(agent3, "Agent3");

        vm.prank(agent1);
        core.joinTournament{value: 5 ether}(1);
        vm.prank(agent2);
        core.joinTournament{value: 5 ether}(1);

        vm.prank(agent3);
        vm.expectRevert("Tournament full");
        core.joinTournament{value: 5 ether}(1);
    }

    // --- Tournament Lifecycle ---

    function test_StartTournament() public {
        _createDefaultTournament();
        _registerAndJoin(agent1, "Agent1");
        _registerAndJoin(agent2, "Agent2");

        core.startTournament(1);

        ArenaCore.Tournament memory t = core.getTournament(1);
        assertTrue(t.status == ArenaCore.TournamentStatus.Active);
        assertEq(t.currentRound, 1);
        assertTrue(t.startTime > 0);
    }

    function test_RevertStartWithOnePlayer() public {
        _createDefaultTournament();
        _registerAndJoin(agent1, "Agent1");

        vm.expectRevert("Need at least 2 participants");
        core.startTournament(1);
    }

    function test_CompleteTournament() public {
        _createDefaultTournament();
        _registerAndJoin(agent1, "Agent1");
        _registerAndJoin(agent2, "Agent2");
        core.startTournament(1);

        core.completeTournament(1, agent1);

        ArenaCore.Tournament memory t = core.getTournament(1);
        assertTrue(t.status == ArenaCore.TournamentStatus.Completed);
    }

    function test_CancelTournament() public {
        _createDefaultTournament();
        core.cancelTournament(1);

        ArenaCore.Tournament memory t = core.getTournament(1);
        assertTrue(t.status == ArenaCore.TournamentStatus.Cancelled);
    }

    // --- ELO Updates ---

    function test_UpdateElo() public {
        _registerAgent(agent1, "Agent1");

        core.updateElo(agent1, 1232, true);

        ArenaCore.AgentProfile memory profile = core.getAgent(agent1);
        assertEq(profile.elo, 1232);
        assertEq(profile.wins, 1);
        assertEq(profile.matchesPlayed, 1);
    }

    // --- Evolution ---

    function test_EvolveParameters() public {
        _createDefaultTournament();
        _registerAndJoin(agent1, "Agent1");
        _registerAndJoin(agent2, "Agent2");
        core.startTournament(1);

        bytes32 newHash = keccak256("evolved");
        core.evolveParameters(1, newHash);

        ArenaCore.Tournament memory t = core.getTournament(1);
        assertEq(t.parametersHash, newHash);
    }

    // --- Helpers ---

    function _createDefaultTournament() internal returns (uint256) {
        return core.createTournament(
            "Test Tournament",
            ArenaCore.GameType.OracleDuel,
            ArenaCore.TournamentFormat.SingleElimination,
            5 ether,
            8,
            3,
            keccak256("params")
        );
    }

    function _registerAgent(address agent, string memory handle) internal {
        vm.prank(agent);
        core.registerAgent(handle);
    }

    function _registerAndJoin(address agent, string memory handle) internal {
        _registerAgent(agent, handle);
        vm.prank(agent);
        core.joinTournament{value: 5 ether}(1);
    }
}
