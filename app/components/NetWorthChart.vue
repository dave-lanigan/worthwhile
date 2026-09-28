<script setup lang="ts">
import { VisArea, VisAxis, VisLine, VisXYContainer } from '@unovis/vue'
import { ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent, componentToString } from '@/components/ui/chart'
import type { ProjectionPoint } from '#shared/utils/projection'
import { compactMoney, money, monthLabel } from '@/lib/format'

const props = defineProps<{ points: ProjectionPoint[]; start: string }>()
const colors = ['#087f73', '#356fbd', '#bc4b51']
const config = { netWorth: { label: 'Net worth', color: colors[0] }, assets: { label: 'Assets', color: colors[1] }, debt: { label: 'Liabilities', color: colors[2] } }
const accessors = [(point: ProjectionPoint) => point.netWorth, (point: ProjectionPoint) => point.assets, (point: ProjectionPoint) => point.debt]
const domain = computed<[number, number]>(() => {
  const values = props.points.flatMap(point => [point.netWorth, point.assets, point.debt, 0])
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const padding = Math.max((maximum - minimum) * 0.12, 100)
  return [minimum < 0 ? minimum - padding : 0, maximum + padding]
})
const tooltip = componentToString(config, ChartTooltipContent, { labelFormatter: value => monthLabel(Number(value), props.start) })
function tooltipTemplate(point: ProjectionPoint, position: number | Date) {
  return tooltip?.({ month: point.month, netWorth: money(point.netWorth, true), assets: money(point.assets, true), debt: money(point.debt, true) }, position) ?? ''
}
</script>

<template>
  <ChartContainer :config="config" class="forecast-chart" cursor role="img" aria-label="Monthly projection of net worth, assets, and liabilities. Values are also available in the annual table.">
    <VisXYContainer :data="points" :height="300" :yDomain="domain" :margin="{ top: 18, right: 12, bottom: 0, left: 0 }" :duration="0">
      <VisArea :x="(point: ProjectionPoint) => point.month" :y="(point: ProjectionPoint) => point.netWorth" color="#087f73" :opacity="0.06" />
      <VisLine :x="(point: ProjectionPoint) => point.month" :y="() => 0" color="#aab7bb" :lineWidth="1" :lineDashArray="[4, 4]" />
      <VisLine :x="(point: ProjectionPoint) => point.month" :y="accessors" :color="colors" :lineWidth="2.5" />
      <VisAxis type="x" :numTicks="5" :gridLine="false" :tickFormat="(value: number) => monthLabel(value, start)" :tickTextFitWidth="70" />
      <VisAxis type="y" :numTicks="5" :domainLine="false" :tickLine="false" :tickFormat="(value: number) => compactMoney(value)" />
      <ChartCrosshair :color="colors" :template="tooltipTemplate" :hideWhenFarFromPointer="false" />
      <ChartTooltip />
    </VisXYContainer>
  </ChartContainer>
</template>