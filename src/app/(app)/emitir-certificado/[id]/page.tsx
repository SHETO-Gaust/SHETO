import { notFound } from 'next/navigation';
import * as actions from '../actions';
import { CertificateConfigClient } from './_components/certificate-config-client';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function CertificadoConfigPage({ params }: { params: { id: string } }) {
    const formacao = await actions.getFormationForCertificateConfig(params.id);

    if (!formacao) {
        notFound();
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Configurar Certificado</CardTitle>
                    <CardDescription>
                        Defina o layout e conteúdo do certificado para a formação: <span className="font-semibold">{formacao.name}</span>.
                    </CardDescription>
                </CardHeader>
            </Card>
            <CertificateConfigClient formacao={formacao} />
        </div>
    );
}
