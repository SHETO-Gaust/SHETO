import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, CheckCircle, Info, XCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import type { Profile } from "@/lib/types"

// Mock data based on the new schema
const formacoes = [
  {
    id: '1',
    name: 'FORMAÇÃO PROFE LÍDERES - COORDENADOR PEDAGÓGICO',
    nextDate: '20 de janeiro de 2026',
    status: 'Em andamento',
    pendenciasGFCPE: [
      { name: 'Detalhes da Inscrição', done: false },
      { name: 'Formadores', done: false },
      { name: 'Ensalamento', done: false },
    ],
    pendenciasGADSG: [
        { name: 'Inscrição', done: false },
        { name: 'Frequência', done: true },
        { name: 'Drive dos Materiais', done: false },
        { name: 'Avaliação', done: false },
    ]
  },
  {
    id: '2',
    name: 'FORMAÇÃO PROFE LÍDERES - CIÊNCIAS HUMANAS',
    nextDate: '20 de janeiro de 2026',
    status: 'Próxima',
    pendenciasGFCPE: [
      { name: 'Detalhes da Inscrição', done: false },
      { name: 'Formadores', done: true },
      { name: 'Ensalamento', done: false },
    ],
    pendenciasGADSG: [
        { name: 'Inscrição', done: false },
        { name: 'Frequência', done: false },
        { name: 'Drive dos Materiais', done: false },
        { name: 'Avaliação', done: false },
    ]
  },
    {
    id: '3',
    name: 'FORMAÇÃO PROFE LÍDERES - CIÊNCIAS DA NATUREZA',
    nextDate: '20 de janeiro de 2026',
    status: 'Próxima',
    pendenciasGFCPE: [
      { name: 'Detalhes da Inscrição', done: false },
      { name: 'Formadores', done: false },
      { name: 'Ensalamento', done: false },
    ],
    pendenciasGADSG: [
        { name: 'Inscrição', done: false },
        { name: 'Frequência', done: false },
        { name: 'Drive dos Materiais', done: false },
        { name: 'Avaliação', done: false },
    ]
  },
];


export default async function DashboardPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  let userProfile: Profile | null = null;
  let displayName = "Usuário";

  if (user) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    userProfile = profileData;
    displayName = userProfile?.name || user.email || "Usuário";
  }


  const PendencyItem = ({ name, done }: { name: string, done: boolean }) => (
    <div className="flex items-center gap-2">
      {done ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
      <span className="text-sm text-muted-foreground">{name}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {displayName}!</h1>
        <p className="text-muted-foreground">Bem-vindo(a) ao painel Gerenciamento de Formações.</p>
      </div>

      <div className="space-y-2">
          <h2 className="text-xl font-semibold">Próximas Formações e Status</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {formacoes.map((formacao) => (
          <Card key={formacao.id} className={formacao.status === 'Em andamento' ? 'border-primary border-2' : ''}>
            <CardHeader>
              <CardTitle>{formacao.name}</CardTitle>
              <CardDescription className="flex items-center gap-2 pt-2">
                <Calendar className="h-4 w-4" />
                Próxima data: {formacao.nextDate}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <h4 className="font-semibold text-sm mb-2">Pendências GFCPE</h4>
                    <div className="space-y-1">
                        {formacao.pendenciasGFCPE.map(p => <PendencyItem key={p.name} {...p}/>)}
                    </div>
                </div>
                 <div>
                    <h4 className="font-semibold text-sm mb-2">Pendências GADSG</h4>
                    <div className="space-y-1">
                        {formacao.pendenciasGADSG.map(p => <PendencyItem key={p.name} {...p}/>)}
                    </div>
                </div>

              <Button variant="outline" className="w-full">
                <Info className="mr-2 h-4 w-4" />
                Detalhes
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
