import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/access-denied';
import { requireAuth } from '@/lib/auth/guards';
import { listarChamados } from '@/lib/suporte/chamados-db';
import { ChamadosClient } from './chamados-client';

export default async function ChamadosPage() {
  // O layout ja troca a tela por AccessDenied, mas a pagina roda mesmo assim:
  // sem esta checagem a consulta abaixo sairia para qualquer usuario.
  // Deslogado, o layout ja redireciona para o login; aqui so nao vale estourar erro.
  const perfil = await requireAuth().catch(() => null);
  if (!perfil) return null;
  if (perfil.role !== 'admin') return <AccessDenied />;

  const chamados = await listarChamados();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Chamados de Suporte</CardTitle>
          <CardDescription>
            Pedidos de ajuda e relatos de erro abertos pelo botão &quot;Suporte&quot;. A resposta aparece para o usuário
            dentro do sistema, uma única vez, e também por e-mail.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <ChamadosClient chamados={chamados} />
        </CardContent>
      </Card>
    </div>
  );
}
