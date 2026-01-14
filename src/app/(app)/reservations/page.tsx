import { ReservationsCalendar } from "@/components/reservations/reservations-calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mockReservations } from "@/lib/data";

export default function ReservationsPage() {
  // In a real app, this data would be fetched from Supabase
  const reservations = mockReservations;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reservas da Área Gourmet</CardTitle>
        <CardDescription>
          Selecione uma data para reservar a área gourmet. As datas reservadas estão marcadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <ReservationsCalendar existingReservations={reservations} />
      </CardContent>
    </Card>
  );
}
