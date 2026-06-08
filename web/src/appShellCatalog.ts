import type { TabKey } from './agents/appAgents'
import type { MessageId } from './i18n/messages'

export interface TabDetail {
  label: MessageId
  eyebrow: MessageId
  summary: MessageId
  points: MessageId[]
}

export const TAB_DETAILS: Record<TabKey, TabDetail> = {
  convert: {
    label: 'app.nav.convert',
    eyebrow: 'app.tabs.convert.eyebrow',
    summary: 'app.tabs.convert.summary',
    points: [
      'app.tabs.convert.point1',
      'app.tabs.convert.point2',
      'app.tabs.convert.point3',
    ],
  },
  patch: {
    label: 'app.nav.patch',
    eyebrow: 'app.tabs.patch.eyebrow',
    summary: 'app.tabs.patch.summary',
    points: [
      'app.tabs.patch.point1',
      'app.tabs.patch.point2',
      'app.tabs.patch.point3',
    ],
  },
  steam: {
    label: 'app.nav.steam',
    eyebrow: 'app.tabs.steam.eyebrow',
    summary: 'app.tabs.steam.summary',
    points: [
      'app.tabs.steam.point1',
      'app.tabs.steam.point2',
      'app.tabs.steam.point3',
    ],
  },
  guides: {
    label: 'app.nav.guides',
    eyebrow: 'app.tabs.guides.eyebrow',
    summary: 'app.tabs.guides.summary',
    points: [
      'app.tabs.guides.point1',
      'app.tabs.guides.point2',
      'app.tabs.guides.point3',
    ],
  },
}
