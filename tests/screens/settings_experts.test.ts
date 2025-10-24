
import { vi, beforeAll, beforeEach, afterAll, expect, test, Mock } from 'vitest'
import { mount, VueWrapper, enableAutoUnmount } from '@vue/test-utils'
import { ChatModel } from 'multi-llm-ts'
import { useWindowMock } from '../mocks/window'
import { createI18nMock } from '../mocks'
import { stubTeleport } from '../mocks/stubs'
import { store } from '../../src/services/store'
import { switchToTab, tabs } from './settings_utils'
import Settings from '../../src/screens/Settings.vue'
import Dialog from '../../src/composables/dialog'

enableAutoUnmount(afterAll)

HTMLDialogElement.prototype.showModal = vi.fn()
HTMLDialogElement.prototype.close = vi.fn()

vi.mock('../../src/services/i18n', async () => {
  return createI18nMock()
})

vi.mock('../../src/services/store.ts', async (importOriginal) => {
  const expertsData = await import('../../defaults/experts.json')
  const mod: any = await importOriginal()
  return {
    clone: mod.clone,
    store: {
      ...mod.store,
      experts: (expertsData.default as any).experts || expertsData.default,
      expertCategories: (expertsData.default as any).categories || [],
      saveSettings: vi.fn()
    }
  }
})

let wrapper: VueWrapper<any>
const expertsIndex = tabs.indexOf('settingsExperts')

beforeAll(() => {

  useWindowMock()
  store.loadSettings()
  store.load = () => {}

  // override
  store.experts[0].id = 'uuid1'
  store.config.engines.openai = {
    models: {
      chat: [ { id: 'chat1', name: 'chat1'} as ChatModel, { id: 'chat2', name: 'chat2' } as ChatModel ]
    },
    model: {
      chat: 'chat1'
    }
  }
  window.api.config.localeLLM = () => store.config.llm.locale || 'en-US'
    
  // wrapper
  wrapper = mount(Settings, { ...stubTeleport })
})

beforeEach(() => {
  vi.clearAllMocks()
})

test('Renders', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  expect(tab.findAll('.sticky-table-container')).toHaveLength(1)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(165)
  expect(tab.findAll('.sticky-table-container tr.expert button')).toHaveLength(330) // 2 buttons per expert: up, down (pin removed)

})

test('Disable items', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  expect(store.experts[0].state).toBe('enabled')
  await tab.find('.sticky-table-container tr.expert:nth-of-type(1) input[type=checkbox]').trigger('click')
  expect(store.experts[0].state).toBe('disabled')
  await tab.find('.sticky-table-container tr.expert:nth-of-type(1) input[type=checkbox]').trigger('click')
  expect(store.experts[0].state).toBe('enabled')

})

test('Move items', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const allExperts = tab.findAll('.sticky-table-container tr.expert')
  const first = allExperts.at(0).attributes('data-id')
  const second = allExperts.at(1).attributes('data-id')

  // Click up button on second item (button index 1: 0=down, 1=up - pin removed)
  await allExperts.at(1).findAll('button').at(1).trigger('click')

  const afterMoveUp = tab.findAll('.sticky-table-container tr.expert')
  expect(afterMoveUp.at(0).attributes('data-id')).toBe(second)
  expect(afterMoveUp.at(1).attributes('data-id')).toBe(first)

  // Click down button on first item (button index 0: 0=down, 1=up)
  await afterMoveUp.at(0).findAll('button').at(0).trigger('click')

  const afterMoveDown = tab.findAll('.sticky-table-container tr.expert')
  expect(afterMoveDown.at(0).attributes('data-id')).toBe(first)
  expect(afterMoveDown.at(1).attributes('data-id')).toBe(second)

})

test('New expert with default engine and model', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const editor = tab.findComponent({ name: 'ExpertEditor' })
  await tab.find('.list-actions .list-action.new').trigger('click')

  // for test stability
  tab.vm.selected = null

  // new command creates
  expect(store.experts).toHaveLength(165)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(165)
  await editor.find('[name=name]').setValue('expert')
  await editor.find('[name=prompt]').setValue('prompt')
  await editor.find('button.default').trigger('click')

  // check
  expect(store.experts).toHaveLength(166)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(166)
  expect(store.experts[165]).toMatchObject({
    id: expect.any(String),
    type: 'user',
    name: 'expert',
    prompt: 'prompt',
    triggerApps: [],
    state: 'enabled'
  })
})

test('New expert with engine and model', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const editor = tab.findComponent({ name: 'ExpertEditor' })
  await tab.find('.list-actions .list-action.new').trigger('click')

  // for test stability
  tab.vm.selected = null

  // new command creates
  expect(store.experts).toHaveLength(166)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(166)
  await editor.find('[name=name]').setValue('expert')
  await editor.find('[name=prompt]').setValue('prompt2')
  await editor.find('[name=engine]').setValue('openai')
  // await editor.find('input#model').setValue('chat1')
  await editor.find('button.default').trigger('click')

  // check
  expect(store.experts).toHaveLength(167)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(167)
  expect(store.experts[166]).toMatchObject({
    id: expect.any(String),
    type: 'user',
    name: 'expert',
    prompt: 'prompt2',
    engine: 'openai',
    model: 'chat1',
    triggerApps: [],
    state: 'enabled'
  })

  // remove this one
  store.experts.pop()

})

