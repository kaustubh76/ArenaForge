// Apollo Client setup for GraphQL

import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  split,
  type NormalizedCacheObject,
} from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { getMainDefinition } from "@apollo/client/utilities";
import { createClient } from "graphql-ws";

const GRAPHQL_HTTP_URL = import.meta.env.VITE_GRAPHQL_URL || "http://localhost:4000/graphql";
const GRAPHQL_WS_URL = import.meta.env.VITE_GRAPHQL_WS_URL || "ws://localhost:4000/graphql";

// HTTP link for queries and mutations
const httpLink = new HttpLink({
  uri: GRAPHQL_HTTP_URL,
});

// WebSocket link for subscriptions
const wsLink = new GraphQLWsLink(
  createClient({
    url: GRAPHQL_WS_URL,
    retryAttempts: 5,
    connectionParams: () => {
      // Add authentication if needed
      return {};
    },
  })
);

// Split link based on operation type
const splitLink = split(
  ({ query }: { query: Parameters<typeof getMainDefinition>[0] }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === "OperationDefinition" &&
      definition.operation === "subscription"
    );
  },
  wsLink,
  httpLink
);

// Create Apollo Client
export const apolloClient: ApolloClient<NormalizedCacheObject> = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          tournaments: {
            // Merge paginated results
            keyArgs: ["status", "gameType", "format"],
            merge(existing: unknown[] = [], incoming: unknown[]) {
              return [...existing, ...incoming];
            },
          },
          matches: {
            keyArgs: ["tournamentId", "status"],
            merge(existing: unknown[] = [], incoming: unknown[]) {
              return [...existing, ...incoming];
            },
          },
        },
      },
      Tournament: {
        keyFields: ["id"],
      },
      Match: {
        keyFields: ["id"],
      },
      Agent: {
        keyFields: ["address"],
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: "cache-and-network",
      nextFetchPolicy: "cache-first",
    },
    query: {
      fetchPolicy: "cache-first",
    },
  },
});

// Helper to reset cache (useful for logout, etc.)
export function resetApolloCache(): void {
  apolloClient.resetStore();
}

// Export for use with ApolloProvider
export default apolloClient;
