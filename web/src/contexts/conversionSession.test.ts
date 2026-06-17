import { describe, expect, it } from 'vitest'
import { getArtifactLayoutClassName, toArchiveBaseName } from './conversionSession'
import type { ArtifactView } from '../agents/appAgents'
import { getDefaultConfig } from '../lib/defaults'
import { shouldShowWorkshopMemoryMemo } from '../lib/sourceAdvisories'
import {
  appendMemoryDebugEvent,
  createEmptyMemoryDebugSession,
  createMemoryDebugEvent,
  MEMORY_DEBUG_HISTORY_LIMIT,
} from '../lib/memoryDebug'

function artifactView(name: string): ArtifactView {
  return {
    artifact: {
      name,
      blob: new Blob(),
      sizeKb: 1,
      width: 1,
      height: 1,
      status: 'original',
      finalFps: 1,
      finalQuality: 100,
    },
    url: `blob:${name}`,
  }
}

describe('conversion session helpers', () => {
  it('derives archive base names from source files', () => {
    expect(toArchiveBaseName('clip.mp4')).toBe('clip')
    expect(toArchiveBaseName('archive.final.webm')).toBe('archive.final')
    expect(toArchiveBaseName(' no-extension ')).toBe('no-extension')
    expect(toArchiveBaseName('   ')).toBe('steam-artwork-output')
  })

  it('recognizes workshop and showcase strip result layouts', () => {
    expect(
      getArtifactLayoutClassName([
        artifactView('demo_part_01.gif'),
        artifactView('demo_part_02.gif'),
        artifactView('demo_part_03.gif'),
        artifactView('demo_part_04.gif'),
        artifactView('demo_part_05.gif'),
      ]),
    ).toEqual({
      isCompactStrip: true,
      resultsGridClassName: 'results-grid workshop-strip',
    })

    expect(
      getArtifactLayoutClassName([
        artifactView('demo_part_01.gif'),
        artifactView('demo_part_02.gif'),
      ]),
    ).toEqual({
      isCompactStrip: true,
      resultsGridClassName: 'results-grid showcase-strip',
    })
  })

  it('recognizes multi-row workshop result grids', () => {
    expect(
      getArtifactLayoutClassName([
        artifactView('demo_row_01_part_01.gif'),
        artifactView('demo_row_01_part_02.gif'),
        artifactView('demo_row_02_part_01.gif'),
        artifactView('demo_row_02_part_02.gif'),
      ]),
    ).toEqual({
      isCompactStrip: true,
      resultsGridClassName: 'results-grid workshop-grid',
    })
  })

  it('falls back to the regular result grid for non-strip outputs', () => {
    expect(getArtifactLayoutClassName([artifactView('demo_featured.gif')])).toEqual({
      isCompactStrip: false,
      resultsGridClassName: 'results-grid',
    })
  })

  it('shows memory guidance only after Workshop is set to 3 rows', () => {
    expect(shouldShowWorkshopMemoryMemo(getDefaultConfig('workshop'))).toBe(false)
    expect(shouldShowWorkshopMemoryMemo({ ...getDefaultConfig('workshop'), workshopRows: 3 })).toBe(true)
  })

  it('keeps memory debug event history bounded for session state', () => {
    let session = createEmptyMemoryDebugSession()
    for (let index = 0; index < MEMORY_DEBUG_HISTORY_LIMIT + 2; index += 1) {
      session = appendMemoryDebugEvent(session, createMemoryDebugEvent({
        bucket: 'worker-payload-copy',
        label: `payload ${index}`,
        bytes: index,
        kind: 'estimate',
        stage: 'convert',
      }, 'main'))
    }

    expect(session.events).toHaveLength(MEMORY_DEBUG_HISTORY_LIMIT)
    expect(session.events[0].bytes).toBe(2)
  })
})
