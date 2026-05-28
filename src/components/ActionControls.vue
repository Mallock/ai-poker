<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  legalActions: {
    type: Object,
    default: () => ({
      canFold: false,
      canCheck: false,
      canCall: false,
      callAmount: 0,
      canRaise: false,
      minRaise: 0,
      maxRaise: 0,
      canAllIn: false,
      allInAmount: 0,
    }),
  },
  disabled: { type: Boolean, default: false },
  // 'no-limit' (default) renders the slider/number raise control; 'fixed-limit' renders a
  // single fixed-amount button.
  limitStructure: { type: String, default: 'no-limit' },
})

const isFixedLimit = computed(() => props.limitStructure === 'fixed-limit')
const emit = defineEmits(['action'])

const raiseAmount = ref(props.legalActions.minRaise || 0)

watch(
  () => props.legalActions,
  (la) => { raiseAmount.value = la.minRaise || 0 },
  { deep: true },
)

const sliderMin = computed(() => props.legalActions.minRaise || 0)
const sliderMax = computed(() => props.legalActions.maxRaise || 0)
const sliderRange = computed(() => Math.max(1, sliderMax.value - sliderMin.value))

// Optional table-talk line bundled with the next action. Cleared after each submit.
const sayText = ref('')

function submit(action, amount = 0) {
  if (props.disabled) return
  const say = sayText.value.trim()
  emit('action', say ? { action, amount, say } : { action, amount })
  sayText.value = ''
}

function pctRaise(p) {
  const v = Math.round(sliderMin.value + sliderRange.value * p)
  raiseAmount.value = Math.min(sliderMax.value, Math.max(sliderMin.value, v))
}
</script>

<template>
  <div
    :class="[
      'control-panel flex flex-wrap items-center gap-2.5 rounded-xl px-4 py-3 transition-opacity',
      disabled ? 'opacity-50' : '',
    ]"
  >
    <button
      class="btn btn-fold"
      :disabled="disabled || !legalActions.canFold"
      @click="submit('fold')"
    >Fold</button>

    <button
      class="btn btn-check"
      :disabled="disabled || !legalActions.canCheck"
      @click="submit('check')"
    >Check</button>

    <button
      class="btn btn-call"
      :disabled="disabled || !legalActions.canCall"
      @click="submit('call', legalActions.callAmount)"
    >
      Call
      <span v-if="legalActions.canCall" class="num-tab ml-1.5 text-[11px] opacity-90">
        {{ legalActions.callAmount.toLocaleString() }}
      </span>
    </button>

    <button
      v-if="isFixedLimit"
      class="btn btn-raise"
      :disabled="disabled || !legalActions.canRaise"
      @click="submit('raise', legalActions.minRaise)"
    >
      Raise
      <span v-if="legalActions.canRaise" class="num-tab ml-1.5 text-[11px] opacity-90">
        to {{ legalActions.minRaise.toLocaleString() }}
      </span>
    </button>
    <div v-else class="flex items-center gap-2 rounded-md bg-[oklch(0.20_0.025_45/0.7)] px-3 py-1.5 ring-1 ring-[oklch(0.32_0.035_50/0.7)]">
      <div class="flex gap-1">
        <button class="chip-btn" :disabled="disabled || !legalActions.canRaise" @click="pctRaise(0.25)">¼</button>
        <button class="chip-btn" :disabled="disabled || !legalActions.canRaise" @click="pctRaise(0.5)">½</button>
        <button class="chip-btn" :disabled="disabled || !legalActions.canRaise" @click="pctRaise(1.0)">Max</button>
      </div>
      <input
        type="range"
        :min="sliderMin"
        :max="sliderMax"
        :step="Math.max(1, Math.floor(sliderRange / 20))"
        v-model.number="raiseAmount"
        :disabled="disabled || !legalActions.canRaise"
        class="brass-slider w-40"
      />
      <input
        type="number"
        v-model.number="raiseAmount"
        :min="sliderMin"
        :max="sliderMax"
        :disabled="disabled || !legalActions.canRaise"
        class="num-tab w-24 rounded bg-[oklch(0.14_0.02_45)] px-2 py-1 text-right font-display text-[14px] text-[oklch(0.84_0.08_82)] ring-1 ring-[oklch(0.30_0.03_50/0.7)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.68_0.11_78/0.7)]"
      />
      <button
        class="btn btn-raise"
        :disabled="disabled || !legalActions.canRaise || raiseAmount < sliderMin || raiseAmount > sliderMax"
        @click="submit('raise', raiseAmount)"
      >Raise</button>
    </div>

    <button
      v-if="!isFixedLimit"
      class="btn btn-allin"
      :disabled="disabled || !legalActions.canAllIn"
      @click="submit('all-in', legalActions.allInAmount)"
    >
      All-In
      <span v-if="legalActions.canAllIn" class="num-tab ml-1.5 text-[11px] opacity-90">
        {{ legalActions.allInAmount.toLocaleString() }}
      </span>
    </button>

    <input
      type="text"
      v-model="sayText"
      :disabled="disabled"
      maxlength="100"
      placeholder="Say something… (optional)"
      class="say-input ml-auto min-w-[12rem] flex-1 rounded-md border border-slate-700 bg-[oklch(0.14_0.02_45)] px-3 py-1.5 text-[13px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[oklch(0.68_0.11_78/0.7)] disabled:opacity-50"
    />
  </div>
