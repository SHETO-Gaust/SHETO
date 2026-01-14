import { FinesTable } from "@/components/fines/fines-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mockFines } from "@/lib/data";

export default function FinesPage() {
  // In a real app, this data would be fetched from Supabase
  const fines = mockFines;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fines Management</CardTitle>
        <CardDescription>
          View and manage all fines issued to your unit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FinesTable data={fines} />
      </CardContent>
    </Card>
  );
}