test('Edit user prompt', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const editor = tab.findComponent({ name: 'ExpertEditor' })
  const lastExpertRow = tab.findAll('.sticky-table-container tr.expert').at(-1)
  await lastExpertRow.trigger('dblclick')

  expect(editor.find<HTMLInputElement>('[name=name]').element.value).toBe('expert')
  expect(editor.find<HTMLTextAreaElement>('[name=prompt]').element.value).toBe('prompt')

  await editor.find('[name=name]').setValue('')
  await editor.find('[name=prompt]').setValue('prompt2')
  await editor.find('button.default').trigger('click')

  expect((Dialog.alert as Mock).mock.calls[0][0]).toBe('experts.editor.validation.requiredFields')

  await editor.find('[name=name]').setValue('expert2')
  await editor.find('button.default').trigger('click')

  // check
  expect(store.experts).toHaveLength(166)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(166)
  expect(store.experts[165]).toMatchObject({
    id: expect.any(String),
    type: 'user',
    name: 'expert2',
    prompt: 'prompt2',
    triggerApps: [],
    state: 'enabled'
  })
})

test('Edit system prompt', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const editor = tab.findComponent({ name: 'ExpertEditor' })
  const firstExpertRow = tab.findAll('.sticky-table-container tr.expert').at(0)
  await firstExpertRow.trigger('dblclick')

  // @ts-expect-error backwards compatibility check
  expect(store.experts[0].label).toBeUndefined()
  // @ts-expect-error backwards compatibility check
  expect(store.experts[0].template).toBeUndefined()

  expect(editor.find<HTMLInputElement>('[name=name]').element.value).toBe('expert_uuid1_name')
  expect(editor.find<HTMLTextAreaElement>('[name=prompt]').element.value).toBe('expert_uuid1_prompt')
  expect(editor.find<HTMLAnchorElement>('[name=reset]').exists()).toBe(true)

  await editor.find('[name=name]').setValue('expert')
  await editor.find('[name=prompt]').setValue('prompt')
  await editor.find('[name=name]').trigger('keyup')
  expect(editor.find<HTMLAnchorElement>('[name=reset]').exists()).toBe(true)

  await editor.find('button.default').trigger('click')

  expect(store.experts).toHaveLength(166)
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(166)
  expect(store.experts[0]).toMatchObject({
    id: 'uuid1',
    type: 'system',
    name: 'expert',
    prompt: 'prompt',
  })

  await tab.find('.sticky-table-container tr.expert:nth-of-type(1)').trigger('dblclick')

  expect(editor.find<HTMLInputElement>('[name=name]').element.value).toBe('expert')
  expect(editor.find<HTMLTextAreaElement>('[name=prompt]').element.value).toBe('prompt')
  expect(editor.find<HTMLAnchorElement>('[name=reset]').exists()).toBe(true)

  await editor.find('[name=reset]').trigger('click')
  await editor.vm.$nextTick()
  expect(editor.find<HTMLInputElement>('[name=name]').element.value).toBe('expert_default_uuid1_name')
  expect(editor.find<HTMLTextAreaElement>('[name=prompt]').element.value).toBe('expert_default_uuid1_prompt')
  expect(editor.find<HTMLAnchorElement>('[name=reset]').exists()).toBe(false)

  await editor.find('button.default').trigger('click')
  expect(store.experts[0].name).toBeUndefined()
  expect(store.experts[0].prompt).toBeUndefined()

})

test('Delete prompt', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const lastExpertRow = tab.findAll('.sticky-table-container tr.expert').at(-1)
  await lastExpertRow.trigger('click')
  await tab.find('.list-actions .list-action.delete').trigger('click')
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(165)
  expect(store.experts).toHaveLength(165)

})

test('Copy prompt', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  const firstExpert = tab.findAll('.sticky-table-container tr.expert').at(0)
  await firstExpert.trigger('click')
  await tab.find('.list-actions .list-action.copy').trigger('click')
  expect(tab.findAll('.sticky-table-container tr.expert')).toHaveLength(166)
  expect(store.experts).toHaveLength(166)
  expect(store.experts[1]).toMatchObject({
    id: expect.any(String),
    type: 'user',
    name: 'expert_uuid1_name (settings.experts.copy)',
    prompt: 'expert_uuid1_prompt',
    state: 'enabled',
    triggerApps: []
  })

})

test('Context Menu', async () => {

  const tab = await switchToTab(wrapper, expertsIndex)
  expect(tab.findAll('.context-menu')).toHaveLength(0)
  await tab.find('.list-actions .list-action.menu .trigger').trigger('click')
  await tab.vm.$nextTick()
  expect(tab.findAll('.context-menu')).toHaveLength(1)

})
