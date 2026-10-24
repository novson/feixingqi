<script setup>
import { computed } from 'vue'
import {
  CELL,
  CENTER,
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

const cells = computed(() => {
  const count = seats.value
  const starts = new Map(props.room.players.map((player) => [startCell(player.seat, count), player.seat]))
  const airports = new Map(props.room.players.map((player) => [airportCell(player.seat, count), player.seat]))
  return Array.from({ length: TRACK }, (_, index) => {
    const point = cellCenter(index)
    return {
      index,
      x: point.x,
      y: point.y,
      hex: COLORS[cellColor(index, count)].hex,
      soft: COLORS[cellColor(index, count)].soft,
      startSeat: starts.has(index) ? starts.get(index) : null,
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
    const { pad, slots } = hangarSlots(player.seat, seats.value, planesPerPlayer.value)
    return {
      seat: player.seat,
      player,
      hex: colorOf(player.seat).hex,
      soft: colorOf(player.seat).soft,
      pad,
      slots
    }
  })
)

const wedges = computed(() =>
  props.room.players.map((player) => ({
    seat: player.seat,
    hex: colorOf(player.seat).hex,
    soft: colorOf(player.seat).soft,
    path: goalWedgePath(player.seat, seats.value),
    label: colorOf(player.seat).name
  }))
)

const flightLines = computed(() =>
  props.room.players
    .map((player) => airportLines(player.seat, seats.value, airportCell))
    .filter(Boolean)
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
    if (move.to >= TRACK && move.to < FINISH) return { ...homeLaneSlots(seat, seats.value)[move.to - TRACK], plane: move.plane }
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
  // 同一格上的飞机错开摆放
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

const cellSize = computed(() => CELL * 0.74)
</script>

<template>
  <div class="board-wrap">
    <svg :viewBox="`0 0 ${VIEW} ${VIEW}`" class="board" role="img" aria-label="飞行棋棋盘">
      <rect x="0" y="0" :width="VIEW" :height="VIEW" rx="18" fill="#fff" stroke="#e5e8ef" />

      <!-- 飞机场连线 -->
      <g class="flight-lines">
        <line
          v-for="(line, index) in flightLines"
          :key="`line-${index}`"
          :x1="line.from.x"
          :y1="line.from.y"
          :x2="line.to.x"
          :y2="line.to.y"
          stroke="#b9c0d4"
          stroke-width="2"
          stroke-dasharray="6 6"
        />
      </g>

      <!-- 终点通道 -->
      <g v-for="lane in lanes" :key="`lane-${lane.seat}`">
        <polyline
          :points="lane.slots.map((slot) => `${slot.x},${slot.y}`).join(' ')"
          fill="none"
          :stroke="lane.hex"
          stroke-width="2"
          stroke-opacity="0.35"
          stroke-dasharray="4 4"
        />
        <rect
          v-for="(slot, index) in lane.slots"
          :key="`lane-${lane.seat}-${index}`"
          :x="slot.x - cellSize / 3"
          :y="slot.y - cellSize / 3"
          :width="(cellSize / 3) * 2"
          :height="(cellSize / 3) * 2"
          rx="4"
          :fill="lane.soft"
          :stroke="lane.hex"
          stroke-opacity="0.3"
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
            stroke-opacity="0.45"
            stroke-width="cell.startSeat !== null || cell.airportSeat !== null ? 2.4 : 1"
          />
          <text
            v-if="cell.startSeat !== null"
            :x="cell.x"
            :y="cell.y + 4"
            text-anchor="middle"
            font-size="12"
            :fill="cell.hex"
            font-weight="700"
          >
            起
          </text>
          <text v-else-if="cell.airportSeat !== null" :x="cell.x" :y="cell.y + 5" text-anchor="middle" font-size="13">
            ✈
          </text>
        </g>
      </g>

      <!-- 中心大本营 -->
      <g>
        <g v-for="wedge in wedges" :key="`wedge-${wedge.seat}`">
          <path :d="wedge.path" :fill="wedge.soft" :stroke="wedge.hex" stroke-opacity="0.25" />
        </g>
        <circle :cx="CENTER" :cy="CENTER" r="46" fill="none" stroke="#c9cfdd" stroke-width="2" />
        <text :x="CENTER" :y="CENTER + 4" text-anchor="middle" font-size="12" fill="#6b7280">终点</text>
      </g>

      <!-- 机库 -->
      <g v-for="hangar in hangars" :key="`hangar-${hangar.seat}`">
        <circle :cx="hangar.pad.x" :cy="hangar.pad.y" r="30" :fill="hangar.soft" :stroke="hangar.hex" stroke-opacity="0.4" />
        <circle
          v-for="(slot, index) in hangar.slots"
          :key="`hangar-slot-${hangar.seat}-${index}`"
          :cx="slot.x"
          :cy="slot.y"
          r="7"
          :fill="hangar.hex"
          fill-opacity="0.25"
        />
        <text :x="hangar.pad.x" :y="hangar.pad.y + 46" text-anchor="middle" font-size="12" :fill="hangar.hex">
          {{ hangar.player.nickname }}
        </text>
      </g>

      <!-- 可走位提示 -->
      <g v-for="target in legalTargets" :key="`target-${target.plane}`">
        <circle :cx="target.x" :cy="target.y" r="15" fill="none" stroke="#3e63dd" stroke-width="2" stroke-dasharray="4 4" class="pulse" />
      </g>

      <!-- 飞机 -->
      <g
        v-for="plane in planes"
        :key="plane.key"
        :transform="`translate(${plane.x} ${plane.y})`"
        :class="['plane', plane.clickable && 'clickable']"
        @click="pick(plane)"
      >
        <circle v-if="plane.clickable" r="14" fill="none" stroke="#3e63dd" stroke-width="2" class="pulse" />
        <circle r="10.5" :fill="plane.hex" stroke="#fff" stroke-width="2" />
        <path d="M0,-5.2 L5.1,4.2 L0,2.1 L-5.1,4.2 Z" fill="#fff" fill-opacity="0.95" />
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
  border-radius: 16px;
  background: #fff;
}

.plane {
  transition: transform 0.18s ease;
}

.plane.clickable {
  cursor: pointer;
}

.plane.clickable:hover {
  filter: brightness(1.1);
}

.pulse {
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}
</style>
