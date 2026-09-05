/**
 * Mock GraphQLIndexer transport for unit testing.
 *
 * #607: Consumers can't unit-test indexer-backed code without stubbing
 * global `fetch`. This provides an in-memory transport that returns
 * canned responses without any network calls.
 *
 * @example
 * import { createMockIndexer } from '@conduit-protocol/sdk';
 *
 * const indexer = createMockIndexer({
 *   responses: {
 *     'GetStreams': { streams: [{ id: '1', amount: '100' }] },
 *   },
 * });
 *
 * const data = await indexer.query<StreamList>({ query: 'GetStreams' });
 * // data.streams[0].id === '1'
 */

import { GraphQLIndexer } from './indexer.js'

export interface MockResponse {
  /** The data to return from query(). Matches body.data in a real GraphQL response. */
  data?: unknown
  /** Optional GraphQL errors to simulate. */
  errors?: Array<{ message: string }>
  /** HTTP status code for the response. Default 200. */
  status?: number
}

export interface MockIndexerConfig {
  /**
   * Map of query-name-prefix to response. The mock matches the beginning
   * of the query string to find the right entry. If no match is found,
   * a default response (empty data) is returned.
   */
  responses?: Record<string, MockResponse>
  /** Default response when no match is found. */
  defaultResponse?: MockResponse
  /** Simulated network latency in ms. Default 0. */
  latencyMs?: number
}

/**
 * Creates a GraphQLIndexer backed by an in-memory transport.
 * No network calls are made — responses come from the config map.
 *
 * The returned indexer is a standard GraphQLIndexer instance, so all
 * existing methods (query, subscribe, cleanup) work as expected.
 * Only `query()` is mocked; subscriptions still require a real transport.
 *
 * Call `cleanup()` on the returned indexer to restore the original `fetch`.
 */
export function createMockIndexer(config: MockIndexerConfig = {}): GraphQLIndexer {
  const { responses = {}, defaultResponse = { data: null }, latencyMs = 0 } = config

  const originalFetch = globalThis.fetch

  const mockFetch = async (_endpoint: string | URL | Request, init?: RequestInit) => {
    if (latencyMs > 0) {
      await new Promise(r => setTimeout(r, latencyMs))
    }

    const body = init?.body ? JSON.parse(init.body as string) : {}
    const queryStr: string = body.query ?? ''
    const queryName = queryStr.match(/\b(?:query|mutation)\s+(\w+)/)?.[1] ?? queryStr.trim().split(/\s|\(/)[0] ?? ''

    const matchKey = Object.keys(responses).find(key => queryName.startsWith(key) || queryStr.includes(key))
    const response = matchKey ? responses[matchKey]! : defaultResponse

    return {
      ok: (response.status ?? 200) < 400,
      status: response.status ?? 200,
      statusText: (response.status ?? 200) < 400 ? 'OK' : 'Error',
      json: async () => ({ data: response.data, errors: response.errors }),
      text: async () => JSON.stringify({ data: response.data, errors: response.errors }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as Response
  }

  globalThis.fetch = mockFetch as typeof globalThis.fetch

  const indexer = new GraphQLIndexer('mock://indexer')

  // Wrap cleanup to restore the original fetch
  const originalCleanup = indexer.cleanup.bind(indexer)
  indexer.cleanup = () => {
    globalThis.fetch = originalFetch
    originalCleanup()
  }

  return indexer
}
