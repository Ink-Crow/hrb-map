<template>
  <div class="map-box" style="width: 100vw; height: 100vh;">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button
        @click="toggleConnectMode"
        :type="isConnectMode ? 'warning': 'primary'"
      >
        {{ isConnectMode ? '退出连线模式' : '进入连线模式' }}
      </el-button>
      <el-button
        @click="clearAllConnections"
        type="danger"
      >
        清除所有连线
      </el-button>
      <el-button
        @click="toggleAnimation"
        type="success"
        :disabled="getLineData().length === 0"
      >
        {{ isAnimationPlaying ? '停止动画' : '开始动画' }}
      </el-button>
      <!-- <button @click="toggleMapType" class="maptype-btn">
        切换底图
      </button> -->
      <el-button :disabled="!points.length" @click="exportPoints">导出点位</el-button>
      <el-button @click="triggerImport">导入点位</el-button>
      <!-- 隐藏的文件输入框 -->
      <input
        type="file"
        ref="fileInputRef"
        style="display: none"
        accept=".json"
        @change="importPoints"
      />
    </div>

    <div ref="chartRef" class="chart"></div>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="menu-item" @click="addPoint" v-if="contextMenu.action === 'add'">
        添加点位
      </div>
      <div v-if="contextMenu.action === 'delete'">
        <div class="menu-item" @click="deletePoint">
          删除点位
        </div>
        <div class="menu-item" @click="editSerial(contextMenu.targetPointId)">
          编辑序号
        </div>
        <div v-if="isConnectMode" class="menu-item" @click="startConnection(contextMenu.targetPointId)">
          从此点开始连线
        </div>
        <div v-if="isConnectMode && selectedPointForConnect" class="menu-item" @click="finishConnection(contextMenu.targetPointId)">
          连接到此点
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'echarts/extension/bmap/bmap'

const BAIDU_AK = 'E4805d16520de693a3fe707cdc962045'

// 点位数据接口
interface Point {
  id: string
  serial: number | string // 序号
  lng: number // 经度
  lat: number // 纬度
}

// 连线数据接口
interface Connection {
  id: string
  sourceId: string
  targetPointId: string
}

// 点位与连线
const points = ref<Point[]>([])
const connections = ref<Connection[]>([])

// 状态
const isConnectMode = ref(false)
const selectedPointForConnect = ref<string | null>(null)
const isAnimationPlaying = ref(false)

// 地图类型
const currentMapType = ref<'normal' | 'satellite'>('normal')

// 右键菜单
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  action: 'add' as 'add' | 'delete',
  targetPointId: '',
  clickCoord: [0, 0] as [number, number]
})

const chartRef = ref(null)
let chart: echarts.ECharts | null = null
let bmap: any = null

onMounted(async () => {
  chart = echarts.init(chartRef.value)

  const option = {
    bmap: {
      center: [127.9999, 45.3890],
      zoom: 9,
      roam: true
    }
  }
  chart.setOption(option)
  updateChartOption()

  // ⚠️ 动态加载百度地图脚本
  loadBaiduMapScript()

  // 获取百度地图实例
  bmap = chart.getModel().getComponent('bmap').getBMap()

  // 右键：添加点位
  chart.getZr().on('contextmenu', handleRightClick)

  // 左键：编辑或关闭菜单
  chart.getZr().on('click', handleLeftClick)

  const mapTypeControl = new (window as any).BMap.MapTypeControl({
    mapTypes: [
      (window as any).BMAP_NORMAL_MAP,
      (window as any).BMAP_HYBRID_MAP
    ]
  })
  bmap.addControl(mapTypeControl)

  // 默认街道图
  bmap.setMapType((window as any).BMAP_NORMAL_MAP)
})

