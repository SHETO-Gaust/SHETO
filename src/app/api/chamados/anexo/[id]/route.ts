import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guards';
import { buscarAnexo } from '@/lib/suporte/chamados-db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serve a foto anexada a um chamado. So o admin e quem abriu o chamado veem.
 * As fotos moram no banco (bytea); nao ha URL publica para elas.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  let perfil;
  try {
    perfil = await requireAuth();
  } catch {
    return new NextResponse('Não autenticado', { status: 401 });
  }

  const anexo = await buscarAnexo(id);
  if (!anexo || (perfil.role !== 'admin' && anexo.chamado_user_id !== perfil.id)) {
    return new NextResponse('Não encontrado', { status: 404 });
  }

  return new NextResponse(new Uint8Array(anexo.dados), {
    headers: {
      'Content-Type': anexo.mime,
      'Content-Disposition': `inline; filename="${anexo.nome.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
