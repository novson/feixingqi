<script setup>
import { computed } from 'vue'
import {
  CELL,
  CENTER,
  CLOUDS,
  GOAL_RADIUS,
  HANGAR_SIZE,
  MARGIN,
  SPAN,
  VIEW,
  airportLines,
  cellCenter,
  goalWedgePath,
  hangarSlots,
  homeLaneSlots,
  homeSlot
} from '../services/board.js'
import {
  COLORS,
  FINISH,
  HANGAR,
  TRACK,
  absoluteCell,
  airportCell,
  cellColor,
  colorOf,
  startCell
} from '../services/rules.js'

const props = defineProps({
  room: { type: Object, required: true },
  myPlayerId: { type: String, default: '' },
  interactive: { type: Boolean, default: false }
})

const emit = defineEmits(['pick'])

const seats = computed(() => props.room.players.length)
const planesPerPlayer = computed(() => props.room.planesPerPlayer)
const cellSize = computed(() => CELL * 0.72)

const cells = computed(() => {
  const count = seats.value
  const starts = new Map(props.room.players.map((player) => [startCell(player.seat, count), player.seat]))
  const airports = new Map(props.room.players.map((player) => [airportCell(player.seat, count), player.seat]))
  return Array.from({ length: TRACK }, (_, index) => {
    const point = cellCenter(index)
    const startSeat = starts.has(index) ? starts.get(index) : null
    // 起飞点固定画成该队自己的颜色（经典棋盘的样子）
    const color = startSeat !== null ? colorOf(startSeat) : COLORS[cellColor(index, count)]
    return {
      index,
      x: point.x,
      y: point.y,
      hex: color.hex,
      soft: color.soft,
      startSeat,
      airportSeat: airports.has(index) ? airports.get(index) : null
    }
  })
})

const lanes = computed(() =>
  props.room.players.map((player) => ({
    seat: player.seat,
    hex: colorOf(player.seat).hex,
    soft: colorOf(player.seat).soft,
    slots: homeLaneSlots(player.seat, seats.value)
  }))
)

const hangars = computed(() =>
  props.room.players.map((player) => {
    const { pad, slots, label } = hangarSlots(player.seat, seats.value, planesPerPlayer.value)
    return {
      seat: player.seat,
      player,
      hex: colorOf(player.seat).hex,
      soft: colorOf(player.seat).soft,
      name: `${colorOf(player.seat).name}队`,
      pad,
      slots,
      label
    }
  })
)

const goals = computed(() =>
  props.room.players.map((player) => ({
    seat: player.seat,
    hex: colorOf(player.seat).hex,
    soft: colorOf(player.seat).soft,
    path: goalWedgePath(player.seat, seats.value)
  }))
)

const flightLines = computed(() =>
  props.room.players.map((player) => airportLines(player.seat, seats.value, airportCell)).filter(Boolean)
)

const myPlayer = computed(() => props.room.players.find((player) => player.id === props.myPlayerId) || null)
const isMyTurn = computed(() => myPlayer.value && props.room.turnSeat === myPlayer.value.seat)
const legalPlanes = computed(() =>
  props.interactive && isMyTurn.value ? (props.room.legal || []).map((move) => move.plane) : []
)

const legalTargets = computed(() => {
  if (!props.interactive || !isMyTurn.value || !myPlayer.value) return []
  return (props.room.legal || []).map((move) => {
    const seat = myPlayer.value.seat
    if (move.to >= TRACK && move.to < FINISH)
      return { ...homeLaneSlots(seat, seats.value)[move.to - TRACK], plane: move.plane }
    if (move.to === FINISH) return { ...homeSlot(seat, seats.value, 0), plane: move.plane }
    return { ...cellCenter(absoluteCell(seat, move.to, seats.value)), plane: move.plane }
  })
})