// 更新图表选项
function updateChartOption() {
  if (!chart) return

  const scatterData = points.value.map(p => ({
    name: p.serial.toString(),
    value: [p.lng, p.lat, p.serial]
  }))

  const lineData = getLineData()

  chart.setOption({
    series: [
      {
        name: 'points',
        type: 'scatter',
        coordinateSystem: 'bmap',
        data: scatterData,
        symbolSize: 20, // 点更大
        itemStyle: { color: '#ff0000' },
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => `{name|${params.data.name}}`,
          rich: {
            name: {
              color: '#000',              // 文字颜色
              fontSize: 14,
              fontWeight: 'bold',
              backgroundColor: '#fffbe6', // 背景色
              padding: [4, 8],            // 上下左右 padding
              borderRadius: 6,            // 圆角
              borderColor: '#ff9900',     // 边框
              borderWidth: 1
            }
          }
        }
      },
      {
        name: 'lines',
        type: 'lines',
        coordinateSystem: 'bmap',
        data: lineData,
        lineStyle: { color: '#ff0000', width: 2 },
        effect: {
          show: lineData.length > 0 && isAnimationPlaying.value,
          period: 6,
          trailLength: 0.7,
          color: '#ff0000',
          symbolSize: 8
        }
      },
      {
        name: 'drone',
        type: 'lines',
        coordinateSystem: 'bmap',
        data: lineData,
        lineStyle: { opacity: 0 },
        effect: {
          show: lineData.length > 0 && isAnimationPlaying.value,
          period: 8,
          trailLength: 0,
          symbol: 'image://wrj.svg',
          symbolSize: [30, 30]
        }
      }
    ]
  })
}

function getLineData() {
  const lineData = []
  if (connections.value.length > 0) {
    connections.value.forEach(conn => {
      const s = points.value.find(p => p.id === conn.sourceId)
      const t = points.value.find(p => p.id === conn.targetPointId)
      if (s && t) lineData.push({ coords: [[s.lng, s.lat], [t.lng, t.lat]] })
    })
  } else {
    const sorted = [...points.value].sort((a, b) => Number(a.serial) - Number(b.serial))
    for (let i = 0; i < sorted.length - 1; i++) {
      lineData.push({ coords: [[sorted[i].lng, sorted[i].lat], [sorted[i + 1].lng, sorted[i + 1].lat]] })
    }
  }
  return lineData
}

// 切换底图
function toggleMapType() {
  if (!bmap) return
  if (currentMapType.value === 'normal') {
    bmap.setMapType((window as any).BMAP_SATELLITE_MAP)
    currentMapType.value = 'satellite'
    ElMessage.success('已切换到实景卫星图')
  } else {
    bmap.setMapType((window as any).BMAP_NORMAL_MAP)
    currentMapType.value = 'normal'
    ElMessage.success('已切换到街道图')
  }
}

// 右键点击 → 添加点位
function handleRightClick(event: any) {
  if (!chart) return
  const pixel = [event.offsetX, event.offsetY]
  const coord = chart.convertFromPixel({ bmapIndex: 0 }, pixel)
  if (!coord) return

  contextMenu.value = {
    visible: true,
    x: event.offsetX,
    y: event.offsetY,
    action: 'add',
    targetPointId: '',
    clickCoord: [coord[0], coord[1]]
  }
  event.event.preventDefault()
}

// 左键点击 → 编辑点位 or 关闭菜单
function handleLeftClick(event: any) {
  if (!chart) return
  const pixel = [event.offsetX, event.offsetY]
  const coord = chart.convertFromPixel({ bmapIndex: 0 }, pixel)
  if (!coord) return

  const clickedPoint = findPointAtPosition(coord[0], coord[1])

  if (clickedPoint) {
    // 点击已有点位 → 编辑/删除
    contextMenu.value = {
      visible: true,
      x: event.offsetX,
      y: event.offsetY,
      action: 'delete',
      targetPointId: clickedPoint.id,
      clickCoord: [coord[0], coord[1]]
    }
  } else {
    // 点击空白 → 关闭菜单
    hideContextMenu()
  }
}

function findPointAtPosition(lng: number, lat: number, threshold = 0.01) {
  return points.value.find(p =>
    Math.abs(p.lng - lng) < threshold && Math.abs(p.lat - lat) < threshold
  )
}

function hideContextMenu() {
  contextMenu.value.visible = false
}

function addPoint() {
  ElMessageBox.prompt('请输入点位名称', '添加点位', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  }).then(({ value }) => {
    points.value.push({
      id: Date.now().toString(),
      serial: value,
      lng: contextMenu.value.clickCoord[0],
      lat: contextMenu.value.clickCoord[1]
    })
    updateChartOption()
    hideContextMenu()
  }).catch(() => {})
}

