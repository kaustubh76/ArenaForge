// Deterministic 0x-addresses for stable seeding across tests.
// Each address is `0x` + a single hex byte repeated 20 times so they sort
// predictably and never collide with real on-chain addresses.

export const agentAddresses = [
  "0x" + "01".repeat(20), // 0
  "0x" + "02".repeat(20), // 1
  "0x" + "03".repeat(20), // 2
  "0x" + "04".repeat(20), // 3
  "0x" + "05".repeat(20), // 4
  "0x" + "06".repeat(20), // 5
  "0x" + "07".repeat(20), // 6
  "0x" + "08".repeat(20), // 7
] as const;

export const handles = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
] as const;
