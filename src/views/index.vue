<template>
  <div class="map-box" style="width: 100vw; height: 100vh;">
    <!-- 工具栏 -->
    <div class="toolbar">
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
      <el-button :disabled="!points.length" @click="exportPoints">导出基站</el-button>
      <el-button @click="triggerImport">导入基站</el-button>
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

    <!-- 鼠标菜单栏 -->
    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
    >
      <div class="menu-item" @click="showAddPointDialog" v-if="contextMenu.action === 'add'">
        添加基站
      </div>
      <div v-if="contextMenu.action === 'delete'">
        <div class="menu-item" @click="deletePoint">
          删除基站
        </div>
        <div class="menu-item" @click="showEditPointDialog(contextMenu.targetPointId)">
          编辑基站
        </div>
      </div>
    </div>

    <!-- 基站添加/编辑对话框 -->
    <el-dialog
      v-model="pointDialog.visible"
      :title="pointDialog.isEdit ? '编辑基站' : '添加基站'"
      width="480px"
      :close-on-click-modal="false"
      :before-close="closePointDialog"
    >
      <el-form :model="pointDialog.form" label-position="top">
        <el-form-item label="基站名称" :rules="{required: true}">
          <el-input v-model="pointDialog.form.name" placeholder="请输入基站名称"></el-input>
        </el-form-item>
        <el-form-item label="连接自基站" v-if="points.length > 0">
          <el-select
            v-model="pointDialog.form.sourceId"
            placeholder="请选择连接来源基站"
            clearable
          >
            <el-option
              v-for="point in getAvailableSourcePoints()"
              :key="point.id"
              :label="point.serial.toString()"
              :value="point.id"
            ></el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closePointDialog">取消</el-button>
          <el-button type="primary" @click="confirmPointDialog">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'echarts/extension/bmap/bmap'

const BAIDU_AK = 'E4805d16520de693a3fe707cdc962045'

// 基站数据接口
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

// 基站与连线
const points = ref<Point[]>([])
const connections = ref<Connection[]>([])

// 状态
const isAnimationPlaying = ref(false)

