<script setup>
import { computed } from 'vue'
import {
  CLOUDS,
  CENTER,
  CORNER_CELLS,
  DECOR_PLANES,
  GOAL_RADIUS,
  LANE_CELL,
  RING,
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
const cells = computed(() => {
  const count = seats.value
  const starts = new Map(props.room.players.map((player) => [startCell(player.seat, count), player.seat]))
  const airports = new Map(props.room.players.map((player) => [airportCell(player.seat, count), player.seat]))
  return RING.map((point, index) => {
    const startSeat = starts.has(index) ? starts.get(index) : null
    const airportSeat = airports.has(index) ? airports.get(index) : null
    // 起飞点与飞机场都画成所属队自己的颜色，其余格子按人数循环着色
    const color =
      startSeat !== null ? colorOf(startSeat) : airportSeat !== null ? colorOf(airportSeat) : COLORS[cellColor(index, count)]
    return {
      index,
      x: point.x,
      y: point.y,
      hex: color.hex,
      startSeat,
      airportSeat,
      corner: CORNER_CELLS.has(index)
    }
  })
})

// 起飞点飞机的朝向：沿行进方向
function startAngle(index) {
  const prev = cellCenter(index - 1 + TRACK)
  const point = cellCenter(index)
  return (Math.atan2(point.y - prev.y, point.x - prev.x) * 180) / Math.PI + 90
}

// ---------- 终点通道 ----------
const lanes = computed(() =>
  props.room.players.map((player) => ({
    seat: player.seat,
    hex: colorOf(player.seat).hex,
    slots: homeLaneSlots(player.seat, seats.value)
  }))
)

// ---------- 机库 ----------
const hangars = computed(() =>
  props.room.players.map((player) => {
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
      x: CENTER + Math.cos(mid) * (GOAL_RADIUS - 22),
      y: CENTER + Math.sin(mid) * (GOAL_RADIUS - 22),
      rotate: (mid * 180) / Math.PI + 90
    }
  })
)

// ---------- 飞机场虚线 ----------
const flightLines = computed(() => airportLines(seats.value))

