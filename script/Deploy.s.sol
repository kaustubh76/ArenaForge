// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ArenaCore.sol";
import "../src/WagerEscrow.sol";
import "../src/MatchRegistry.sol";
import "../src/game-modes/OracleDuel.sol";
import "../src/game-modes/StrategyArena.sol";
import "../src/game-modes/AuctionWars.sol";
import "../src/game-modes/QuizBowl.sol";
import "../src/SeasonalRankings.sol";
import "../src/SpectatorBetting.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ARENA_AGENT_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy WagerEscrow
        WagerEscrow escrow = new WagerEscrow(deployer);
        console.log("WagerEscrow:", address(escrow));

        // 2. Deploy MatchRegistry
        MatchRegistry registry = new MatchRegistry(deployer);
        console.log("MatchRegistry:", address(registry));

        // 3. Deploy ArenaCore
        ArenaCore core = new ArenaCore(deployer, address(escrow), address(registry));
        console.log("ArenaCore:", address(core));

        // 4. Deploy Game Mode Contracts
        OracleDuel oracleDuel = new OracleDuel(deployer);
        console.log("OracleDuel:", address(oracleDuel));

        StrategyArena strategyArena = new StrategyArena(deployer);
        console.log("StrategyArena:", address(strategyArena));

        AuctionWars auctionWars = new AuctionWars(deployer);
        console.log("AuctionWars:", address(auctionWars));

        QuizBowl quizBowl = new QuizBowl(deployer);
        console.log("QuizBowl:", address(quizBowl));

        // 5. Configure permissions
        escrow.setAuthorizedCaller(address(core));
        registry.setAuthorizedCaller(address(core));
        console.log("Permissions configured");

        // 6. Register game modes
        core.registerGameMode(0, address(oracleDuel));
        core.registerGameMode(1, address(strategyArena));
        core.registerGameMode(2, address(auctionWars));
        core.registerGameMode(3, address(quizBowl));
        console.log("Game modes registered");

        // 7. Deploy Phase 2 contracts
        SeasonalRankings rankings = new SeasonalRankings(deployer, address(core));
        console.log("SeasonalRankings:", address(rankings));

        SpectatorBetting betting = new SpectatorBetting(deployer, address(core), address(registry));
        console.log("SpectatorBetting:", address(betting));

        vm.stopBroadcast();

        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("ArenaCore:        ", address(core));
        console.log("WagerEscrow:      ", address(escrow));
        console.log("MatchRegistry:    ", address(registry));
        console.log("OracleDuel:       ", address(oracleDuel));
        console.log("StrategyArena:    ", address(strategyArena));
        console.log("AuctionWars:      ", address(auctionWars));
        console.log("QuizBowl:         ", address(quizBowl));
        console.log("SeasonalRankings: ", address(rankings));
        console.log("SpectatorBetting: ", address(betting));
    }
}
