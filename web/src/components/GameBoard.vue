<script setup>
import { computed } from 'vue'
import {
  CLOUDS,
  CENTER,
  DECOR_PLANES,
  GOAL_RADIUS,
  LANE_CELL,
  RING,
  TRAILS,
  TRACK_CELL,
  VIEW,
  airportLines,
  cellCenter,
  goalWedges,
  hangarInfo,
  homeLaneSlots,
  homeSlot,
  sectorAngle
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

// ---------- 外圈 56 格 ----------
const starts = computed(() => new Map(props.room.players.map((player) => [startCell(player.seat, seats.value), player.seat])))
const airports = computed(
  () => new Map(props.room.players.map((player) => [airportCell(player.seat, seats.value), player.seat]))
)

// 轨道格颜色：起飞点与飞机场用本队颜色，其余按人数循环着色
function ringHex(index) {
  const count = seats.value
  if (starts.value.has(index)) return colorOf(starts.value.get(index)).hex
  if (airports.value.has(index)) return colorOf(airports.value.get(index)).hex
  return COLORS[cellColor(index, count)].hex
}

const cells = computed(() =>
  RING.map((point, index) => ({
    index,
    x: point.x,
    y: point.y,
    hex: ringHex(index),
    startSeat: starts.value.has(index) ? starts.value.get(index) : null,
    airportSeat: airports.value.has(index) ? airports.value.get(index) : null
  }))
)

// 起飞格白色飞机的朝向：沿行进方向
function startAngle(index) {
  const prev = cellCenter(index - 1 + TRACK)
  const point = cellCenter(index)
  return (Math.atan2(point.y - prev.y, point.x - prev.x) * 180) / Math.PI + 90
}

// ---------- 终点通道（对角彩条） ----------
const lanes = computed(() =>
  props.room.players.map((player) => ({
    seat: player.seat,
    hex: colorOf(player.seat).hex,
    soft: colorOf(player.seat).soft,
    slots: homeLaneSlots(player.seat, seats.value)
  }))
)

// ---------- 机库（只有前 4 队有独立机库） ----------
const hangars = computed(() =>
  props.room.players
    .filter((player) => player.seat < 4)
    .map((player) => {
      const info = hangarInfo(player.seat, seats.value, planesPerPlayer.value)
      return {
        ...info,
        seat: player.seat,
        hex: colorOf(player.seat).hex,
        name: `${colorOf(player.seat).name}队`
      }
    })
)

// ---------- 中心大本营 ----------
const wedges = computed(() => goalWedges(seats.value))

const wedgeMarks = computed(() =>
  goalWedges(seats.value).map((wedge) => {
    const mid = sectorAngle(wedge.seat, seats.value)
    return {
      seat: wedge.seat,
      x: CENTER + Math.cos(mid) * (GOAL_RADIUS - 20),
      y: CENTER + Math.sin(mid) * (GOAL_RADIUS - 20),
      rotate: (mid * 180) / Math.PI + 90
    }
  })
)

// ---------- 飞机场航线 ----------
const flightLines = computed(() => airportLines(seats.value))

// ---------- 交互 ----------
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

// ---------- 飞机 ----------
const planes = computed(() => {
  const list = []
  props.room.players.forEach((player) => {
    player.planes.forEach((position, planeIndex) => {
      list.push({
        key: `${player.seat}-${planeIndex}`,
        seat: player.seat,
        planeIndex,
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
    const spread = group.length > 1 ? 10 : 0
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
  // 5 队以上没有独立机库，飞机停在各自起飞格
  if (position === HANGAR) {
    if (player.seat >= 4) return cellCenter(absoluteCell(player.seat, 0, seats.value))
    return hangarInfo(player.seat, seats.value, planesPerPlayer.value).slots[planeIndex]
  }
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
        <linearGradient id="fx-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#eaf5ff" />
          <stop offset="55%" stop-color="#d7ecfd" />
          <stop offset="100%" stop-color="#c3e0f8" />
        </linearGradient>
        <linearGradient id="fx-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.92" />
          <stop offset="100%" stop-color="#eaf4ff" stop-opacity="0.86" />
        </linearGradient>
        <filter id="fx-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#2a4a75" flood-opacity="0.22" />
        </filter>
        <path
          id="fx-plane"
          d="M0,-9.6 C1.8,-9.6 2.9,-7.4 2.9,-5.2 L2.9,-2 L9.8,1.9 L9.8,4.1 L2.9,2.2 L2.9,5.8 L5.7,8.1 L5.7,9.8 L0,8.5 L-5.7,9.8 L-5.7,8.1 L-2.9,5.8 L-2.9,2.2 L-9.8,4.1 L-9.8,1.9 L-2.9,-2 L-2.9,-5.2 C-2.9,-7.4 -1.8,-9.6 0,-9.6 Z"
        />
      </defs>

      <!-- 天空 -->
      <rect x="0" y="0" :width="VIEW" :height="VIEW" rx="26" fill="url(#fx-sky)" />

      <!-- 云朵 -->
      <g v-for="(cloud, index) in CLOUDS" :key="`cloud-${index}`"
        :transform="`translate(${cloud.x} ${cloud.y}) scale(${cloud.scale})`" fill="#ffffff" opacity="0.8">
        <circle cx="0" cy="0" r="13" />
        <circle cx="18" cy="-7" r="18" />
        <circle cx="37" cy="1" r="12" />
        <rect x="-12" y="0" width="60" height="13" rx="6" />
      </g>

      <!-- 棋盘底板 -->
      <rect x="14" y="14" :width="VIEW - 28" :height="VIEW - 28" rx="26" fill="url(#fx-plate)"
        stroke="#c9dcf1" stroke-width="2" />

      <!-- 虚线航迹 -->
      <path v-for="(trail, index) in TRAILS" :key="`trail-${index}`" :d="trail" fill="none" stroke="#ffffff"
        stroke-width="2.6" stroke-dasharray="8 10" stroke-linecap="round" opacity="0.85" />

      <!-- 装饰飞机 -->
      <g v-for="(deco, index) in DECOR_PLANES" :key="`deco-${index}`"
        :transform="`translate(${deco.x} ${deco.y}) rotate(${deco.angle}) scale(${deco.scale})`">
        <use href="#fx-plane" fill="#7fb0d8" opacity="0.75" />
      </g>

      <!-- 标题（左，4 人及以下显示；人多时棋盘太满就不画） -->
      <g v-if="seats <= 4">
        <text x="252" y="452" text-anchor="middle" font-size="46" font-weight="800" fill="#2f6ed6"
          style="letter-spacing: 4px" transform="rotate(-5 252 452)">飞行棋</text>
        <text x="252" y="494" text-anchor="middle" font-size="23" font-style="italic" font-weight="600"
          fill="#4a86d0" transform="rotate(-5 252 494)">Fly Chess</text>
        <g transform="translate(324,478) rotate(-12) scale(0.85)">
          <use href="#fx-plane" fill="#2f6ed6" opacity="0.85" />
        </g>

        <!-- 口号（右） -->
        <text x="636" y="432" text-anchor="middle" font-size="23" font-weight="700" fill="#3f7fc9"
          style="letter-spacing: 2px">起飞，</text>
        <text x="636" y="468" text-anchor="middle" font-size="21" font-weight="700" fill="#3f7fc9"
          style="letter-spacing: 1px">向着更远的地方！</text>
        <g transform="translate(730,492) rotate(16) scale(0.8)">
          <use href="#fx-plane" fill="#3f7fc9" opacity="0.8" />
        </g>
      </g>

      <!-- 飞机场穿心航线 -->
      <line v-for="(line, index) in flightLines" :key="`line-${index}`" :x1="line.from.x" :y1="line.from.y"
        :x2="line.to.x" :y2="line.to.y" stroke="#7fa8d4" stroke-width="2.4" stroke-dasharray="9 10"
        opacity="0.55" />

      <!-- 终点通道（对角彩条） -->
      <g v-for="lane in lanes" :key="`lane-${lane.seat}`">
        <g v-for="(slot, index) in lane.slots" :key="`lane-${lane.seat}-${index}`">
          <rect :x="slot.x - LANE_CELL / 2" :y="slot.y - LANE_CELL / 2" :width="LANE_CELL" :height="LANE_CELL"
            rx="7" :fill="lane.hex" stroke="#ffffff" stroke-width="1.4" stroke-opacity="0.55" />
          <g :transform="`translate(${slot.x} ${slot.y}) scale(0.42)`">
            <use href="#fx-plane" fill="#ffffff" opacity="0.92" />
          </g>
        </g>
      </g>

      <!-- 外圈 56 格 -->
      <g v-for="cell in cells" :key="`cell-${cell.index}`">
        <rect :x="cell.x - TRACK_CELL / 2" :y="cell.y - TRACK_CELL / 2" :width="TRACK_CELL" :height="TRACK_CELL"
          rx="10" :fill="cell.hex" stroke="#ffffff" stroke-width="2" stroke-opacity="0.75" filter="url(#fx-shadow)" />
        <!-- 起飞点：白色飞机 -->
        <g v-if="cell.startSeat !== null"
          :transform="`translate(${cell.x} ${cell.y}) rotate(${startAngle(cell.index)}) scale(1.25)`">
          <use href="#fx-plane" fill="#ffffff" />
        </g>
        <!-- 飞机场：白圈 + 飞机 -->
        <g v-else-if="cell.airportSeat !== null" :transform="`translate(${cell.x} ${cell.y})`">
          <circle r="15" fill="none" stroke="#ffffff" stroke-width="2.2" opacity="0.95" />
          <use href="#fx-plane" fill="#ffffff" transform="scale(0.95)" />
        </g>
        <!-- 普通格：白色圆点 -->
        <circle v-else :cx="cell.x" :cy="cell.y" r="7.5" fill="#ffffff" opacity="0.94" />
      </g>

      <!-- 四角机库（底板外扩，压住边框两端的角格） -->
      <g v-for="hangar in hangars" :key="`hangar-${hangar.seat}`">
        <rect :x="hangar.plate.x" :y="hangar.plate.y" :width="hangar.plate.size" :height="hangar.plate.size"
          :rx="hangar.plate.size * 0.16" :fill="hangar.hex" stroke="#ffffff" stroke-width="3"
          filter="url(#fx-shadow)" />
        <rect :x="hangar.rect.x + 9" :y="hangar.rect.y + 9" :width="hangar.rect.size - 18"
          :height="hangar.rect.size - 18" :rx="hangar.rect.size * 0.12" fill="none" stroke="#ffffff" stroke-width="2.4"
          stroke-dasharray="11 9" stroke-opacity="0.92" />
        <circle v-for="(slot, index) in hangar.slots" :key="`hslot-${hangar.seat}-${index}`" :cx="slot.x" :cy="slot.y"
          :r="hangar.circleR" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-opacity="0.95" />
        <g v-for="(slot, index) in hangar.slots" :key="`hplane-${hangar.seat}-${index}`"
          :transform="`translate(${slot.x} ${slot.y}) scale(${hangar.big ? 1.15 : 0.8})`">
          <use href="#fx-plane" fill="#ffffff" />
        </g>
        <text :x="hangar.label.x" :y="hangar.label.y" text-anchor="middle" :font-size="hangar.labelSize"
          font-weight="800" fill="#ffffff" style="letter-spacing: 2px">
          {{ hangar.name }}
        </text>
        <g
          :transform="`translate(${hangar.label.x + hangar.labelSize * 2.1} ${hangar.label.y - hangar.labelSize * 0.34}) scale(${hangar.labelSize / 27})`">
          <use href="#fx-plane" fill="#ffffff" />
        </g>
      </g>

      <!-- 中心大本营 -->
      <circle :cx="CENTER" :cy="CENTER" :r="GOAL_RADIUS + 9" fill="#ffffff" filter="url(#fx-shadow)" />
      <path v-for="wedge in wedges" :key="`wedge-${wedge.seat}`" :d="wedge.path" :fill="colorOf(wedge.seat).hex"
        stroke="#ffffff" stroke-width="2.6" />
      <g v-for="mark in wedgeMarks" :key="`wmark-${mark.seat}`"
        :transform="`translate(${mark.x} ${mark.y}) rotate(${mark.rotate}) scale(1.45)`">
        <use href="#fx-plane" fill="#ffffff" opacity="0.97" />
      </g>

      <!-- 可走位提示 -->
      <g v-for="target in legalTargets" :key="`target-${target.plane}`">
        <circle :cx="target.x" :cy="target.y" r="17" fill="none" stroke="#1f2430" stroke-width="2.5"
          stroke-dasharray="4 4" class="pulse" />
      </g>

      <!-- 飞机 -->
      <g v-for="plane in planes" :key="plane.key" :transform="`translate(${plane.x} ${plane.y})`"
        :class="['plane', plane.clickable && 'clickable']" @click="pick(plane)">
        <circle v-if="plane.clickable" r="16" fill="none" stroke="#1f2430" stroke-width="2.5" class="pulse" />
        <circle r="12" :fill="plane.hex" stroke="#ffffff" stroke-width="2.4" />
        <use href="#fx-plane" fill="#ffffff" transform="scale(0.8)" />
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
  border-radius: 26px;
  box-shadow: 0 12px 34px rgba(40, 80, 130, 0.2);
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
