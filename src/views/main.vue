<template>
    <div style="width: 100vw; height: 100vh;">
        <div ref="chartRef" class="chart"></div>
    </div>
  </template>
  <script setup lang="ts">
  import { ref, onMounted, computed } from 'vue'
  import * as echarts from 'echarts'
  import 'echarts/extension/bmap/bmap'

  // 示例 ak（仅测试用，建议换成你自己的 ak）
  const BAIDU_AK = 'E4805d16520de693a3fe707cdc962045'

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

// 点位数据管理
const points = ref<Point[]>([])

const edges = computed(() =>
  points.value.slice(0, -1).map((p, i) => ({
    source: p.id,
    target: points.value[i + 1].id,
  }))
)

const graphData = computed(() =>
  points.value.map(p => ({
    name: p.id,
    value: [p.lng, p.lat]
  }))
)

const chartRef = ref(null)
let chart: echarts.ECharts | null = null   // ⚡ 在外层定义 chart
onMounted(async () => {
  chart = echarts.init(chartRef.value)

  // 注册 geojson
  const geoJSON = await loadGeoJSON()
  echarts.registerMap('customGeo', geoJSON)

  // 添加点击事件监听
  chart.on('click', handleChartClick)

  const option = {
    bmap: {
      center: [127.9700, 45.4000],
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
    },
    series: [
      {
        type: 'map',
        map: 'customGeo',
        roam: true,
        geoIndex: 0,
        itemStyle: {
          areaColor: 'rgba(0, 128, 255, 0.4)',
          borderColor: '#333',
        },
        emphasis: {
          itemStyle: {
            areaColor: 'rgba(255, 128, 0, 0.6)',
          },
        },
      },
      {
        type: 'graph',
        coordinateSystem: 'bmap',
        data: graphData.value,
        edges: edges.value,
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 5,
        lineStyle: {
          color: '#718adbff',
          opacity: 1
        }
      }
    ],
  }

  chart.setOption(option)

  // ⚠️ 动态加载百度地图脚本
  loadBaiduMapScript()
})

// 处理图表点击事件
function handleChartClick(params: any) {
  if (!chart) return
  const pixel = [params.event.offsetX, params.event.offsetY]
  const coord = chart.convertFromPixel({ bmapIndex: 0 }, pixel)
  points.value.push({
    id: new Date().toString(),
    serial: points.value.length,
    lng: coord[0],
    lat: coord[1]
  })
  console.log('点击经纬度:', coord)
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
  .chart {
    width: 100%;
    height: 100%;
  }
  </style>
