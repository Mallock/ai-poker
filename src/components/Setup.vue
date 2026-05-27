<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import characters, { pickRandomCharacters } from '../ai/characters.js'
import { probeLmStudio, EXPECTED_MODEL } from '../ai/lmStudio.js'
import PortraitPlaceholder from './PortraitPlaceholder.vue'

const portraitFailed = reactive({}) // id → true if image failed to load

const emit = defineEmits(['start'])

const sessionType = ref('poker') // 'poker' | 'uno'
const gameType = ref('holdem') // 'holdem' | 'stud' (poker-only)
const seatCount = ref(6)
const startingStack = ref(10000)
const handsPerLevel = ref(10)
const totalRounds = ref(7) // Uno-only
const pickedCharacterIds = ref([])
const lmStatus = ref({ checked: false, reachable: false, hasExpectedModel: false, error: null, models: [] })
const degradedMode = ref(false)

const maxSeats = computed(() => {
  if (sessionType.value === 'uno') return 8
  return gameType.value === 'stud' ? 8 : 10
})

// Clamp seat count down when switching to stud or Uno (both capped at 8).
watch(gameType, (next) => {
  if (sessionType.value === 'poker' && next === 'stud' && seatCount.value > 8) seatCount.value = 8
})
watch(sessionType, (next) => {
  if (next === 'uno' && seatCount.value > 8) seatCount.value = 8
})

const playStyleKey = computed(() => {
  if (sessionType.value === 'uno') return 'uno'
  return gameType.value
})

const aiSeatCount = computed(() => seatCount.value - 1)
const canStart = computed(() => aiSeatCount.value >= 1 && aiSeatCount.value <= maxSeats.value - 1)

function toggleCharacter(id) {
  const idx = pickedCharacterIds.value.indexOf(id)
  if (idx >= 0) {
    pickedCharacterIds.value.splice(idx, 1)
  } else if (pickedCharacterIds.value.length < aiSeatCount.value) {
    pickedCharacterIds.value.push(id)
  }
}

function buildSeats() {
  const seats = [{ id: 'human', name: 'You', isHuman: true, characterId: null }]
  const picked = pickedCharacterIds.value.slice(0, aiSeatCount.value)
  const remaining = aiSeatCount.value - picked.length
  const autoFilled = pickRandomCharacters(remaining, picked).map((c) => c.id)
  const finalIds = [...picked, ...autoFilled]
  finalIds.forEach((cid, i) => {
    const char = characters.find((c) => c.id === cid)
    seats.push({ id: `ai${i}`, name: char.name, isHuman: false, characterId: char.id })
  })
  return seats
}

function onStart() {
  if (sessionType.value === 'uno') {
    emit('start', {
      sessionType: 'uno',
      seats: buildSeats(),
      totalRounds: totalRounds.value,
      degradedMode: degradedMode.value || !lmStatus.value.hasExpectedModel,
    })
    return
  }
  emit('start', {
    sessionType: 'poker',
    seats: buildSeats(),
    startingStack: startingStack.value,
    handsPerLevel: handsPerLevel.value,
    gameType: gameType.value,
    limitStructure: gameType.value === 'stud' ? 'fixed-limit' : 'no-limit',
    degradedMode: degradedMode.value || !lmStatus.value.hasExpectedModel,
  })
}

async function recheckLm() {
  lmStatus.value = { ...lmStatus.value, checked: false }
  const result = await probeLmStudio()
  lmStatus.value = { ...result, checked: true }
}

onMounted(() => recheckLm())
</script>