const planes = computed(() => {
  const list = []
  props.room.players.forEach((player) => {
    player.planes.forEach((position, planeIndex) => {
      list.push({
        key: `${player.seat}-${planeIndex}`,
        seat: player.seat,
        planeIndex,
        position,
        hex: colorOf(player.seat).hex,
        point: basePoint(player, planeIndex, position)
      })
    })
  })
  const groups = new Map()
  list.forEach((plane) => {
    const key = `${Math.round(plane.point.x)}:${Math.round(plane.point.y)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(plane)
  })
  groups.forEach((group) => {
    const spread = group.length > 1 ? 9 : 0
    group.forEach((plane, index) => {
      const angle = (index / group.length) * Math.PI * 2
      plane.x = plane.point.x + (spread ? Math.cos(angle) * spread : 0)
      plane.y = plane.point.y + (spread ? Math.sin(angle) * spread : 0)
    })
  })
  return list.map((plane) => ({
    ...plane,
    clickable:
      props.interactive && plane.seat === myPlayer.value?.seat && legalPlanes.value.includes(plane.planeIndex)
  }))
})

function basePoint(player, planeIndex, position) {
  if (position === HANGAR) return hangarSlots(player.seat, seats.value, planesPerPlayer.value).slots[planeIndex]
  if (position >= TRACK && position < FINISH) return homeLaneSlots(player.seat, seats.value)[position - TRACK]
  if (position === FINISH) {
    const order = player.planes.slice(0, planeIndex).filter((value) => value === FINISH).length
    return homeSlot(player.seat, seats.value, order)
  }
  return cellCenter(absoluteCell(player.seat, position, seats.value))
}

function pick(plane) {
  if (!plane.clickable) return
  emit('pick', plane.planeIndex)
}
</script>

<template>
  <div class="board-wrap">
    <svg :viewBox="`0 0 ${VIEW} ${VIEW}`" class="board" role="img" aria-label="飞行棋棋盘">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#eaf4ff" />
          <stop offset="55%" stop-color="#dcecff" />
          <stop offset="100%" stop-color="#cfe4fb" />
        </linearGradient>
      </defs>

      <!-- 天空背景与云朵 -->
      <rect x="0" y="0" :width="VIEW" :height="VIEW" rx="20" fill="url(#sky)" />
      <g class="clouds">
        <g
          v-for="(cloud, index) in CLOUDS"
          :key="`cloud-${index}`"
          :transform="`translate(${cloud.x} ${cloud.y}) scale(${cloud.scale})`"
          fill="#ffffff"
          opacity="0.6"
        >
          <circle cx="0" cy="0" r="15" />
          <circle cx="20" cy="-7" r="20" />
          <circle cx="42" cy="1" r="14" />
          <rect x="-13" y="0" width="70" height="15" rx="7" />
        </g>
      </g>

      <!-- 棋盘底板 -->
      <rect
        :x="MARGIN - 26"
        :y="MARGIN - 26"
        :width="SPAN + 52"
        :height="SPAN + 52"
        rx="22"
        fill="#ffffff"
        fill-opacity="0.72"
        stroke="#d7e3f4"
      />

      <!-- 飞机场虚线 -->
      <g>
        <line
          v-for="(line, index) in flightLines"
          :key="`line-${index}`"
          :x1="line.from.x"
          :y1="line.from.y"
          :x2="line.to.x"
          :y2="line.to.y"
          stroke="#9fb0cc"
          stroke-width="2"
          stroke-dasharray="7 7"
        />
      </g>

      <!-- 终点通道 -->
      <g v-for="lane in lanes" :key="`lane-${lane.seat}`">
        <polyline
          :points="lane.slots.map((slot) => `${slot.x},${slot.y}`).join(' ')"
          fill="none"
          :stroke="lane.hex"
          stroke-width="2"
          stroke-opacity="0.4"
          stroke-dasharray="5 5"
        />
        <rect
          v-for="(slot, index) in lane.slots"
          :key="`lane-${lane.seat}-${index}`"
          :x="slot.x - cellSize / 3"
          :y="slot.y - cellSize / 3"
          :width="(cellSize / 3) * 2"
          :height="(cellSize / 3) * 2"
          rx="5"
          :fill="lane.soft"
          :stroke="lane.hex"
          stroke-opacity="0.45"
        />
      </g>

      <!-- 外圈格子 -->
      <g>
        <g v-for="cell in cells" :key="`cell-${cell.index}`">
          <rect
            :x="cell.x - cellSize / 2"
            :y="cell.y - cellSize / 2"
            :width="cellSize"
            :height="cellSize"
            rx="6"
            :fill="cell.soft"
            :stroke="cell.hex"
            :stroke-opacity="cell.startSeat !== null || cell.airportSeat !== null ? 0.85 : 0.4"
            :stroke-width="cell.startSeat !== null || cell.airportSeat !== null ? 2.4 : 1.2"
          />
          <!-- 起飞点：白色飞机 -->
          <g v-if="cell.startSeat !== null" :transform="`translate(${cell.x} ${cell.y})`">
            <path d="M0,-7.4 L7.4,6 L0,2.9 L-7.4,6 Z" fill="#ffffff" />
          </g>
          <!-- 飞机场 -->
          <text
            v-else-if="cell.airportSeat !== null"
            :x="cell.x"
            :y="cell.y + 5"
            text-anchor="middle"
            font-size="14"
            opacity="0.85"
          >
            ✈
          </text>
        </g>
      </g>

      <!-- 中心大本营 -->
      <g>
        <circle :cx="CENTER" :cy="CENTER" :r="GOAL_RADIUS + 5" fill="#ffffff" />
        <path v-for="goal in goals" :key="`goal-${goal.seat}`" :d="goal.path" :fill="goal.soft" :stroke="goal.hex" stroke-opacity="0.35" />
        <circle :cx="CENTER" :cy="CENTER" :r="GOAL_RADIUS" fill="none" stroke="#b9c8de" stroke-width="2.5" />
      </g>

      <!-- 四角机库 -->
      <g v-for="hangar in hangars" :key="`hangar-${hangar.seat}`">
        <rect
          :x="hangar.pad.x - HANGAR_SIZE / 2"
          :y="hangar.pad.y - HANGAR_SIZE / 2"
          :width="HANGAR_SIZE"
          :height="HANGAR_SIZE"
          rx="18"
          :fill="hangar.hex"
          fill-opacity="0.92"
        />
        <rect
          :x="hangar.pad.x - HANGAR_SIZE / 2 + 6"
          :y="hangar.pad.y - HANGAR_SIZE / 2 + 6"
          :width="HANGAR_SIZE - 12"
          :height="HANGAR_SIZE - 12"
          rx="14"
          fill="none"
          stroke="#ffffff"
          stroke-opacity="0.85"
          stroke-dasharray="5 5"
        />
        <circle
          v-for="(slot, index) in hangar.slots"
          :key="`hangar-slot-${hangar.seat}-${index}`"
          :cx="slot.x"
          :cy="slot.y"
          r="9.5"
          fill="#ffffff"
          fill-opacity="0.2"
          stroke="#ffffff"
          stroke-opacity="0.55"
        />
        <text
          :x="hangar.label.x"
          :y="hangar.label.y"
          text-anchor="middle"
          font-size="13"
          font-weight="700"
          :fill="hangar.hex"
        >
          {{ hangar.name }}
        </text>
      </g>

      <!-- 装饰标题 -->
      <text :x="CENTER" :y="VIEW - 20" text-anchor="middle" font-size="15" font-weight="700" fill="#7d93b5">
        飞行棋 Fly Chess
      </text>

      <!-- 可走位提示 -->
      <g v-for="target in legalTargets" :key="`target-${target.plane}`">
        <circle
          :cx="target.x"
          :cy="target.y"
          r="16"
          fill="none"
          stroke="#1f2430"
          stroke-width="2"
          stroke-dasharray="4 4"
          class="pulse"
        />
      </g>

      <!-- 飞机 -->
      <g
        v-for="plane in planes"
        :key="plane.key"
        :transform="`translate(${plane.x} ${plane.y})`"
        :class="['plane', plane.clickable && 'clickable']"
        @click="pick(plane)"
      >
        <circle v-if="plane.clickable" r="15" fill="none" stroke="#1f2430" stroke-width="2" class="pulse" />
        <circle r="11" :fill="plane.hex" stroke="#ffffff" stroke-width="2.2" />
        <path d="M0,-5.4 L5.3,4.3 L0,2.1 L-5.3,4.3 Z" fill="#ffffff" fill-opacity="0.95" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.board-wrap {
  width: 100%;
}

.board {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 20px;
}

.plane {
  transition: transform 0.18s ease;
}

.plane.clickable {
  cursor: pointer;
}

.plane.clickable:hover {
  filter: brightness(1.12);
}

.pulse {
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
</style>
