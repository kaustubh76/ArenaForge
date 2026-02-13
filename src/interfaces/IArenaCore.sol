// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArenaCore {
    struct AgentProfile {
        address agentAddress;
        string moltbookHandle;
        string avatarURI;
        uint256 elo;
        uint256 matchesPlayed;
        uint256 wins;
        uint256 losses;
        int256 currentStreak;
        uint256 longestWinStreak;
        bool registered;
    }

    function getAgent(address agent) external view returns (AgentProfile memory);
}