// ---------- 走子交互 ----------
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
  // 同一格多架飞机时围成一圈
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
  if (position === HANGAR) return hangarInfo(player.seat, seats.value, planesPerPlayer.value).slots[planeIndex]
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
          <stop offset="60%" stop-color="#d8ecfc" />
          <stop offset="100%" stop-color="#c6e2f9" />
        </linearGradient>
        <path
          id="fx-plane"
          d="M0,-9.4 C1.7,-9.4 2.8,-7.3 2.8,-5.2 L2.8,-2.1 L9.6,1.8 L9.6,3.9 L2.8,2.1 L2.8,5.7 L5.6,8 L5.6,9.6 L0,8.4 L-5.6,9.6 L-5.6,8 L-2.8,5.7 L-2.8,2.1 L-9.6,3.9 L-9.6,1.8 L-2.8,-2.1 L-2.8,-5.2 C-2.8,-7.3 -1.7,-9.4 0,-9.4 Z"
        />
      </defs>

      <!-- 天空背景 -->
      <rect x="0" y="0" :width="VIEW" :height="VIEW" rx="30" fill="url(#fx-sky)" />

      <!-- 云朵 -->
      <g v-for="(cloud, index) in CLOUDS" :key="`cloud-${index}`"
        :transform="`translate(${cloud.x} ${cloud.y}) scale(${cloud.scale})`" fill="#ffffff" opacity="0.75">
        <circle cx="0" cy="0" r="14" />
        <circle cx="19" cy="-7" r="19" />
        <circle cx="40" cy="1" r="13" />
        <rect x="-13" y="0" width="66" height="14" rx="7" />
      </g>

      <!-- 标题与装饰 -->
      <text :x="VIEW / 2 - 30" y="98" text-anchor="middle" font-size="42" font-weight="800" fill="#2f6ed6"
        opacity="0.9" style="letter-spacing: 6px">
        飞行棋
      </text>
      <text :x="VIEW / 2 + 96" y="98" text-anchor="start" font-size="19" font-style="italic" font-weight="600"
        fill="#5b8fd6" opacity="0.85">
        Fly Chess
      </text>
      <text :x="VIEW / 2" :y="VIEW - 26" text-anchor="middle" font-size="17" fill="#7da7d9" opacity="0.9">
        起飞，向着更远的地方！
      </text>
      <path d="M 250,128 Q 560,48 880,126" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="7 9"
        opacity="0.8" />
      <path :d="`M 240,${VIEW - 104} Q 560,${VIEW - 36} 886,${VIEW - 108}`" fill="none" stroke="#ffffff"
        stroke-width="2.5" stroke-dasharray="7 9" opacity="0.8" />
      <g v-for="(deco, index) in DECOR_PLANES" :key="`deco-${index}`"
        :transform="`translate(${deco.x} ${deco.y}) rotate(${deco.angle}) scale(${deco.scale})`">
        <use href="#fx-plane" fill="#8fb8dc" opacity="0.7" />
      </g>

      <!-- 飞机场穿心虚线 -->
      <line v-for="(line, index) in flightLines" :key="`line-${index}`" :x1="line.from.x" :y1="line.from.y"
        :x2="line.to.x" :y2="line.to.y" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="8 9" opacity="0.6" />

      <!-- 终点通道 -->
      <g v-for="lane in lanes" :key="`lane-${lane.seat}`">
        <g v-for="(slot, index) in lane.slots" :key="`lane-${lane.seat}-${index}`">
          <rect :x="slot.x - LANE_CELL / 2" :y="slot.y - LANE_CELL / 2" :width="LANE_CELL" :height="LANE_CELL" rx="7"
            :fill="lane.hex" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.5" />
          <circle :cx="slot.x" :cy="slot.y" r="4.5" fill="#ffffff" opacity="0.9" />
        </g>
      </g>

      <!-- 外圈 56 格 -->
      <g v-for="cell in cells" :key="`cell-${cell.index}`">
        <rect v-if="!cell.corner" :x="cell.x - TRACK_CELL / 2" :y="cell.y - TRACK_CELL / 2" :width="TRACK_CELL"
          :height="TRACK_CELL" rx="9" :fill="cell.hex" />
        <rect v-else :x="cell.x - TRACK_CELL * 0.58" :y="cell.y - TRACK_CELL * 0.58" :width="TRACK_CELL * 1.16"
          :height="TRACK_CELL * 1.16" rx="9" :fill="cell.hex" :transform="`rotate(45 ${cell.x} ${cell.y})`" />

        <!-- 起飞点：白色飞机 -->
        <g v-if="cell.startSeat !== null"
          :transform="`translate(${cell.x} ${cell.y}) rotate(${startAngle(cell.index)}) scale(1.15)`">
          <use href="#fx-plane" fill="#ffffff" />
        </g>
        <!-- 飞机场：白圈 + 飞机 -->
        <g v-else-if="cell.airportSeat !== null" :transform="`translate(${cell.x} ${cell.y})`">
          <circle r="14.5" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.95" />
          <use href="#fx-plane" fill="#ffffff" transform="scale(0.9)" />
        </g>
        <!-- 普通格：白色圆点 -->
        <circle v-else :cx="cell.x" :cy="cell.y" r="7" fill="#ffffff" opacity="0.92" />
      </g>

      <!-- 四角机库 -->
      <g v-for="hangar in hangars" :key="`hangar-${hangar.seat}`">
        <rect :x="hangar.rect.x" :y="hangar.rect.y" :width="hangar.rect.size" :height="hangar.rect.size"
          :rx="hangar.rect.size * 0.12" :fill="hangar.hex" />
        <rect :x="hangar.rect.x + 10" :y="hangar.rect.y + 10" :width="hangar.rect.size - 20"
          :height="hangar.rect.size - 20" :rx="hangar.rect.size * 0.1" fill="none" stroke="#ffffff" stroke-width="2.5"
          stroke-dasharray="10 8" stroke-opacity="0.9" />
        <circle v-for="(slot, index) in hangar.slots" :key="`hslot-${hangar.seat}-${index}`" :cx="slot.x" :cy="slot.y"
          :r="hangar.circleR" fill="#ffffff" fill-opacity="0.16" stroke="#ffffff" stroke-width="3"
          stroke-opacity="0.85" />
        <text :x="hangar.label.x" :y="hangar.label.y" text-anchor="middle" :font-size="hangar.labelSize"
          font-weight="800" fill="#ffffff" style="letter-spacing: 2px">
          {{ hangar.name }}
        </text>
        <g
          :transform="`translate(${hangar.label.x + hangar.labelSize * 2.4} ${hangar.label.y - hangar.labelSize * 0.35}) scale(${hangar.labelSize / 26})`">
          <use href="#fx-plane" fill="#ffffff" transform="scale(0.9)" />
        </g>
      </g>

      <!-- 中心大本营 -->
      <circle :cx="CENTER" :cy="CENTER" :r="GOAL_RADIUS + 10" fill="#ffffff" />
      <path v-for="wedge in wedges" :key="`wedge-${wedge.seat}`" :d="wedge.path" :fill="colorOf(wedge.seat).hex"
        stroke="#ffffff" stroke-width="3" />
      <circle :cx="CENTER" :cy="CENTER" :r="GOAL_RADIUS + 10" fill="none" stroke="#cfe2f4" stroke-width="3" />
      <g v-for="mark in wedgeMarks" :key="`wmark-${mark.seat}`"
        :transform="`translate(${mark.x} ${mark.y}) rotate(${mark.rotate}) scale(1.5)`">
        <use href="#fx-plane" fill="#ffffff" opacity="0.96" />
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
        <use href="#fx-plane" fill="#ffffff" transform="scale(0.78)" />
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
  border-radius: 24px;
  box-shadow: 0 10px 30px rgba(43, 84, 131, 0.18);
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