</template>

<style scoped>
.control-panel {
  background:
    linear-gradient(180deg, oklch(0.20 0.030 40), oklch(0.14 0.020 35));
  box-shadow:
    inset 0 1px 0 oklch(0.55 0.04 60 / 0.35),
    inset 0 -1px 0 oklch(0 0 0 / 0.4),
    0 12px 24px oklch(0 0 0 / 0.45);
  border: 1px solid oklch(0.30 0.035 45 / 0.6);
}
.btn {
  font-family: 'Public Sans', sans-serif;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.04em;
  padding: 8px 16px;
  border-radius: 6px;
  transition: transform 120ms ease, filter 120ms ease;
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.20),
    inset 0 -1px 0 oklch(0 0 0 / 0.25),
    0 2px 6px oklch(0 0 0 / 0.4);
}
.btn:not(:disabled):hover { filter: brightness(1.10); }
.btn:not(:disabled):active { transform: translateY(1px); filter: brightness(0.95); }
.btn:disabled { cursor: not-allowed; filter: grayscale(0.6) brightness(0.7); }

.btn-fold {
  background: linear-gradient(180deg, oklch(0.42 0.14 25), oklch(0.32 0.12 25));
  color: oklch(0.96 0.02 25);
}
.btn-check {
  background: linear-gradient(180deg, oklch(0.34 0.025 50), oklch(0.24 0.020 45));
  color: oklch(0.92 0.015 80);
}
.btn-call {
  background: linear-gradient(180deg, oklch(0.45 0.10 150), oklch(0.32 0.08 150));
  color: oklch(0.96 0.02 150);
}
.btn-raise {
  background: linear-gradient(180deg, var(--brass-hi), var(--brass) 60%, var(--brass-mid));
  color: oklch(0.18 0.03 50);
  text-shadow: 0 1px 0 oklch(1 0 0 / 0.4);
}
.btn-allin {
  background: linear-gradient(180deg, oklch(0.36 0.16 25), oklch(0.22 0.12 25));
  color: oklch(0.95 0.02 25);
  text-shadow: 0 1px 0 oklch(0 0 0 / 0.45);
}

.chip-btn {
  font-family: 'Public Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  background: oklch(0.16 0.02 50);
  color: oklch(0.78 0.05 78);
  border: 1px solid oklch(0.30 0.03 50 / 0.6);
}
.chip-btn:not(:disabled):hover { background: oklch(0.22 0.03 50); color: oklch(0.86 0.06 78); }
.chip-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.brass-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: linear-gradient(90deg, var(--brass-mid), var(--brass-lo));
  border-radius: 4px;
  outline: none;
}
.brass-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--brass-hi), var(--brass-mid) 70%, var(--brass-lo));
  border: 1px solid oklch(0.30 0.05 65);
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.6);
  cursor: pointer;
}
.brass-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--brass-hi), var(--brass-mid) 70%, var(--brass-lo));
  border: 1px solid oklch(0.30 0.05 65);
  cursor: pointer;
}
.brass-slider:disabled { opacity: 0.5; }
</style>
