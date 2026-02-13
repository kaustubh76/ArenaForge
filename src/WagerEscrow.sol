// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract WagerEscrow {
    address public arenaAgent;
    address public authorizedCaller; // ArenaCore contract

    enum EscrowStatus {
        Deposited,
        Locked,
        Released,
        Refunded
    }

    struct EscrowEntry {
        uint256 tournamentId;
        address agent;
        uint256 amount;
        EscrowStatus status;
    }

    mapping(bytes32 => EscrowEntry) public escrows;
    mapping(uint256 => uint256) public tournamentPools;

    bool private _locked;

    event Deposited(uint256 indexed tournamentId, address indexed agent, uint256 amount);
    event Locked(uint256 indexed tournamentId, address indexed agent);
    event PrizeDistributed(uint256 indexed tournamentId, address indexed recipient, uint256 amount);
    event Refunded(uint256 indexed tournamentId, address indexed agent, uint256 amount);

    modifier onlyArenaAgent() {
        require(msg.sender == arenaAgent, "Only arena agent");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == authorizedCaller || msg.sender == arenaAgent, "Not authorized");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    constructor(address _arenaAgent) {
        arenaAgent = _arenaAgent;
    }

    function setAuthorizedCaller(address _caller) external onlyArenaAgent {
        authorizedCaller = _caller;
    }

    function deposit(uint256 tournamentId, address agent) external payable onlyAuthorized {
        require(msg.value > 0, "Zero deposit");
        bytes32 key = _escrowKey(tournamentId, agent);
        require(escrows[key].amount == 0, "Already deposited");

        escrows[key] = EscrowEntry({
            tournamentId: tournamentId,
            agent: agent,
            amount: msg.value,
            status: EscrowStatus.Deposited
        });
        tournamentPools[tournamentId] += msg.value;

        emit Deposited(tournamentId, agent, msg.value);
    }

    function lockForMatch(uint256 tournamentId, address agent1, address agent2) external onlyArenaAgent {
        _setStatus(tournamentId, agent1, EscrowStatus.Locked);
        _setStatus(tournamentId, agent2, EscrowStatus.Locked);

        emit Locked(tournamentId, agent1);
        emit Locked(tournamentId, agent2);
    }

    function distributePrize(
        uint256 tournamentId,
        address winner,
        uint256 prizeAmount
    ) external onlyArenaAgent nonReentrant {
        require(address(this).balance >= prizeAmount, "Insufficient balance");

        bytes32 key = _escrowKey(tournamentId, winner);
        escrows[key].status = EscrowStatus.Released;

        (bool success,) = winner.call{value: prizeAmount}("");
        require(success, "Transfer failed");

        emit PrizeDistributed(tournamentId, winner, prizeAmount);
    }

    function batchDistribute(
        uint256 tournamentId,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyArenaAgent nonReentrant {
        require(recipients.length == amounts.length, "Length mismatch");

        uint256 totalDistributed;
        for (uint256 i = 0; i < recipients.length; i++) {
            totalDistributed += amounts[i];
        }
        require(address(this).balance >= totalDistributed, "Insufficient balance");

        for (uint256 i = 0; i < recipients.length; i++) {
            bytes32 key = _escrowKey(tournamentId, recipients[i]);
            if (escrows[key].amount > 0) {
                escrows[key].status = EscrowStatus.Released;
            }

            (bool success,) = recipients[i].call{value: amounts[i]}("");
            require(success, "Transfer failed");

            emit PrizeDistributed(tournamentId, recipients[i], amounts[i]);
        }
    }

    function refund(uint256 tournamentId, address agent) external onlyArenaAgent nonReentrant {
        bytes32 key = _escrowKey(tournamentId, agent);
        EscrowEntry storage entry = escrows[key];
        require(entry.status == EscrowStatus.Deposited, "Cannot refund");
        require(entry.amount > 0, "No deposit");

        uint256 amount = entry.amount;
        entry.status = EscrowStatus.Refunded;
        tournamentPools[tournamentId] -= amount;

        (bool success,) = agent.call{value: amount}("");
        require(success, "Refund failed");

        emit Refunded(tournamentId, agent, amount);
    }

    function getEscrow(uint256 tournamentId, address agent) external view returns (EscrowEntry memory) {
        return escrows[_escrowKey(tournamentId, agent)];
    }

    function _setStatus(uint256 tournamentId, address agent, EscrowStatus status) internal {
        bytes32 key = _escrowKey(tournamentId, agent);
        require(escrows[key].amount > 0, "No escrow entry");
        escrows[key].status = status;
    }

    function _escrowKey(uint256 tournamentId, address agent) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(tournamentId, agent));
    }

    receive() external payable {}
}
