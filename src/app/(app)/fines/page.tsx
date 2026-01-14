import { FinesTable } from "@/components/fines/fines-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mockFines } from "@/lib/data";

export default function FinesPage() {
  // In a real app, this data would be fetched from Supabase
  const fines = mockFines;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gerenciamento de Multas</CardTitle>
        <CardDescription>
          Visualize e gerencie todas as multas emitidas para sua unidade.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FinesTable data={fines} />
      </CardContent>
    </Card>
  );
}