// 基站对话框
const pointDialog = ref({
  visible: false,
  isEdit: false,
  editPointId: '',
  form: {
    name: '',
    sourceId: ''
  }
})

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
      center: [126.642464, 45.756967],
      zoom: 12,
      roam: true
    }
  }
  chart.setOption(option)
  updateChartOption()

  // ⚠️ 动态加载百度地图脚本
  loadBaiduMapScript()

  // 获取百度地图实例
  bmap = chart.getModel().getComponent('bmap').getBMap()

  // 初始禁用双击缩放
  bmap.disableDoubleClickZoom()

  // 确保每次 ECharts 渲染完成后仍然禁用
  chart.on('finished', () => {
    if (bmap) {
      bmap.disableDoubleClickZoom()
    }
  })

  // 右键：添加基站
  chart.getZr().on('contextmenu', handleRightClick)

  // 左键：编辑或关闭菜单
  chart.getZr().on('click', handleLeftClick)

  // 地图类型控件
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
      // 🔹 透明点击热区
      {
        name: 'points-hit-area',
        type: 'scatter',
        coordinateSystem: 'bmap',
        data: scatterData,
        symbol: 'circle',
        symbolSize: 40, // 点击范围大
        itemStyle: {
          color: 'rgba(255,255,255,0)' // 完全透明
        },
        emphasis: {
          itemStyle: {
            color: 'rgba(255,255,255,0)' // 悬停也透明
          }
        },
        // 为了保证点击优先触发这个 scatter
        z: 10
      },

      // 🔹 实际的基站图标
      {
        name: 'points',
        type: 'scatter',
        coordinateSystem: 'bmap',
        data: scatterData,
        symbol: 'image://wrj.svg',   // 用图片
        symbolSize: [40, 40],        // 图片大小
        z: 11,                       // 显示在透明热区上面
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => {
            const formatCoord = (num: number) => num.toFixed(3).padStart(7, '0')
            const lng = formatCoord(params.data.value[0])
            const lat = formatCoord(params.data.value[1])
            return `${params.data.name}\n经度：${lng}\n纬度：${lat}`
          },
          color: '#000',
          fontSize: 14,
          fontWeight: 'bold',
          lineHeight: 20,
          align: 'left',
          backgroundColor: '#fffbe6', // 整个 label 作为一个背景
          padding: [6, 10],
          borderRadius: 6,
          borderColor: '#ff9900',
          borderWidth: 1
        }
      },

      // 🔹 连线
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

      // 🔹 无人机动画
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
  // 如果强制清空标记开启，则只返回空数组一次
  if (forceClearConnections.value) {
    forceClearConnections.value = false  // 🔹 清空后立刻恢复
    return []
  }

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
      lineData.push({
        coords: [[sorted[i].lng, sorted[i].lat], [sorted[i + 1].lng, sorted[i + 1].lat]]
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

// 右键点击 → 添加基站
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

// 左键点击 → 编辑基站 or 关闭菜单
function handleLeftClick(event: any) {
  if (!chart) return
  const pixel = [event.offsetX, event.offsetY]
  const coord = chart.convertFromPixel({ bmapIndex: 0 }, pixel)
  if (!coord) return

  const clickedPoint = findPointAtPosition(coord[0], coord[1])

  if (clickedPoint) {
    // 点击已有基站 → 编辑/删除
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

// 显示添加基站对话框
function showAddPointDialog() {
  pointDialog.value.isEdit = false
  pointDialog.value.editPointId = ''
  pointDialog.value.form.name = ''

  // 默认选择上一个基站作为连接源
  if (points.value.length > 0) {
    const lastPoint = points.value[points.value.length - 1]
    pointDialog.value.form.sourceId = lastPoint.id
  } else {
    pointDialog.value.form.sourceId = ''
  }

  pointDialog.value.visible = true
  hideContextMenu()
}

// 显示编辑基站对话框
function showEditPointDialog(pointId: string) {
  const point = points.value.find(p => p.id === pointId)
  if (!point) return

  pointDialog.value.isEdit = true
  pointDialog.value.editPointId = pointId
  pointDialog.value.form.name = point.serial.toString()

  // 查找是否有连接到此点的连线
  const connection = connections.value.find(c => c.targetPointId === pointId)
  pointDialog.value.form.sourceId = connection ? connection.sourceId : ''

  pointDialog.value.visible = true
  hideContextMenu()
}

// 关闭基站对话框
function closePointDialog() {
  pointDialog.value.visible = false
}

// 确认基站对话框
function confirmPointDialog() {
  if (!pointDialog.value.form.name.trim()) {
    ElMessage.warning('请输入基站名称')
    return
  }

  if (pointDialog.value.isEdit) {
    // 编辑基站
    const point = points.value.find(p => p.id === pointDialog.value.editPointId)
    if (point) {
      point.serial = pointDialog.value.form.name

      // 处理连线
      handleConnectionChange(pointDialog.value.editPointId, pointDialog.value.form.sourceId)
    }
  } else {
    // 添加基站
    const newPoint = {
      id: Date.now().toString(),
      serial: pointDialog.value.form.name,
      lng: contextMenu.value.clickCoord[0],
      lat: contextMenu.value.clickCoord[1]
    }
    points.value.push(newPoint)

    // 处理连线
    if (pointDialog.value.form.sourceId) {
      handleConnectionChange(newPoint.id, pointDialog.value.form.sourceId)
    }
  }

  // 如果动画正在播放，先停止动画再更新图表，避免残留轨迹
  if (isAnimationPlaying.value) {
    isAnimationPlaying.value = false
    updateChartOption()
    setTimeout(() => {
      isAnimationPlaying.value = true
      updateChartOption()
    }, 100)
  } else {
    updateChartOption()
  }

  closePointDialog()
}

// 处理连线变更
function handleConnectionChange(targetPointId: string, sourceId: string) {
  // 先移除已有的连接到此点的连线
  const existingConnIdx = connections.value.findIndex(c => c.targetPointId === targetPointId)
  if (existingConnIdx !== -1) {
    connections.value.splice(existingConnIdx, 1)
  }

  // 如果选择了源基站，则添加新连线
  if (sourceId) {
    connections.value.push({
      id: Date.now().toString(),
      sourceId: sourceId,
      targetPointId: targetPointId
    })
  }
}

// 获取可用的连接源基站
function getAvailableSourcePoints() {
  if (!pointDialog.value.isEdit) {
    // 添加基站时，所有现有基站都可以作为源
    return points.value
  } else {
    // 编辑基站时，除了当前基站外的所有基站都可以作为源
    return points.value.filter(p => p.id !== pointDialog.value.editPointId)
  }
}

function deletePoint() {
  const idx = points.value.findIndex(p => p.id === contextMenu.value.targetPointId)
  if (idx !== -1) points.value.splice(idx, 1)

  // 删除相关的连线
  connections.value = connections.value.filter(c =>
    c.sourceId !== contextMenu.value.targetPointId &&
    c.targetPointId !== contextMenu.value.targetPointId
  )

  updateChartOption()
  hideContextMenu()
}

// 新增标记
const forceClearConnections = ref(false)

// 清除所有连线
function clearAllConnections() {
  connections.value.splice(0, connections.value.length)
  forceClearConnections.value = true   // 标记已强制清空
  updateChartOption()
  ElMessage.success('已清除所有连线')
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