<template>
  <div class="mx-auto flex h-full max-w-4xl flex-col gap-6 px-6 py-8">
    <h1 class="text-3xl font-semibold tracking-tight">{{ sessionType === 'uno' ? 'New match' : 'New tournament' }}</h1>

    <!-- Session type selector -->
    <div class="flex flex-col gap-2">
      <span class="text-sm text-slate-300">Session</span>
      <div class="flex gap-3">
        <label
          :class="[
            'flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition',
            sessionType === 'poker' ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-900',
          ]"
        >
          <input type="radio" value="poker" v-model="sessionType" class="accent-amber-500" />
          <span class="font-display text-[14px]">Poker</span>
        </label>
        <label
          :class="[
            'flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition',
            sessionType === 'uno' ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-900',
          ]"
        >
          <input type="radio" value="uno" v-model="sessionType" class="accent-amber-500" />
          <span class="font-display text-[14px]">Uno</span>
        </label>
      </div>
    </div>

    <!-- LM Studio status -->
    <div
      :class="[
        'flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm',
        !lmStatus.checked ? 'border-slate-700 bg-slate-800/60 text-slate-300'
          : lmStatus.hasExpectedModel ? 'border-emerald-500/40 bg-emerald-900/30 text-emerald-100'
          : lmStatus.reachable ? 'border-amber-500/40 bg-amber-900/30 text-amber-100'
          : 'border-rose-500/40 bg-rose-900/30 text-rose-100',
      ]"
    >
      <div class="flex items-center gap-3">
        <span class="inline-block h-3 w-3 rounded-full"
          :class="!lmStatus.checked ? 'bg-slate-400 animate-pulse'
            : lmStatus.hasExpectedModel ? 'bg-emerald-400'
            : lmStatus.reachable ? 'bg-amber-400'
            : 'bg-rose-400'"
        />
        <div>
          <div class="font-semibold">
            {{ !lmStatus.checked ? 'Probing LM Studio…'
              : lmStatus.hasExpectedModel ? `AI ready — ${EXPECTED_MODEL}`
              : lmStatus.reachable ? `LM Studio is up but the expected model isn't loaded.`
              : 'AI offline — start LM Studio at localhost:1234' }}
          </div>
          <div v-if="lmStatus.reachable && !lmStatus.hasExpectedModel && lmStatus.models?.length" class="text-xs opacity-80">
            Loaded: {{ lmStatus.models.join(', ') }}
          </div>
          <div v-if="!lmStatus.reachable && lmStatus.error" class="text-xs opacity-80">
            {{ lmStatus.error }}
          </div>
        </div>
      </div>
      <button class="rounded bg-slate-700 px-3 py-1.5 text-xs hover:bg-slate-600" @click="recheckLm">
        Re-check
      </button>
    </div>

    <!-- Game type selector (poker only) -->
    <div v-if="sessionType === 'poker'" class="flex flex-col gap-2">
      <span class="text-sm text-slate-300">Game</span>
      <div class="flex gap-3">
        <label
          :class="[
            'flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition',
            gameType === 'holdem' ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-900',
          ]"
        >
          <input type="radio" value="holdem" v-model="gameType" class="accent-amber-500" />
          <span class="font-display text-[14px]">No-Limit Hold'em</span>
        </label>
        <label
          :class="[
            'flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition',
            gameType === 'stud' ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-900',
          ]"
        >
          <input type="radio" value="stud" v-model="gameType" class="accent-amber-500" />
          <span class="font-display text-[14px]">7 Card Stud (fixed limit)</span>
        </label>
      </div>
    </div>

    <!-- Poker configuration -->
    <div v-if="sessionType === 'poker'" class="grid grid-cols-3 gap-6">
      <label class="flex flex-col gap-2">
        <span class="text-sm text-slate-300">Total seats (2–{{ maxSeats }})</span>
        <input
          type="number"
          min="2"
          :max="maxSeats"
          v-model.number="seatCount"
          class="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
        />
        <span class="text-xs text-slate-500">{{ aiSeatCount }} AI opponents</span>
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-sm text-slate-300">Starting stack</span>
        <input
          type="number"
          min="100"
          step="500"
          v-model.number="startingStack"
          class="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
        />
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-sm text-slate-300">Hands per blind level</span>
        <input
          type="number"
          min="1"
          v-model.number="handsPerLevel"
          class="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
        />
      </label>
    </div>

    <!-- Uno configuration -->
    <div v-else class="grid grid-cols-2 gap-6">
      <label class="flex flex-col gap-2">
        <span class="text-sm text-slate-300">Total seats (2–{{ maxSeats }})</span>
        <input
          type="number"
          min="2"
          :max="maxSeats"
          v-model.number="seatCount"
          class="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
        />
        <span class="text-xs text-slate-500">{{ aiSeatCount }} AI opponents</span>
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-sm text-slate-300">Match length (best-of-N)</span>
        <select
          v-model.number="totalRounds"
          class="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
        >
          <option :value="3">3 rounds</option>
          <option :value="5">5 rounds</option>
          <option :value="7">7 rounds</option>
          <option :value="11">11 rounds</option>
        </select>
      </label>
    </div>

    <!-- Character picker -->
    <div>
      <div class="mb-3 flex items-baseline justify-between">
        <h2 class="text-lg font-semibold">Pick your opponents</h2>
        <span class="text-xs text-slate-400">
          {{ pickedCharacterIds.length }} / {{ aiSeatCount }} chosen — remaining seats auto-filled
        </span>
      </div>
      <div class="grid grid-cols-5 gap-3">
        <button
          v-for="c in characters"
          :key="c.id"
          type="button"
          :class="[
            'flex flex-col items-center gap-2 rounded-xl border-2 p-2 text-center transition',
            pickedCharacterIds.includes(c.id)
              ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_18px_rgba(251,191,36,0.4)]'
              : 'border-slate-700 hover:border-slate-500 bg-slate-900/40',
          ]"
          @click="toggleCharacter(c.id)"
        >
          <div class="h-16 w-16 overflow-hidden rounded-full border-2 border-slate-700 bg-slate-800">
            <img
              v-if="!portraitFailed[c.id]"
              :src="c.portrait"
              :alt="c.name"
              class="h-full w-full object-cover"
              @error="portraitFailed[c.id] = true"
            />
            <PortraitPlaceholder v-else :name="c.name" :id="c.id" />
          </div>
          <div class="text-xs font-semibold">{{ c.name }}</div>
          <div class="text-[10px] leading-tight text-slate-400">
            {{ typeof c.playStyle === 'string' ? c.playStyle : (c.playStyle?.[playStyleKey] ?? c.playStyle?.holdem) }}
          </div>
        </button>
      </div>
    </div>

    <!-- Degraded mode toggle -->
    <label class="flex items-center gap-2 text-sm text-slate-300">
      <input type="checkbox" v-model="degradedMode" class="accent-amber-500" />
      Force degraded mode (AI seats auto-fold)
    </label>

    <div class="mt-2 flex justify-end">
      <button
        :disabled="!canStart"
        class="rounded-md bg-amber-500 px-6 py-3 text-base font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        @click="onStart"
      >
        Deal me in
      </button>
    </div>
  </div>
</template>
