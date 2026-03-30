<template>
  <div class="tool-group-container">
    <div class="tool-group-header" @click="expanded = !expanded">
      <WrenchIcon class="tool-group-icon" />
      <span class="tool-group-text">{{ t('message.toolGroup.summary', { count: toolCalls.length }) }}</span>
      <span v-if="runningCount > 0" class="tool-group-running-count">
        {{ runningCount }}
        <SpinningIcon :icon="LoaderCircleIcon" :spinning="true" size="sm" />
        </span>
      <ChevronDownIcon v-else-if="!expanded" class="tool-group-chevron" />
      <ChevronRightIcon v-else class="tool-group-chevron" />
    </div>
    <div v-if="expanded" class="tool-group-body">
      <MessageItemToolBlock v-for="tc in toolCalls" :key="tc.id" :tool-call="tc" />
    </div>
  </div>
</template>

<script setup lang="ts">

import { ChevronDownIcon, ChevronRightIcon, LoaderCircleIcon, WrenchIcon } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { t } from '@services/i18n'
import { ToolCall } from 'types/index'
import MessageItemToolBlock from './MessageItemToolBlock.vue'
import SpinningIcon from './SpinningIcon.vue'

const props = defineProps({
  toolCalls: {
    type: Array as () => ToolCall[],
    required: true,
  },
})

const expanded = ref(false)

const runningCount = computed(() => {
  return props.toolCalls.filter(tc => !tc.done).length
})

</script>

<style scoped>

.tool-group-container {
  width: 100%;
  margin: 0 0 1rem 0;
  background-color: var(--tool-bg-color);
  border: 1px solid var(--tool-border-color);
  border-radius: 8px;
  cursor: pointer;

  .tool-group-header {
    display: flex;
    padding: 0.5rem 1rem;
    align-items: center;
    gap: 0.5rem;
    color: var(--dimmed-text-color);
    font-weight: var(--font-weight-medium);
    font-size: 0.9em;

    .tool-group-text {
      flex: 1;
    }

    .tool-group-running-count {
      margin-left: auto;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--color-on-surface-variant);
    }
  }

  .tool-group-body {
    padding: 0.5rem 1.125rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    &:deep() {
      .tool-container {
        background-color: color-mix(in srgb, var(--tool-bg-color) 50%, var(--color-surface-lowest));
        margin-bottom: 0;
      }
    }
  }


}

</style>
