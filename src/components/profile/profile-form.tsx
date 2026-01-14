'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const profileFormSchema = z.object({
  fullName: z.string().min(2, {
    message: 'O nome completo deve ter pelo menos 2 caracteres.',
  }),
  phone: z.string().optional(),
  email: z.string().email(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

type ProfileFormProps = {
  userProfile: ProfileFormValues;
};

export function ProfileForm({ userProfile }: ProfileFormProps) {
  const { toast } = useToast();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: userProfile,
    mode: 'onChange',
  });

  const onSubmit = async (data: ProfileFormValues) => {
    // In a real app, this would call a server action to update the user profile in Supabase
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(data);
    toast({
      title: 'Perfil Atualizado',
      description: 'Suas informações de perfil foram salvas com sucesso.',
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} readOnly disabled />
              </FormControl>
              <FormDescription>
                Seu endereço de e-mail não pode ser alterado.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome Completo</FormLabel>
              <FormControl>
                <Input placeholder="Seu nome completo" {...field} />
              </FormControl>
              <FormDescription>
                Este é o nome que será exibido nas reservas.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de Telefone</FormLabel>
              <FormControl>
                <Input placeholder="Seu número de telefone" {...field} />
              </FormControl>
              <FormDescription>
                Utilizado pela equipe administrativa para contato.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Atualizar Perfil
        </Button>
      </form>
    </Form>
  );
}
