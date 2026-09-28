<script setup lang="ts">
import { VisArea, VisAxis, VisLine, VisXYContainer } from '@unovis/vue'
import { ChartContainer, ChartCrosshair, ChartTooltip, ChartTooltipContent, componentToString } from '@/components/ui/chart'
import type { MonteCarloPoint, ProjectionPoint } from '#shared/utils/projection'
import { compactMoney, money, monthLabel } from '@/lib/format'

const props = defineProps<{ points: ProjectionPoint[]; start: string; simulation?: MonteCarloPoint[] }>()
const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)']
const gradientId = `worth-gradient-${useId().replace(/:/g, '')}`
const svgDefs = `<linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--chart-1)" stop-opacity="0.38" /><stop offset="100%" stop-color="var(--chart-1)" stop-opacity="0.015" /></linearGradient>`
const config = { netWorth: { label: 'Net worth', color: colors[0] }, assets: { label: 'Assets', color: colors[1] }, debt: { label: 'Liabilities', color: colors[2] }, p10: { label: '10th percentile', color: colors[0] }, p25: { label: '25th percentile', color: colors[0] }, p50: { label: 'Median', color: colors[0] }, p75: { label: '75th percentile', color: colors[0] }, p90: { label: '90th percentile', color: colors[0] } }
const accessors = [(point: ProjectionPoint) => point.netWorth, (point: ProjectionPoint) => point.assets, (point: ProjectionPoint) => point.debt]
const domain = computed<[number, number]>(() => {
  const values = props.simulation
    ? props.simulation.flatMap(point => [point.p10, point.p90, props.points[point.month]?.netWorth ?? 0, 0])
    : props.points.flatMap(point => [point.netWorth, point.assets, point.debt, 0])
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const padding = Math.max((maximum - minimum) * 0.12, 100)
  return [minimum < 0 ? minimum - padding : 0, maximum + padding]
})
const tooltip = componentToString(config, ChartTooltipContent, { labelFormatter: value => monthLabel(Number(value), props.start) })
function tooltipTemplate(point: ProjectionPoint, position: number | Date) {
  return tooltip?.({ month: point.month, netWorth: money(point.netWorth, true), assets: money(point.assets, true), debt: money(point.debt, true) }, position) ?? ''
}
function simulationTooltipTemplate(point: MonteCarloPoint, position: number | Date) {
  return tooltip?.({ month: point.month, p10: money(point.p10, true), p25: money(point.p25, true), p50: money(point.p50, true), p75: money(point.p75, true), p90: money(point.p90, true) }, position) ?? ''
}
</script>

<template>
  <ChartContainer :config="config" class="forecast-chart" cursor role="img" :aria-label="simulation ? 'Monte Carlo net worth fan chart with 10th through 90th percentile ranges and a deterministic reference path.' : 'Monthly projection of net worth, assets, and liabilities. Values are also available in the annual table.'">
    <VisXYContainer :key="simulation ? 'simulation' : 'deterministic'" :data="simulation ?? points" :yDomain="domain" :svg-defs="svgDefs" :margin="{ top: 16, right: 12, bottom: 0, left: 0 }" :duration="0">
      <template v-if="simulation">
        <VisArea :x="(point: MonteCarloPoint) => point.month" :baseline="(point: MonteCarloPoint) => point.p10" :y="(point: MonteCarloPoint) => point.p90 - point.p10" :color="colors[0]" :opacity="0.16" />
        <VisArea :x="(point: MonteCarloPoint) => point.month" :baseline="(point: MonteCarloPoint) => point.p25" :y="(point: MonteCarloPoint) => point.p75 - point.p25" :color="colors[0]" :opacity="0.32" />
        <VisLine :x="(point: MonteCarloPoint) => point.month" :y="(point: MonteCarloPoint) => points[point.month]!.netWorth" color="var(--color-muted-foreground)" :lineWidth="1.5" :lineDashArray="[5, 4]" />
        <VisLine :x="(point: MonteCarloPoint) => point.month" :y="(point: MonteCarloPoint) => point.p50" :color="colors[0]" :lineWidth="2.5" />
      </template>
      <template v-else>
        <VisArea :x="(point: ProjectionPoint) => point.month" :y="(point: ProjectionPoint) => point.netWorth" :color="`url(#${gradientId})`" :opacity="1" />
        <VisLine v-if="domain[0] < 0" :x="(point: ProjectionPoint) => point.month" :y="() => 0" color="var(--color-muted-foreground)" :lineWidth="1" :lineDashArray="[4, 4]" />
        <VisLine :x="(point: ProjectionPoint) => point.month" :y="[accessors[1]!, accessors[2]!, accessors[0]!]" :color="[colors[1]!, colors[2]!, colors[0]!]" :lineWidth="2.5" />
      </template>
      <VisAxis type="x" :numTicks="5" :gridLine="false" :domainLine="false" :tickLine="false" :tickFormat="(value: number) => monthLabel(value, start)" :tickTextFitWidth="70" />
      <VisAxis type="y" :numTicks="5" :domainLine="false" :tickLine="false" :tickFormat="(value: number) => compactMoney(value)" />
      <ChartCrosshair :color="simulation ? [colors[0]!] : colors" :template="simulation ? simulationTooltipTemplate : tooltipTemplate" :hideWhenFarFromPointer="false" />
      <ChartTooltip />
    </VisXYContainer>
  </ChartContainer>
</template>
