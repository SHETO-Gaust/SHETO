'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileUp, ListChecks } from 'lucide-react';
import { bulkCreateInscricao } from '@/app/(app)/gerenciamento/actions';
import type { Formacao } from '@/lib/types';
import { cn } from '@/lib/utils';

type UploadInscritosDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
  onUpdate: () => void;
};

const formatCPF = (cpf: string | number): string => {
    if (typeof cpf !== 'string') {
        cpf = String(cpf);
    }
    const cleaned = cpf.replace(/\D/g, '');
    if (cleaned.length !== 11) {
        return cpf; // Retorna original se não for um CPF válido
    }
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

const normalizeKey = (key: string) => key.toLowerCase().replace(/\s+/g, '_');


export function UploadInscritosDialog({ isOpen, setIsOpen, formacao, onUpdate }: UploadInscritosDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);


  const handleUpload = async () => {
    if (!file) {
      toast({ title: 'Nenhum arquivo selecionado.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (json.length < 2) {
            throw new Error("A planilha está vazia ou contém apenas o cabeçalho.");
        }

        const headers: string[] = json[0].map(h => normalizeKey(String(h)));
        const nomeIndex = headers.indexOf('nome_completo');
        const cpfIndex = headers.indexOf('cpf');
        const emailIndex = headers.indexOf('email');
        const regionalIndex = headers.indexOf('regional');

        if (nomeIndex === -1 || cpfIndex === -1 || emailIndex === -1 || regionalIndex === -1) {
            throw new Error("As colunas obrigatórias (nome_completo, cpf, email, regional) não foram encontradas. Verifique o cabeçalho da sua planilha.");
        }
        
        const inscritos = json.slice(1).map(row => {
            const rowData: { [key: string]: any } = {};
            headers.forEach((header, index) => {
                rowData[header] = row[index];
            });
            
            const { 
                nome_completo, 
                cpf, 
                email, 
                regional, 
                ...dados
            } = rowData;

            return {
                nome_completo: String(nome_completo || ''),
                cpf: formatCPF(String(cpf || '')),
                email: String(email || ''),
                dados: {
                    ...dados,
                    regional: String(regional || ''),
                }
            };
        });

        const result = await bulkCreateInscricao(formacao.id, inscritos as any);
        if (result.error) {
            throw new Error(result.error);
        }
        
        toast({
          title: 'Importação Concluída!',
          description: `${result.data?.inserted} novos participantes foram inscritos. ${result.data?.duplicates} duplicados foram ignorados.`,
        });
        onUpdate();
        setFile(null);
        setIsOpen(false);

      } catch (error: any) {
        toast({
          title: 'Erro ao processar planilha',
          description: error.message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Inscritos</DialogTitle>
          <DialogDescription>
            Faça o upload de uma planilha (.xlsx) com os dados dos participantes para a formação "{formacao.name}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
            <div 
                className={cn(
                    "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                    isDragging ? "border-primary bg-primary/10" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                )}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => document.getElementById('file-upload')?.click()}
            >
                {file ? (
                    <div className="text-center text-green-600">
                        <ListChecks className="mx-auto h-12 w-12" />
                        <p className="font-semibold">{file.name}</p>
                        <p className="text-sm">Arquivo pronto para ser enviado!</p>
                    </div>
                ) : (
                    <div className="text-center text-gray-500">
                        <FileUp className="mx-auto h-12 w-12" />
                        <p className="font-semibold">Arraste e solte o arquivo aqui</p>
                        <p className="text-sm">ou clique para selecionar</p>
                    </div>
                )}
                 <Input 
                    id="file-upload" 
                    type="file" 
                    className="hidden" 
                    accept=".xlsx, .xls"
                    onChange={handleFileChange} 
                />
            </div>
            
            <div className="text-xs text-muted-foreground bg-secondary p-3 rounded-md">
                <p className="font-semibold">Colunas obrigatórias no arquivo:</p>
                <ul className="list-disc pl-5 mt-1">
                    <li>nome_completo</li>
                    <li>cpf</li>
                    <li>email</li>
                    <li>regional</li>
                </ul>
                <p className="mt-2">Outras colunas serão salvas como dados adicionais.</p>
            </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={!file || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Processando...' : 'Enviar Arquivo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
