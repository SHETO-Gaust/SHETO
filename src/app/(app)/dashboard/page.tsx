import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ReceiptText, CalendarCheck, DollarSign } from "lucide-react"
import { OverviewChart } from "@/components/dashboard/overview-chart"

export default function DashboardPage() {
  // In a real app, this data would be fetched from Supabase
  const totalFinesValue = 225.50;
  const upcomingReservationsCount = 2;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Fines (Unpaid)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalFinesValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">From 2 active fines</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Reservations</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{upcomingReservationsCount}</div>
            <p className="text-xs text-muted-foreground">In the next 30 days</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3 New Items</div>
            <p className="text-xs text-muted-foreground">1 fine, 2 notifications this week</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>A summary of recent condominium activities.</CardDescription>
        </CardHeader>
        <CardContent>
           <OverviewChart />
        </CardContent>
      </Card>
    </div>
  )
}
