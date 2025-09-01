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

  // 加载百度地图
  async function loadGeoJSON(): Promise<any> {
    const res = await fetch('/haerbin.json')
    const geoJSON = await res.json()
    return geoJSON
  }

  // 点位数据接口
  interface Point {
    id: string
    serial: number // 序号
    lng: number // 经度
    lat: number // 维度
  }

  // 连线数据接口
  interface Connection {
    id: string
    sourceId: string
    targetId: string
  }

  // 点位数据管理
  const points = ref<Point[]>([])
  // 连线数据管理
  const connections = ref<Connection[]>([])
  // 连线模式状态
  const isConnectMode = ref(false)
  const selectedPointForConnect = ref<string | null>(null)
  // 动画状态
  const isAnimationPlaying = ref(false)

  // 菜单和对话框状态
  const contextMenu = ref({
    visible: false,
    x: 0,
    y: 0,
    action: 'add' as 'add' | 'delete',
    targetPointId: '',
    clickCoord: [0, 0] as [number, number]
  })

  const chartRef = ref(null)
  let chart: echarts.ECharts | null = null   // ⚡ 在外层定义 chart
  onMounted(async () => {
    chart = echarts.init(chartRef.value)

    // 注册 geojson
    const geoJSON = await loadGeoJSON()
    echarts.registerMap('customGeo', geoJSON)

    // 添加左键点击事件监听（显示菜单）
    chart.getZr().on('click', handleLeftClick)

    const option = {
      bmap: {
        center: [127.9999, 45.3890], // 增大向左 增大向下
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

    // 初始化图表选项
    updateChartOption()

    // ⚠️ 动态加载百度地图脚本
    loadBaiduMapScript()

    // 获取百度地图实例
    let bmap: any = null
    bmap = chart.getModel().getComponent('bmap').getBMap()

    // 禁用百度地图的所有直接交互事件
    bmap.disableDoubleClickZoom()
    bmap.disableDragging()
    bmap.disableScrollWheelZoom()
    bmap.disablePinchToZoom()
    bmap.disableKeyboard()
    bmap.disableInertialDragging()
    bmap.disableContinuousZoom()

    // 移除所有控件以避免直接交互
    bmap.removeControl(bmap.getContainer().querySelector('.BMap_stdMpCtrl'))
    bmap.removeControl(bmap.getContainer().querySelector('.BMap_scaleCtrl'))
    bmap.removeControl(bmap.getContainer().querySelector('.BMap_cpyCtrl'))
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
          itemStyle: {
            color: '#ff0000'
          },
          label: {
            show: true,
            position: 'inside',
            color: '#fff',
            fontSize: 12,
            fontWeight: 'bold',
            formatter: function(params: any) {
              return params.data.name
            }
          }
        },
        {
          name: 'lines',
          type: 'lines',
          coordinateSystem: 'bmap',
          data: lineData,
          lineStyle: {
            color: '#ff0000',
            width: 2
          },
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
          lineStyle: {
            opacity: 0
          },
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

    // 如果有自定义连线，使用自定义连线
    if (connections.value.length > 0) {
      connections.value.forEach(conn => {
        const sourcePoint = points.value.find(p => p.id === conn.sourceId)
        const targetPoint = points.value.find(p => p.id === conn.targetId)
        if (sourcePoint && targetPoint) {
          lineData.push({
            coords: [
              [sourcePoint.lng, sourcePoint.lat],
              [targetPoint.lng, targetPoint.lat]
            ]
          })
        }
      })
    } else {
      // 否则使用默认的顺序连线
      const sortedPoints = [...points.value].sort((a, b) => a.serial - b.serial)
      for (let i = 0; i < sortedPoints.length - 1; i++) {
        lineData.push({
          coords: [
            [sortedPoints[i].lng, sortedPoints[i].lat],
            [sortedPoints[i + 1].lng, sortedPoints[i + 1].lat]
          ]
        })
      }
    }

    return lineData
  }

  // 处理左键点击事件（显示菜单）
  function handleLeftClick(event: any) {
    // event.preventDefault()

    if (!chart) return

    const pixel = [event.offsetX, event.offsetY]
    const coord = chart.convertFromPixel({ bmapIndex: 0 }, pixel)
    console.log(coord)
    if (!coord) return

    // 检查是否点击在已有点位上
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

  // 查找指定位置的点位
  function findPointAtPosition(lng: number, lat: number, threshold = 0.01) {
    return points.value.find(point =>
      Math.abs(point.lng - lng) < threshold &&
      Math.abs(point.lat - lat) < threshold
    )
  }

  // 隐藏菜单
  function hideContextMenu() {
    contextMenu.value.visible = false
  }

  // 添加点位
  function addPoint() {
    ElMessageBox.prompt('请输入点位名称', '添加点位', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
      .then(({ value }) => {
        const newPoint: Point = {
          id: Date.now().toString(),
          serial: value,
          lng: contextMenu.value.clickCoord[0],
          lat: contextMenu.value.clickCoord[1]
        }
        points.value.push(newPoint)
        updateChartOption()
        hideContextMenu()
      })
      .catch(() => {})
  }

// 删除点位
function deletePoint() {
  const index = points.value.findIndex(p => p.id === contextMenu.value.targetPointId)
  if (index !== -1) {
    points.value.splice(index, 1)
    updateChartOption()
  }
  hideContextMenu()
}

// 编辑序号
function editSerial(pointId: string) {
  ElMessageBox.prompt('请输入点位名称', '编辑点位名称', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
      .then(({ value }) => {
        const point = points.value.find(p => p.id === pointId)
        if (point) {
          point.serial = value
        }
        updateChartOption()
        hideContextMenu()
      })
      .catch(() => {})
}

  // 切换连线模式
  function toggleConnectMode() {
    console.log('qiehuan');

    isConnectMode.value = !isConnectMode.value
    selectedPointForConnect.value = null
    if (isConnectMode.value) {
      ElMessage.info('已进入连线模式，右键点击点位开始连线')
    } else {
      ElMessage.info('已退出连线模式')
    }
  }

  // 清除所有连线
  function clearAllConnections() {
    connections.value = []
    updateChartOption()
    ElMessage.success('已清除所有连线')
  }

  // 开始连线
  function startConnection(pointId: string) {
    selectedPointForConnect.value = pointId
    const point = points.value.find(p => p.id === pointId)
    ElMessage.info(`已选择点位 ${point?.serial}，请右键点击目标点位完成连线`)
    hideContextMenu()
  }

  // 完成连线
  function finishConnection(targetPointId: string) {
    if (!selectedPointForConnect.value || selectedPointForConnect.value === targetPointId) {
      ElMessage.warning('请选择不同的起始点和目标点')
      return
    }

    // 检查是否已存在相同的连线
    const existingConnection = connections.value.find(conn =>
      conn.sourceId === selectedPointForConnect.value && conn.targetId === targetPointId
    )

    if (existingConnection) {
      ElMessage.warning('该连线已存在')
      return
    }

    // 添加新连线
    const newConnection: Connection = {
      id: Date.now().toString(),
      sourceId: selectedPointForConnect.value,
      targetId: targetPointId
    }

    connections.value.push(newConnection)
    updateChartOption()

    const sourcePoint = points.value.find(p => p.id === selectedPointForConnect.value)
    const targetPoint = points.value.find(p => p.id === targetPointId)
    ElMessage.success(`已连接点位 ${sourcePoint?.serial} 到点位 ${targetPoint?.serial}`)

    selectedPointForConnect.value = null
    hideContextMenu()
  }

  // 切换动画状态
  function toggleAnimation() {
    isAnimationPlaying.value = !isAnimationPlaying.value
    updateChartOption()
    if (isAnimationPlaying.value) {
      ElMessage.success('无人机动画已开始')
    } else {
      ElMessage.info('无人机动画已停止')
    }
  }

  function loadBaiduMapScript() {
    if (document.getElementById('baidu-map')) return
    const script = document.createElement('script')
    script.id = 'baidu-map'
    script.type = 'text/javascript'
    script.src = `https://api.map.baidu.com/api?v=3.0&ak=${BAIDU_AK}&__ec_v__=20190126`
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

    .mode-btn, .clear-btn, .animation-btn {
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
