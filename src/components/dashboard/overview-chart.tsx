"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { ChartTooltipContent, ChartContainer, type ChartConfig } from "@/components/ui/chart"

const data = [
  {
    name: "Jan",
    fines: Math.floor(Math.random() * 500) + 100,
    reservations: Math.floor(Math.random() * 10) + 1,
  },
  {
    name: "Feb",
    fines: Math.floor(Math.random() * 500) + 100,
    reservations: Math.floor(Math.random() * 10) + 1,
  },
  {
    name: "Mar",
    fines: Math.floor(Math.random() * 500) + 100,
    reservations: Math.floor(Math.random() * 10) + 1,
  },
  {
    name: "Apr",
    fines: Math.floor(Math.random() * 500) + 100,
    reservations: Math.floor(Math.random() * 10) + 1,
  },
  {
    name: "May",
    fines: Math.floor(Math.random() * 500) + 100,
    reservations: Math.floor(Math.random() * 10) + 1,
  },
  {
    name: "Jun",
    fines: Math.floor(Math.random() * 500) + 100,
    reservations: Math.floor(Math.random() * 10) + 1,
  },
  {
    name: "Jul",
    fines: Math.floor(Math.random() * 500) + 100,
    reservations: Math.floor(Math.random() * 10) + 1,
  },
]

const chartConfig = {
  fines: {
    label: "Multas",
    color: "hsl(var(--primary))",
  },
  reservations: {
    label: "Reservas",
    color: "hsl(var(--accent))",
  },
} satisfies ChartConfig

export function OverviewChart() {
  return (
    <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
        <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data}>
            <XAxis
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            />
            <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${value}`}
            />
            <Tooltip
                content={<ChartTooltipContent />}
                cursor={{ fill: 'hsl(var(--secondary))' }}
            />
            <Bar dataKey="fines" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="reservations" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
        </BarChart>
        </ResponsiveContainer>
    </ChartContainer>
  )
}
