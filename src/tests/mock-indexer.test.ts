import { describe, it, expect, afterEach } from 'vitest'
import { createMockIndexer } from '../mock-indexer.js'

afterEach(() => {
  // Ensure fetch is restored even if destroy wasn't called
})

describe('createMockIndexer (#607)', () => {
  it('returns canned data for a matching query name', async () => {
    const indexer = createMockIndexer({
      responses: {
        GetStreams: { data: { streams: [{ id: '1', amount: '100' }] } },
      },
    })

    const result = await indexer.query<{ streams: Array<{ id: string }> }>({
      query: 'query GetStreams { streams { id } }',
    })

    expect(result.streams).toHaveLength(1)
    expect(result.streams[0]!.id).toBe('1')
    indexer.destroy()
  })

  it('returns default response when no query name matches', async () => {
    const indexer = createMockIndexer({
      responses: { GetStreams: { data: { streams: [] } } },
      defaultResponse: { data: { unknown: true } },
    })

    const result = await indexer.query<{ unknown?: boolean }>({
      query: 'query GetSomethingElse { things { id } }',
    })

    expect(result.unknown).toBe(true)
    indexer.destroy()
  })

  it('throws on GraphQL errors in the mock response', async () => {
    const indexer = createMockIndexer({
      responses: {
        FailingQuery: {
          errors: [{ message: 'Field "nonexistent" not found' }],
        },
      },
    })

    await expect(
      indexer.query({ query: 'query FailingQuery { nonexistent }' }),
    ).rejects.toThrow(/Field.*not found/)
    indexer.destroy()
  })

  it('simulates latency when configured', async () => {
    const indexer = createMockIndexer({
      responses: { Slow: { data: { ok: true } } },
      latencyMs: 50,
    })

    const start = Date.now()
    await indexer.query({ query: 'query Slow { ok }' })
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(40) // allow some jitter
    indexer.destroy()
  })

  it('restores global fetch on destroy', () => {
    const originalFetch = globalThis.fetch
    const indexer = createMockIndexer({ responses: {} })

    expect(globalThis.fetch).not.toBe(originalFetch)

    indexer.destroy()

    expect(globalThis.fetch).toBe(originalFetch)
  })
})
