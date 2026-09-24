import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraphQLIndexer } from '../indexer.js';

describe('GraphQLIndexer APQ', () => {
  const endpoint = 'https://indexer.example/graphql';
  let indexer: GraphQLIndexer;

  beforeEach(() => {
    indexer = new GraphQLIndexer(endpoint);
  });

  afterEach(() => {
    indexer.cleanup();
  });

  it('sends a persisted query hash on the first request when persist is enabled', async () => {
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { streamCount: 5 } }),
    });

    // Expose the private executeGraphQLRequest by calling query and stubbing fetch globally.
    globalThis.fetch = fetchFn as unknown as typeof fetch;
    const result = await indexer.query({ query: 'query { streamCount }' });

    expect(result).toEqual({ streamCount: 5 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchFn.mock.calls[0]![1].body);
    expect(body.query).toBeNull();
    expect(body.extensions).toMatchObject({
      persistedQuery: { version: 1, sha256Hash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
  });

  it('falls back to the full query when the server reports PERSISTED_QUERY_NOT_FOUND', async () => {
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{ message: 'PERSISTED_QUERY_NOT_FOUND' }],
      }),
    });
    fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { streamCount: 3 } }),
    });

    globalThis.fetch = fetchFn as unknown as typeof fetch;
    const result = await indexer.query({ query: 'query { streamCount }' });

    expect(result).toEqual({ streamCount: 3 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(fetchFn.mock.calls[1]![1].body);
    expect(fallbackBody.query).toBe('query { streamCount }');
    expect(fallbackBody.extensions).toBeDefined();
  });

  it('skips APQ when persist is false', async () => {
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { streamCount: 1 } }),
    });

    globalThis.fetch = fetchFn as unknown as typeof fetch;
    await indexer.query({ query: 'query { streamCount }', persist: false });

    const body = JSON.parse(fetchFn.mock.calls[0]![1].body);
    expect(body.query).toBe('query { streamCount }');
    expect(body.extensions).toBeUndefined();
  });
});
