'use client';

import { useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Formacao, Inscricao, Formador } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Star, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { submitAvaliacao } from '../../actions';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


const formadorFeedbackSchema = z.object({
  formador_id: z.string(),
  formador_name: z.string(),
  dominio_tema: z.coerce.number().min(1, { message: "A avaliação para esta pergunta é obrigatória." }).max(5),
  relevancia_profissional: z.coerce.number().min(1, { message: "A avaliação para esta pergunta é obrigatória." }).max(5),
  contribuicao_tema: z.coerce.number().min(1, { message: "A avaliação para esta pergunta é obrigatória." }).max(5),
  metodologia_adequada: z.coerce.number().min(1, { message: "A avaliação para esta pergunta é obrigatória." }).max(5),
  comentario: z.string().optional(),
});

const infraestruturaSchema = z.object({
    espaco_fisico: z.coerce.number().min(1, "A avaliação é obrigatória.").max(5),
    equipe_apoio: z.coerce.number().min(1, "A avaliação é obrigatória.").max(5),
    internet: z.coerce.number().min(1, "A avaliação é obrigatória.").max(5),
});

const avaliacaoFormSchema = z.object({
  feedback_formadores: z.array(formadorFeedbackSchema),
  infraestrutura: infraestruturaSchema,
  general_suggestions: z.string().optional(),
});

type AvaliacaoFormValues = z.infer<typeof avaliacaoFormSchema>;

const questions = {
    dominio_tema: {
        label: (name: string) => `Você considera que o formador ${name} demonstrou domínio do tema da formação?`,
        options: [
            { text: 'Não, o formador não demonstrou domínio do tema da formação' },
            { text: 'Não, o formador demonstrou pouco domínio do tema da formação' },
            { text: 'Sim, o formador demonstrou bom domínio do tema da formação' },
            { text: 'Sim, o formador demonstrou muito bom domínio do tema da formação' },
            { text: 'Sim, o formador demonstrou excelente domínio do tema da formação' },
        ]
    },
    relevancia_profissional: {
        label: () => `Você avalia que a formação trouxe alguma relevância para seu avanço profissional?`,
        options: [
            { text: 'Contribuiu de forma pouco relevante para minha prática profissional.' },
            { text: 'Contribuiu de forma relevante para minha prática profissional.' },
            { text: 'Contribuiu de forma necessária para minha prática profissional.' },
            { text: 'Contribuiu de forma muito relevante para minha prática profissional.' },
            { text: 'Superou minhas expectativas e transformou minha prática profissional.' },
        ]
    },
    contribuicao_tema: {
        label: () => `Você avalia que o tema da formação contribuiu para sua vida profissional?`,
        options: [
            { text: 'Não, o tema da formação em nada contribuiu para minha vida profissional.' },
            { text: 'Não, o tema da formação pouco contribuiu para minha vida profissional.' },
            { text: 'Sim, no entanto, o tema abordado não foi o suficiente para transformar minha atuação profissional.' },
            { text: 'Sim, o tema da formação trouxe grande contribuição, porém não o suficiente para transformar minha atuação profissional' },
            { text: 'Sim, o tema da formação contribuiu muito e transformou a minha vida profissional.' },
        ]
    },
     metodologia_adequada: {
        label: (name: string) => `Você julga que a metodologia utilizada pelo formador ${name} foi adequada?`,
        options: [
            { text: 'Não, pois considerei a metodologia inadequada e tive dificuldade em visualizar sua aplicação na minha prática profissional.' },
            { text: 'Não, apesar da metodologia utilizada ser adequada, não percebi aplicabilidade na minha prática profissional.' },
            { text: 'Sim, a metodologia de ensino foi boa, porém o conteúdo tem pouca aplicação na minha prática.' },
            { text: 'Sim, a metodologia é adequada e aplicável a minha prática profissional' },
            { text: 'Sim, a metodologia é adequada e inovadora, e sua aplicação pode transformar minha prática profissional' },
        ]
    }
}

