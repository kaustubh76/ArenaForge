import * as dotenv from "dotenv";
dotenv.config();

import { getAgentAddress } from "./monad/rpc";

const VERIFY_ENDPOINT =
  process.env.MOLTBOOK_VERIFY_URL || "https://agents.devnads.com/v1/verify";

interface VerifyResponse {
  success: boolean;
  message: string;
  agentId?: string;
}

async function verifyAgent(): Promise<void> {
  const agentAddress = getAgentAddress();
  const handle = process.env.MOLTBOOK_AGENT_HANDLE || "ArenaForge";
  const bearerToken = process.env.MOLTBOOK_BEARER_TOKEN;

  if (!bearerToken) {
    console.error("MOLTBOOK_BEARER_TOKEN is required for verification");
    process.exit(1);
  }

  console.log(`Verifying agent: ${handle} (${agentAddress})`);

  try {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        agentAddress,
        handle,
        chain: "monad",
        capabilities: [
          "tournament_management",
          "game_oracle_duel",
          "game_strategy_arena",
          "game_auction_wars",
          "game_quiz_bowl",
          "evolution_engine",
          "moltbook_publishing",
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Verification failed: HTTP ${response.status}`);
      console.error(errorText);
      process.exit(1);
    }

    const result = await response.json() as VerifyResponse;

    if (result.success) {
      console.log("Verification successful!");
      console.log(`Agent ID: ${result.agentId}`);
      console.log(`Message: ${result.message}`);
    } else {
      console.error(`Verification rejected: ${result.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Verification request failed:", error);
    process.exit(1);
  }
}

verifyAgent().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
