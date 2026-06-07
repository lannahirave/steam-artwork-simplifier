import { GUIDE_SECTIONS, type TabKey } from './agents/appAgents'
import type { MessageId } from './i18n/messages'
import { MAX_SAFE_WASM_WORKERS } from './lib/presetPlan'

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

export const STUDIO_SIGNALS = [
  {
    value: 'app.signals.browser.value',
    label: 'app.signals.browser.label',
  },
  {
    value: 'app.signals.workers.value',
    label: 'app.signals.workers.label',
    values: { count: MAX_SAFE_WASM_WORKERS },
  },
  {
    value: 'app.signals.guides.value',
    label: 'app.signals.guides.label',
    values: { count: GUIDE_SECTIONS.length },
  },
] satisfies Array<{
  value: MessageId
  label: MessageId
  values?: Record<string, number>
}>

export const QUICK_FACTS = [
  {
    title: 'app.quickFacts.purpose.title',
    body: 'app.quickFacts.purpose.body',
  },
  {
    title: 'app.quickFacts.workspace.title',
    body: 'app.quickFacts.workspace.body',
  },
] satisfies Array<{
  title: MessageId
  body: MessageId
}>
