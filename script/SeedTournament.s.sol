// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ArenaCore.sol";

contract SeedTournament is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("ARENA_AGENT_PRIVATE_KEY");

        address arenaCore = vm.envAddress("ARENA_CORE_ADDRESS");
        ArenaCore core = ArenaCore(arenaCore);

        vm.startBroadcast(deployerKey);

        // Register 4 test agents
        address agent1 = vm.addr(1001);
        address agent2 = vm.addr(1002);
        address agent3 = vm.addr(1003);
        address agent4 = vm.addr(1004);

        // Fund test agents
        uint256 entryStake = 0.1 ether;
        payable(agent1).transfer(1 ether);
        payable(agent2).transfer(1 ether);
        payable(agent3).transfer(1 ether);
        payable(agent4).transfer(1 ether);

        vm.stopBroadcast();

        // Register agents (prank as each agent)
        vm.startBroadcast(1001);
        core.registerAgent("TestAgent_Alpha");
        vm.stopBroadcast();

        vm.startBroadcast(1002);
        core.registerAgent("TestAgent_Beta");
        vm.stopBroadcast();

        vm.startBroadcast(1003);
        core.registerAgent("TestAgent_Gamma");
        vm.stopBroadcast();

        vm.startBroadcast(1004);
        core.registerAgent("TestAgent_Delta");
        vm.stopBroadcast();

        // Create tournament (as arena agent)
        vm.startBroadcast(deployerKey);

        bytes32 paramsHash = keccak256(abi.encodePacked("seed_tournament_v1"));
        uint256 tournamentId = core.createTournament(
            "Seed Tournament",
            ArenaCore.GameType.StrategyArena,
            ArenaCore.TournamentFormat.SwissSystem,
            entryStake,
            4,
            3,
            paramsHash
        );

        console.log("Created tournament ID:", tournamentId);

        vm.stopBroadcast();

        // Join tournament as each agent
        vm.startBroadcast(1001);
        core.joinTournament{value: entryStake}(tournamentId);
        vm.stopBroadcast();

        vm.startBroadcast(1002);
        core.joinTournament{value: entryStake}(tournamentId);
        vm.stopBroadcast();

        vm.startBroadcast(1003);
        core.joinTournament{value: entryStake}(tournamentId);
        vm.stopBroadcast();

        vm.startBroadcast(1004);
        core.joinTournament{value: entryStake}(tournamentId);
        vm.stopBroadcast();

        console.log("All 4 agents joined tournament");
        console.log("Seed tournament ready to start");
    }
}
