import { notFound } from 'next/navigation';
import { getDetailedParticipationReport } from '../actions';
import { RelatorioDetalhadoClient } from './_components/relatorio-detalhado-client';

export const dynamic = 'force-dynamic';

export default async function RelatorioDetalhesPage({ params }: { params: { id: string } }) {
    const reportData = await getDetailedParticipationReport(params.id);

    if (!reportData) {
        notFound();
    }
    
    return <RelatorioDetalhadoClient formacao={reportData.formacao} participants={reportData.participants} />;
}