function deletePoint() {
  const idx = points.value.findIndex(p => p.id === contextMenu.value.targetPointId)
  if (idx !== -1) points.value.splice(idx, 1)
  updateChartOption()
  hideContextMenu()
}

function editSerial(pointId: string) {
  ElMessageBox.prompt('请输入点位名称', '编辑点位名称', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  }).then(({ value }) => {
    const p = points.value.find(p => p.id === pointId)
    if (p) p.serial = value
    updateChartOption()
    hideContextMenu()
  }).catch(() => {})
}

function toggleConnectMode() {
  isConnectMode.value = !isConnectMode.value
  selectedPointForConnect.value = null
  ElMessage.info(isConnectMode.value ? '已进入连线模式' : '已退出连线模式')
}

function clearAllConnections() {
  connections.value = []
  updateChartOption()
  ElMessage.success('已清除所有连线')
}

function startConnection(pointId: string) {
  selectedPointForConnect.value = pointId
  const p = points.value.find(p => p.id === pointId)
  ElMessage.info(`已选择点位 ${p?.serial}`)
  hideContextMenu()
}

function finishConnection(targetPointId: string) {
  if (!selectedPointForConnect.value || selectedPointForConnect.value === targetPointId) {
    ElMessage.warning('请选择不同的起始点和目标点')
    return
  }
  if (connections.value.find(c => c.sourceId === selectedPointForConnect.value && c.targetPointId === targetPointId)) {
    ElMessage.warning('该连线已存在')
    return
  }
  connections.value.push({ id: Date.now().toString(), sourceId: selectedPointForConnect.value, targetPointId })
  updateChartOption()
  selectedPointForConnect.value = null
  hideContextMenu()
}

function toggleAnimation() {
  isAnimationPlaying.value = !isAnimationPlaying.value
  updateChartOption()
  ElMessage[isAnimationPlaying.value ? 'success' : 'info'](isAnimationPlaying.value ? '无人机动画已开始' : '无人机动画已停止')
}

function loadBaiduMapScript() {
  if (document.getElementById('baidu-map')) return
  const script = document.createElement('script')
  script.id = 'baidu-map'
  script.type = 'text/javascript'
  script.src = `https://api.map.baidu.com/api?v=3.0&ak=${BAIDU_AK}`
  document.body.appendChild(script)
}

function exportPoints() {
  const data = {
    points: points.value,
    connections: connections.value
  }
  const jsonStr = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = 'map-data.json'
  a.click()
  URL.revokeObjectURL(url)
}

// 引用隐藏的 input
const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerImport() {
  fileInputRef.value?.click()
}

function importPoints(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target?.result as string)
      points.value = data.points || []
      connections.value = data.connections || []
      updateChartOption()
      ElMessage.success('导入成功')
    } catch (err) {
      ElMessage.error('导入失败，文件格式错误')
    }
  }
  reader.readAsText(file)
}
</script>

<style scoped>
.map-box {
  position: relative;

  .toolbar {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1000;
    display: flex;
    gap: 10px;

    .mode-btn, .clear-btn, .animation-btn, .maptype-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .mode-btn {
      background-color: #409eff;
      color: white;

      &.active {
        background-color: #67c23a;
      }

      &:hover {
        opacity: 0.8;
      }
    }

    .clear-btn {
        background-color: #f56c6c;
        color: white;

        &:hover {
          opacity: 0.8;
        }
      }

      .animation-btn {
        background-color: #e6a23c;
        color: white;

        &.active {
          background-color: #67c23a;
        }

        &:hover:not(:disabled) {
          opacity: 0.8;
        }
      }
  }

  .chart {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .context-menu {
    position: absolute;
    background-color: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1001;

    .menu-item {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 14px;
      border-bottom: 1px solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background-color: #f5f5f5;
      }
    }
  }

  .edit-dialog {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1002;

    .dialog-content {
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      min-width: 300px;

      h3 {
        margin-top: 0;
        margin-bottom: 16px;
      }

      input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-bottom: 16px;
        font-size: 14px;
      }

      .dialog-buttons {
        display: flex;
        gap: 10px;
        justify-content: flex-end;

        button {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;

          &:first-child {
            background-color: #409eff;
            color: white;
          }

          &:last-child {
            background-color: #ddd;
            color: #333;
          }

          &:hover {
            opacity: 0.8;
          }
        }
      }
    }
  }
}
</style>