const StarRatingInput = ({ value, onChange, max = 5 }: { value: number, onChange: (value: number) => void, max?: number }) => (
    <div className="flex gap-1">
        {[...Array(max)].map((_, i) => {
            const ratingValue = i + 1;
            return (
                <button
                    type="button"
                    key={ratingValue}
                    onClick={() => onChange(ratingValue)}
                    className="focus:outline-none"
                >
                    <Star className={cn("h-8 w-8", ratingValue <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300')} />
                </button>
            )
        })}
    </div>
);


const QuestionBlock = ({ field, onChange, label, options, error }: { field: any, onChange: (value: number) => void, label: string, options: {text: string}[], error?: { message?: string } }) => (
    <div className="space-y-3">
        <Label className={cn(error && "text-destructive")}>{label}</Label>
        <div className="space-y-2">
        {options.map((option, index) => {
            const ratingValue = index + 1;
            return (
                <div key={ratingValue} onClick={() => onChange(ratingValue)} className={cn("flex items-start space-x-3 rounded-md border p-3 cursor-pointer", field.value === ratingValue ? "bg-primary/10 border-primary" : "bg-background", error && "border-destructive")}>
                    <input
                        type="radio"
                        value={ratingValue}
                        checked={field.value === ratingValue}
                        onChange={() => onChange(ratingValue)}
                        className="mt-1"
                    />
                    <Label className="font-normal">{option.text}</Label>
                </div>
            )
        })}
        </div>
        {error && <p className="text-sm font-medium text-destructive">{error.message}</p>}
    </div>
);

export function AvaliacaoForm({ formacao, inscricao, formadoresToRate, periodo, onSuccess, showFrequenciaWarning }: { formacao: Formacao; inscricao: Inscricao; formadoresToRate: Formador[]; periodo: 'MAT' | 'VESP'; onSuccess: () => void; showFrequenciaWarning?: boolean }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<AvaliacaoFormValues>({
      resolver: zodResolver(avaliacaoFormSchema),
      defaultValues: {
          feedback_formadores: formadoresToRate.map(f => ({
              formador_id: f.id,
              formador_name: f.name,
              dominio_tema: 0,
              relevancia_profissional: 0,
              contribuicao_tema: 0,
              metodologia_adequada: 0,
              comentario: ''
          })),
          infraestrutura: {
              espaco_fisico: 0,
              equipe_apoio: 0,
              internet: 0,
          },
          general_suggestions: ''
      }
  });

  const { fields } = useFieldArray({ control: form.control, name: "feedback_formadores" });
  const { formState: { errors } } = form;

  const onSubmit = async (data: AvaliacaoFormValues) => {
      setLoading(true);
      const payload = {
          ...data,
          formacao_id: formacao.id,
          inscricao_id: inscricao.id,
          periodo: periodo,
      };
      const result = await submitAvaliacao(payload);
      setLoading(false);

      if (result.success) {
          onSuccess();
      } else {
          toast({ title: "Erro ao Enviar", description: result.error, variant: 'destructive'});
      }
  };

  return (
      <Card className="w-full max-w-4xl mx-auto">
          <CardHeader>
              <CardTitle className="text-2xl">Formulário de Avaliação ({periodo === 'MAT' ? 'Manhã' : 'Tarde'})</CardTitle>
              <CardDescription>Sua opinião sobre a formação <span className="font-semibold">{formacao.name}</span> é muito importante.</CardDescription>
          </CardHeader>
          <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-12">
                   {showFrequenciaWarning && (
                      <Alert variant="destructive" className="bg-orange-50 border-orange-200 text-orange-800">
                          <AlertTriangle className="h-4 w-4 !text-orange-500" />
                          <AlertTitle className="font-bold">Atenção!</AlertTitle>
                          <AlertDescription>
                            Você ainda não registrou sua frequência. Por favor, não se esqueça de registrar sua presença ao final desta avaliação.
                          </AlertDescription>
                      </Alert>
                  )}
                  
                  {/* Bloco 1 - Repete por formador */}
                  {fields.map((field, index) => (
                      <div key={field.id} className="space-y-8 p-6 border rounded-lg">
                          <h3 className="text-xl font-semibold border-b pb-2">Avaliação do(a) Formador(a): <span className="text-primary">{field.formador_name}</span></h3>
                          
                          <Controller
                              control={form.control}
                              name={`feedback_formadores.${index}.dominio_tema`}
                              render={({ field: controllerField }) => <QuestionBlock field={controllerField} onChange={controllerField.onChange} label={questions.dominio_tema.label(field.formador_name)} options={questions.dominio_tema.options} error={errors.feedback_formadores?.[index]?.dominio_tema} />}
                          />
                           <Controller
                              control={form.control}
                              name={`feedback_formadores.${index}.relevancia_profissional`}
                              render={({ field: controllerField }) => <QuestionBlock field={controllerField} onChange={controllerField.onChange} label={questions.relevancia_profissional.label()} options={questions.relevancia_profissional.options} error={errors.feedback_formadores?.[index]?.relevancia_profissional} />}
                          />
                          <Controller
                              control={form.control}
                              name={`feedback_formadores.${index}.contribuicao_tema`}
                              render={({ field: controllerField }) => <QuestionBlock field={controllerField} onChange={controllerField.onChange} label={questions.contribuicao_tema.label()} options={questions.contribuicao_tema.options} error={errors.feedback_formadores?.[index]?.contribuicao_tema} />}
                          />
                          <Controller
                              control={form.control}
                              name={`feedback_formadores.${index}.metodologia_adequada`}
                              render={({ field: controllerField }) => <QuestionBlock field={controllerField} onChange={controllerField.onChange} label={questions.metodologia_adequada.label(field.formador_name)} options={questions.metodologia_adequada.options} error={errors.feedback_formadores?.[index]?.metodologia_adequada} />}
                          />

                          <div className="space-y-2">
                              <Label>Você gostaria de fazer algum comentário sobre o(a) formador(a) {field.formador_name}?</Label>
                              <Textarea {...form.register(`feedback_formadores.${index}.comentario`)} />
                          </div>
                      </div>
                  ))}

                  <Separator />

                  {/* Bloco 2 - Infraestrutura */}
                  <div className="space-y-6 p-6 border rounded-lg">
                      <h3 className="text-xl font-semibold">Avaliação da Organização e Infraestrutura</h3>
                       <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className={cn(errors.infraestrutura?.espaco_fisico && "text-destructive")}>
                                    Espaço Físico (banheiros, bebedouros, limpeza etc.)
                                </Label>
                                <Controller
                                control={form.control}
                                name="infraestrutura.espaco_fisico"
                                render={({ field }) => (
                                    <StarRatingInput value={field.value || 0} onChange={field.onChange} max={5} />
                                )}
                                />
                                {errors.infraestrutura?.espaco_fisico && <p className="text-sm font-medium text-destructive">{errors.infraestrutura.espaco_fisico.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label className={cn(errors.infraestrutura?.equipe_apoio && "text-destructive")}>
                                    Equipe de Apoio
                                </Label>
                                <Controller
                                control={form.control}
                                name="infraestrutura.equipe_apoio"
                                render={({ field }) => (
                                    <StarRatingInput value={field.value || 0} onChange={field.onChange} max={5} />
                                )}
                                />
                                {errors.infraestrutura?.equipe_apoio && <p className="text-sm font-medium text-destructive">{errors.infraestrutura.equipe_apoio.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label className={cn(errors.infraestrutura?.internet && "text-destructive")}>
                                    Internet
                                </Label>
                                <Controller
                                control={form.control}
                                name="infraestrutura.internet"
                                render={({ field }) => (
                                    <StarRatingInput value={field.value || 0} onChange={field.onChange} max={5} />
                                )}
                                />
                                {errors.infraestrutura?.internet && <p className="text-sm font-medium text-destructive">{errors.infraestrutura.internet.message}</p>}
                            </div>
                        </div>
                  </div>


                  <Separator />

                  {/* Bloco 3 - Sugestões */}
                  <div className="space-y-2">
                      <h3 className="text-xl font-semibold">Sugestões Gerais</h3>
                      <Label>Apresente uma ou mais sugestões que favoreçam futuras formações profissionais.</Label>
                      <Textarea {...form.register("general_suggestions")} rows={5} />
                  </div>

                  <Button type="submit" disabled={loading} className="w-full text-lg py-6">
                      {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                      Enviar Avaliação
                  </Button>
              </form>
          </CardContent>
      </Card>
  );
}
