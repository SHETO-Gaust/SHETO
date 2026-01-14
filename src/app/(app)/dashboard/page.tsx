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
            <CardTitle className="text-sm font-medium">Total de Multas (Não Pagas)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalFinesValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">De 2 multas ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximas Reservas</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{upcomingReservationsCount}</div>
            <p className="text-xs text-muted-foreground">Nos próximos 30 dias</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atividade Recente</CardTitle>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3 Novos Itens</div>
            <p className="text-xs text-muted-foreground">1 multa, 2 notificações esta semana</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visão Geral</CardTitle>
          <CardDescription>Um resumo das atividades recentes do condomínio.</CardDescription>
        </CardHeader>
        <CardContent>
           <OverviewChart />
        </CardContent>
      </Card>
    </div>
  )
}
