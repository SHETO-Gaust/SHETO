import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AccessDenied } from '@/components/access-denied';
import { Button } from '@/components/ui/button';
import { requireAuth } from '@/lib/auth/guards';
import { buscarChamado } from '@/lib/suporte/chamados-db';
import { nomeDaTela } from '@/lib/suporte/conhecimento';
import { ResponderChamadoClient } from './responder-chamado-client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Destino do botao "Responder chamado" do e-mail enviado ao suporte. */
export default async function ChamadoPage({ params }: { params: Promise<{ id: string }> }) {
  // Deslogado, o layout ja redireciona para o login (com volta para ca).
  const perfil = await requireAuth().catch(() => null);
  if (!perfil) return null;
  if (perfil.role !== 'admin') return <AccessDenied />;

  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const encontrado = await buscarChamado(id);
  if (!encontrado) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/chamados">
          <ArrowLeft className="mr-1 h-4 w-4" /> Todos os chamados
        </Link>
      </Button>
      <ResponderChamadoClient
        chamado={encontrado.chamado}
        anexos={encontrado.anexos}
        tela={nomeDaTela(encontrado.chamado.rota)}
      />
    </div>
  );
}
