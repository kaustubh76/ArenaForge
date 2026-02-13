// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ArenaCore.sol";
import "../src/WagerEscrow.sol";
import "../src/MatchRegistry.sol";
import "../src/game-modes/OracleDuel.sol";

contract IntegrationTest is Test {
    ArenaCore public core;
    WagerEscrow public escrow;
    MatchRegistry public registry;
    OracleDuel public oracleDuel;

    address public arenaAgent = address(this);
    address public agent1 = address(0x1);
    address public agent2 = address(0x2);
    address public agent3 = address(0x3);
    address public agent4 = address(0x4);

    uint256 constant ENTRY_STAKE = 5 ether;

    receive() external payable {}

    function setUp() public {
        // Deploy full stack
        escrow = new WagerEscrow(arenaAgent);
        registry = new MatchRegistry(arenaAgent);
        core = new ArenaCore(arenaAgent, address(escrow), address(registry));
        oracleDuel = new OracleDuel(arenaAgent);

        // Configure permissions
        escrow.setAuthorizedCaller(address(core));
        registry.setAuthorizedCaller(address(core));
        core.registerGameMode(0, address(oracleDuel));

        // Fund agents
        vm.deal(agent1, 100 ether);
        vm.deal(agent2, 100 ether);
        vm.deal(agent3, 100 ether);
        vm.deal(agent4, 100 ether);
    }

    function test_FullTournamentLifecycle() public {
        // 1. Register all agents
        vm.prank(agent1);
        core.registerAgent("Agent1");
        vm.prank(agent2);
        core.registerAgent("Agent2");
        vm.prank(agent3);
        core.registerAgent("Agent3");
        vm.prank(agent4);
        core.registerAgent("Agent4");

        // 2. Create tournament
        uint256 tournamentId = core.createTournament(
            "Oracle Championship #1",
            ArenaCore.GameType.OracleDuel,
            ArenaCore.TournamentFormat.SingleElimination,
            ENTRY_STAKE,
            4,
            2,
            keccak256("initial_params")
        );
        assertEq(tournamentId, 1);

        // 3. All agents join
        vm.prank(agent1);
        core.joinTournament{value: ENTRY_STAKE}(1);
        vm.prank(agent2);
        core.joinTournament{value: ENTRY_STAKE}(1);
        vm.prank(agent3);
        core.joinTournament{value: ENTRY_STAKE}(1);
        vm.prank(agent4);
        core.joinTournament{value: ENTRY_STAKE}(1);

        ArenaCore.Tournament memory t = core.getTournament(1);
        assertEq(t.currentParticipants, 4);
        assertEq(t.prizePool, 20 ether);
        assertEq(address(escrow).balance, 20 ether);

        // 4. Start tournament
        core.startTournament(1);
        t = core.getTournament(1);
        assertTrue(t.status == ArenaCore.TournamentStatus.Active);

        // 5. Create semi-final matches
        uint256 match1 = registry.createMatch(1, 1, agent1, agent4);
        uint256 match2 = registry.createMatch(1, 1, agent2, agent3);
        assertEq(match1, 1);
        assertEq(match2, 2);

        // Lock escrow for matches
        escrow.lockForMatch(1, agent1, agent4);
        escrow.lockForMatch(1, agent2, agent3);

        // 6. Start and resolve semi-finals
        registry.startMatch(match1);
        registry.startMatch(match2);

        // Init oracle duels
        address token1 = address(0xAAAA);
        oracleDuel.initDuel(match1, token1, 1000, 300, agent1, agent4);
        oracleDuel.initDuel(match2, token1, 2000, 300, agent2, agent3);

        // Advance time and resolve
        vm.warp(block.timestamp + 300);
        address winner1 = oracleDuel.resolveDuel(match1, 1500); // Bull (agent1) wins
        address winner2 = oracleDuel.resolveDuel(match2, 1500); // Bear (agent3) wins
        assertEq(winner1, agent1);
        assertEq(winner2, agent3);

        // Record results
        registry.recordResult(match1, agent1, keccak256("agent1 wins SF1"));
        registry.recordResult(match2, agent3, keccak256("agent3 wins SF2"));

        // Update ELO
        core.updateElo(agent1, 1232, true);
        core.updateElo(agent4, 1168, false);
        core.updateElo(agent3, 1232, true);
        core.updateElo(agent2, 1168, false);

        // 7. Evolve parameters between rounds
        bytes32 evolvedParams = keccak256("evolved_params_r2");
        core.evolveParameters(1, evolvedParams);
        core.advanceRound(1);

        // 8. Create and resolve final
        uint256 finalMatch = registry.createMatch(1, 2, agent1, agent3);
        registry.startMatch(finalMatch);
        oracleDuel.initDuel(finalMatch, token1, 3000, 300, agent1, agent3);

        vm.warp(block.timestamp + 300);
        address champion = oracleDuel.resolveDuel(finalMatch, 3500); // Bull (agent1) wins
        assertEq(champion, agent1);

        registry.recordResult(finalMatch, agent1, keccak256("agent1 champion"));
        core.updateElo(agent1, 1256, true);
        core.updateElo(agent3, 1208, false);

        // 9. Distribute prizes and complete
        _distributePrizesAndComplete();
    }

    function _distributePrizesAndComplete() internal {
        // Total: 20 ether, 5% fee = 1 ether, Net = 19 ether
        // 1st: 60% = 11.4 ether, 2nd: 25% = 4.75 ether, 3rd: 15% = 2.85 ether
        uint256 bal1Before = agent1.balance;
        uint256 bal3Before = agent3.balance;
        uint256 bal2Before = agent2.balance;

        address[] memory recipients = new address[](4);
        recipients[0] = agent1;
        recipients[1] = agent3;
        recipients[2] = agent2;
        recipients[3] = arenaAgent;

        uint256[] memory amounts = new uint256[](4);
        amounts[0] = 11.4 ether;
        amounts[1] = 4.75 ether;
        amounts[2] = 2.85 ether;
        amounts[3] = 1 ether;

        uint256 arenaBalBefore = arenaAgent.balance;
        escrow.batchDistribute(1, recipients, amounts);

        assertEq(agent1.balance, bal1Before + 11.4 ether);
        assertEq(agent3.balance, bal3Before + 4.75 ether);
        assertEq(agent2.balance, bal2Before + 2.85 ether);
        assertEq(arenaAgent.balance, arenaBalBefore + 1 ether);

        // Complete tournament
        core.completeTournament(1, agent1);

        ArenaCore.Tournament memory t = core.getTournament(1);
        assertTrue(t.status == ArenaCore.TournamentStatus.Completed);

        // Verify final ELO
        ArenaCore.AgentProfile memory p1 = core.getAgent(agent1);
        assertEq(p1.elo, 1256);
        assertEq(p1.wins, 2);
        assertEq(p1.matchesPlayed, 2);

        // Verify escrow drained
        assertEq(address(escrow).balance, 0);
    }

    function test_TournamentCancellationRefund() public {
        vm.prank(agent1);
        core.registerAgent("Agent1");

        core.createTournament(
            "Cancelled Tournament",
            ArenaCore.GameType.OracleDuel,
            ArenaCore.TournamentFormat.SingleElimination,
            5 ether, 4, 2, keccak256("p")
        );

        vm.prank(agent1);
        core.joinTournament{value: 5 ether}(1);

        uint256 balBefore = agent1.balance;

        // Cancel and refund
        core.cancelTournament(1);
        escrow.refund(1, agent1);

        assertEq(agent1.balance, balBefore + 5 ether);
    }
}
