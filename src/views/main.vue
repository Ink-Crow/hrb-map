<template>
  <div class="map-box" style="width: 100vw; height: 100vh;">
    <!-- 工具栏 -->
    <div class="toolbar">
      <button
        @click="toggleConnectMode"
        :class="{ active: isConnectMode }"
        class="mode-btn"
      >
        {{ isConnectMode ? '退出连线模式' : '进入连线模式' }}
      </button>
      <button @click="clearAllConnections" class="clear-btn">
        清除所有连线
      </button>
      <button
        @click="toggleAnimation"
        :class="{ active: isAnimationPlaying }"
        class="animation-btn"
        :disabled="getLineData().length === 0"
      >
        {{ isAnimationPlaying ? '停止动画' : '开始动画' }}
      </button>
      <button @click="toggleMapType" class="maptype-btn">
        切换底图
      </button>
    </div>

    <div ref="chartRef" class="chart"></div>
    <!-- 左键菜单 -->
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

// 示例 ak（仅测试用，建议换成你自己的 ak）
const BAIDU_AK = 'E4805d16520de693a3fe707cdc962045'

// 加载哈尔滨 GeoJSON
async function loadGeoJSON(): Promise<any> {
  const res = await fetch('/haerbin.json')
  return await res.json()
}

// 点位数据接口
interface Point {
  id: string
  serial: number // 序号
  lng: number // 经度
  lat: number // 纬度
}

// 连线数据接口
interface Connection {
  id: string
  sourceId: string
  targetId: string
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

  const geoJSON = await loadGeoJSON()
  echarts.registerMap('customGeo', geoJSON)

  // 添加左键点击事件监听
  chart.getZr().on('click', handleLeftClick)

  const option = {
    bmap: {
      center: [127.9999, 45.3890],
      zoom: 9,
      roam: true,
      mapStyle: {
        styleJson: [
          {
            featureType: 'all',
            elementType: 'all',
            stylers: { lightness: 10, saturation: -20 },
          },
        ],
      },
    }
  }

  chart.setOption(option)

  updateChartOption()

  // ⚠️ 动态加载百度地图脚本
  loadBaiduMapScript()

  // 获取百度地图实例
  bmap = chart.getModel().getComponent('bmap').getBMap()

  // 添加地图类型控件
  const mapTypeControl = new (window as any).BMap.MapTypeControl({
    mapTypes: [
      (window as any).BMAP_NORMAL_MAP,
      (window as any).BMAP_SATELLITE_MAP
    ]
  })
  bmap.addControl(mapTypeControl)

  // 默认街道图
  bmap.setMapType((window as any).BMAP_HYBRID_MAP)
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
        name: 'map',
        type: 'map',
        map: 'customGeo',
        roam: false,
        itemStyle: {
          areaColor: 'rgba(173, 216, 230, 0.2)',
          borderColor: '#4682B4',
          borderWidth: 1
        },
        emphasis: {
          itemStyle: {
            areaColor: 'rgba(173, 216, 230, 0.4)'
          }
        }
      },
      {
        name: 'points',
        type: 'scatter',
        coordinateSystem: 'bmap',
        data: scatterData,
        symbolSize: 20,
        itemStyle: { color: '#ff0000' },
        label: {
          show: true,
          position: 'inside',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold',
          formatter: (params: any) => params.data.name
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
          symbolSize: [30, 30],
          color: '#409eff'
        }
      }
    ]
  })
}

// 获取连线数据
function getLineData() {
  const lineData = []
  if (connections.value.length > 0) {
    connections.value.forEach(conn => {
      const sourcePoint = points.value.find(p => p.id === conn.sourceId)
      const targetPoint = points.value.find(p => p.id === conn.targetId)
      if (sourcePoint && targetPoint) {
        lineData.push({ coords: [[sourcePoint.lng, sourcePoint.lat], [targetPoint.lng, targetPoint.lat]] })
      }
    })
  } else {
    const sortedPoints = [...points.value].sort((a, b) => a.serial - b.serial)
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      lineData.push({
        coords: [[sortedPoints[i].lng, sortedPoints[i].lat], [sortedPoints[i + 1].lng, sortedPoints[i + 1].lat]]
      })
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

// 点击事件
function handleLeftClick(event: any) {
  if (!chart) return
  const pixel = [event.offsetX, event.offsetY]
  const coord = chart.convertFromPixel({ bmapIndex: 0 }, pixel)
  if (!coord) return

  const clickedPoint = findPointAtPosition(coord[0], coord[1])
  contextMenu.value = {
    visible: true,
    x: event.offsetX,
    y: event.offsetY,
    action: clickedPoint ? 'delete' : 'add',
    targetPointId: clickedPoint?.id || '',
    clickCoord: [coord[0], coord[1]]
  }
}

function findPointAtPosition(lng: number, lat: number, threshold = 0.01) {
  return points.value.find(point =>
    Math.abs(point.lng - lng) < threshold &&
    Math.abs(point.lat - lat) < threshold
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
    const newPoint: Point = {
      id: Date.now().toString(),
      serial: value,
      lng: contextMenu.value.clickCoord[0],
      lat: contextMenu.value.clickCoord[1]
    }
    points.value.push(newPoint)
    updateChartOption()
    hideContextMenu()
  }).catch(() => {})
}

function deletePoint() {
  const index = points.value.findIndex(p => p.id === contextMenu.value.targetPointId)
  if (index !== -1) {
    points.value.splice(index, 1)
    updateChartOption()
  }
  hideContextMenu()
}

function editSerial(pointId: string) {
  ElMessageBox.prompt('请输入点位名称', '编辑点位名称', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  }).then(({ value }) => {
    const point = points.value.find(p => p.id === pointId)
    if (point) point.serial = value
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
  const point = points.value.find(p => p.id === pointId)
  ElMessage.info(`已选择点位 ${point?.serial}`)
  hideContextMenu()
}

function finishConnection(targetPointId: string) {
  if (!selectedPointForConnect.value || selectedPointForConnect.value === targetPointId) {
    ElMessage.warning('请选择不同的起始点和目标点')
    return
  }
  const existing = connections.value.find(conn =>
    conn.sourceId === selectedPointForConnect.value && conn.targetId === targetPointId
  )
  if (existing) {
    ElMessage.warning('该连线已存在')
    return
  }
  connections.value.push({ id: Date.now().toString(), sourceId: selectedPointForConnect.value, targetId })
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

    .mode-btn { background: #409eff; color: white; }
    .mode-btn.active { background: #67c23a; }
    .clear-btn { background: #f56c6c; color: white; }
    .animation-btn { background: #e6a23c; color: white; }
    .animation-btn.active { background: #67c23a; }
    .maptype-btn { background: #909399; color: white; }

    .mode-btn:hover, .clear-btn:hover, .animation-btn:hover:not(:disabled), .maptype-btn:hover {
      opacity: 0.8;
    }
  }

  .chart { width: 100%; height: 100%; }
}
</style>
