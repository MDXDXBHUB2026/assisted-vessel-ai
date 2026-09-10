import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export interface StreamingChartProps {
  values: number[]
  color?: string
  height?: number
  unit?: string
  baseline?: number
  thresholdMin?: number
  thresholdMax?: number
  /** Indices into `values` that should render as an anomaly marker (e.g. samples above a limit). */
  anomalyIndices?: number[]
}

/**
 * A genuine streaming time-series chart: new samples enter from the right and historical values
 * shift left, with an optional baseline line, a threshold band, and anomaly markers — the
 * engineering-telemetry equivalent of a real condition-monitoring trend display, not a static
 * business line chart.
 */
export function StreamingChart({ values, color = '#5BC0BE', height = 120, unit = '', baseline, thresholdMin, thresholdMax, anomalyIndices = [] }: StreamingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const markLineData: object[] = []
    if (baseline !== undefined) markLineData.push({ yAxis: baseline, label: { formatter: `baseline ${baseline}${unit}`, color: '#94a3b8', fontSize: 9 }, lineStyle: { color: '#5c7096', type: 'dashed' } })

    const markAreaData: [object, object][] = []
    if (thresholdMin !== undefined || thresholdMax !== undefined) {
      markAreaData.push([
        { yAxis: thresholdMax ?? 1e9, itemStyle: { color: 'rgba(240, 71, 58, 0.08)' } },
        { yAxis: thresholdMin ?? -1e9 },
      ])
    }

    const markPointData = anomalyIndices.map((i) => ({ coord: [i, values[i] ?? 0], itemStyle: { color: '#f0473a' }, symbolSize: 8 }))

    chart.setOption(
      {
        animation: false,
        grid: { left: 36, right: 10, top: 10, bottom: 18 },
        xAxis: { type: 'category', data: values.map((_, i) => i), show: false, boundaryGap: false },
        yAxis: { type: 'value', axisLabel: { fontSize: 9, color: '#94a3b8' }, splitLine: { lineStyle: { color: '#29365a' } } },
        tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${(v as number).toFixed(2)} ${unit}`, backgroundColor: '#1c2541', borderColor: '#29365a', textStyle: { color: '#e2e8f0', fontSize: 11 } },
        series: [
          {
            type: 'line',
            data: values,
            showSymbol: false,
            smooth: 0.2,
            lineStyle: { color, width: 1.5 },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}55` }, { offset: 1, color: `${color}00` }] } },
            markLine: markLineData.length > 0 ? { symbol: 'none', data: markLineData } : undefined,
            markArea: markAreaData.length > 0 ? { data: markAreaData } : undefined,
            markPoint: markPointData.length > 0 ? { data: markPointData } : undefined,
          },
        ],
      },
      true,
    )
  }, [values, color, unit, baseline, thresholdMin, thresholdMax, anomalyIndices])

  return <div ref={containerRef} style={{ height, width: '100%' }} />
}
