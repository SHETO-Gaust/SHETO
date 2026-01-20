import { notFound } from 'next/navigation';
import { getAvaliacaoDetails } from '../actions';
import { AvaliacaoDashboard } from './avaliacao-dashboard';

export default async function AvaliacaoDetalhesPage({ params }: { params: { id: string } }) {
    const details = await getAvaliacaoDetails(params.id);

    if (!details) {
        notFound();
    }
    
    return <AvaliacaoDashboard details={details} />;
}
