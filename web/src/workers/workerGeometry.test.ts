import { describe, expect, it } from 'vitest'
import { buildFeaturedGeometry, buildGuideGeometry, buildPartGeometry } from './workerGeometry'

const basePayload = {
  fileName: 'clip.mp4',
  fileBytes: new Uint8Array(),
  sourceCacheKey: 'test-source',
  isStillImage: false,
  srcWidth: 1200,
  srcHeight: 600,
  duration: 3,
  gifFps: 15,
  minGifFps: 10,
  disableOptimizations: false,
  maxGifKb: 5000,
  targetGifKb: 4500,
  optimizationMode: 'hybrid' as const,
  enableQualityRecovery: true,
  standardRetriesEnabled: false,
  retryAllowFpsDrop: true,
  retryAllowQualityDrop: true,
  lossyOversize: true,
  lossyLevel: 2,
  lossyMaxAttempts: 24,
  startOffsetSec: 0,
}

describe('worker geometry', () => {
  it('builds split part filters from explicit widths', () => {
    expect(
      buildPartGeometry({
        ...basePayload,
        partIndex: 1,
        parts: 2,
        partWidth: 150,
        splitWidths: [506, 100],
      }),
    ).toEqual({
      baseFilter: 'scale=606:303:flags=bicubic,crop=100:303:506:0',
      outputWidth: 100,
      targetHeight: 303,
    })
  })

  it('builds workshop grid filters from columns and row heights', () => {
    expect(
      buildPartGeometry({
        ...basePayload,
        partIndex: 7,
        parts: 15,
        partWidth: 150,
        splitWidths: [150, 150, 150, 150, 150],
        splitColumns: 5,
        splitRows: 3,
        splitRowHeights: [140, 125, 110],
      }),
    ).toEqual({
      baseFilter: 'scale=750:375:flags=bicubic,crop=150:125:300:140',
      outputWidth: 150,
      targetHeight: 125,
    })
  })

  it('builds single-output featured and guide filters', () => {
    expect(buildFeaturedGeometry({ ...basePayload, featuredWidth: 630 })).toEqual({
      baseFilter: 'scale=630:315:flags=bicubic',
      width: 630,
      height: 315,
    })

    expect(buildGuideGeometry({ ...basePayload, guideSize: 195 })).toEqual({
      baseFilter:
        'scale=195:195:flags=bicubic:force_original_aspect_ratio=increase,crop=195:195',
      width: 195,
      height: 195,
    })
  })
})
