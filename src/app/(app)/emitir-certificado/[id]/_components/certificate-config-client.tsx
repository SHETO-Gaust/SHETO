'use client';

import { useState } from 'react';
import type { Formacao } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, FileImage, FileText, Lock, Save, Info } from 'lucide-react';
import { saveCertificateConfig } from '../../actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RichTextEditor } from '@/components/rich-text-editor';

export function CertificateConfigClient({ formacao }: { formacao: Formacao }) {
    const { toast } = useToast();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState(formacao.certificate_config || {
        capa: {
            text: 'Certificamos que {nome_completo} (CPF nº {cpf}) concluiu com êxito o curso "{formacao_name}", com carga horária de XX horas.\n\nPalmas, {data_emissao}.',
            width: 29.7,
            height: 21,
            text_x: 1.5,
            text_y: 9.5,
        },
        verso: {
            text: '',
            text_x: 1.5,
            text_y: 1.5,
        }
    });

    const handleCapaChange = (field: string, value: any) => {
        setConfig((prev: any) => ({ ...prev, capa: { ...prev.capa, [field]: value } }));
    };

    const handleVersoChange = (field: string, value: any) => {
        setConfig((prev: any) => ({ ...prev, verso: { ...prev.verso, [field]: value } }));
    };

    const handleSave = async () => {
        setLoading(true);
        const result = await saveCertificateConfig(formacao.id, config);
        setLoading(false);
        if (result.error) {
            toast({ title: "Erro ao Salvar", description: result.error, variant: 'destructive' });
        } else {
            toast({ title: "Configuração Salva!", description: "O modelo de certificado foi salvo com sucesso." });
            router.refresh();
        }
    };
    
    const availablePlaceholders = ['{nome_completo}', '{cpf}', '{email}', '{regional}', '{escola}', '{formacao_name}', '{data_emissao}'];


    return (
        <div className="space-y-6">
            <Tabs defaultValue="capa">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="capa"><FileImage className="mr-2 h-4 w-4" />Capa do Certificado</TabsTrigger>
                    <TabsTrigger value="verso"><FileText className="mr-2 h-4 w-4" />Verso do Certificado</TabsTrigger>
                    <TabsTrigger value="autenticacao" disabled><Lock className="mr-2 h-4 w-4" />Autenticação</TabsTrigger>
                </TabsList>
                
                <TabsContent value="capa">
                    <Card>
                        <CardHeader>
                            <CardTitle>Design da Capa</CardTitle>
                            <CardDescription>Configure a imagem de fundo, o texto e as dimensões da capa do certificado.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="capa-img">Arquivo de Imagem do Certificado (Capa)</Label>
                                <Input id="capa-img" type="file" />
                                <p className="text-xs text-muted-foreground">Faça o upload do arquivo de imagem que servirá como fundo para a capa. PNG com fundo transparente é recomendado.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="capa-text">Texto do Certificado</Label>
                                <RichTextEditor value={config.capa.text} onChange={html => handleCapaChange('text', html)} />
                            </div>

                             <Alert>
                                <Info className="h-4 w-4" />
                                <AlertTitle>Variáveis Disponíveis</AlertTitle>
                                <AlertDescription>
                                    Use as chaves abaixo para inserir dados dinâmicos. Elas serão substituídas pelas informações do participante no momento da emissão.
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {availablePlaceholders.map(ph => <code key={ph} className="text-xs bg-muted p-1 rounded-sm">{ph}</code>)}
                                    </div>
                                </AlertDescription>
                            </Alert>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="capa-width">Largura (cm)</Label>
                                    <Input id="capa-width" type="number" value={config.capa.width} onChange={e => handleCapaChange('width', parseFloat(e.target.value))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="capa-height">Altura (cm)</Label>
                                    <Input id="capa-height" type="number" value={config.capa.height} onChange={e => handleCapaChange('height', parseFloat(e.target.value))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="capa-text-x">Posição Horizontal do Texto (cm)</Label>
                                    <Input id="capa-text-x" type="number" value={config.capa.text_x} onChange={e => handleCapaChange('text_x', parseFloat(e.target.value))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="capa-text-y">Posição Vertical do Texto (cm)</Label>
                                    <Input id="capa-text-y" type="number" value={config.capa.text_y} onChange={e => handleCapaChange('text_y', parseFloat(e.target.value))} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="verso">
                     <Card>
                        <CardHeader>
                            <CardTitle>Design do Verso</CardTitle>
                            <CardDescription>Configure a imagem de fundo e o texto para o verso do certificado.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="verso-img">Arquivo de Imagem do Certificado (Verso)</Label>
                                <Input id="verso-img" type="file" />
                                <p className="text-xs text-muted-foreground">Imagem de fundo para o verso. Geralmente contém o conteúdo programático.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="verso-text">Texto do Verso</Label>
                                <RichTextEditor value={config.verso.text} onChange={html => handleVersoChange('text', html)} />
                                <p className="text-xs text-muted-foreground">Este texto aparecerá no verso. Você pode usar as mesmas variáveis da capa aqui.</p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="verso-text-x">Posição Horizontal do Texto (cm)</Label>
                                    <Input id="verso-text-x" type="number" value={config.verso.text_x} onChange={e => handleVersoChange('text_x', parseFloat(e.target.value))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="verso-text-y">Posição Vertical do Texto (cm)</Label>
                                    <Input id="verso-text-y" type="number" value={config.verso.text_y} onChange={e => handleVersoChange('text_y', parseFloat(e.target.value))} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
            <div className="flex justify-end pt-6">
                <Button onClick={handleSave} disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
            </div>
        </div>
    );
}
