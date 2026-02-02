'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ReportPlaceholder({ data, title }: { data: any, title: string }) {
  return (
    <Card>
        <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>Este relatório está em construção.</CardDescription>
        </CardHeader>
        <CardContent>
            <pre className="bg-muted p-4 rounded-md text-xs overflow-auto">
                {JSON.stringify(data, null, 2)}
            </pre>
        </CardContent>
    </Card>
  );
}
