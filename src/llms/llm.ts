
import { Configuration } from '../types/config'
import { type ILlmManager } from '../types/llm'
import LlmManager from './witsy_mgr'

export const favoriteMockEngine = '__favorites__'

export { ILlmManager }

export default class LlmFactory {

  static manager(config: Configuration) {
    return new LlmManager(config)
  }

}
