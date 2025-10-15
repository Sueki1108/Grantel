"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, FileInput, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { SettingsDialog } from '@/components/app/settings-dialog';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const [isWideMode, setIsWideMode] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const wideMode = localStorage.getItem('ui-widemode') === 'true';
    setIsWideMode(wideMode);
  }, []);

  const handleSettingsChange = ({ wideMode }: { wideMode: boolean }) => {
    setIsWideMode(wideMode);
    localStorage.setItem('ui-widemode', String(wideMode));
    toast({
        title: "Configurações salvas",
        description: `O modo amplo foi ${wideMode ? 'ativado' : 'desativado'}. A definição será aplicada na página do automator.`,
    });
  };


  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
       <header className="w-full border-b">
        <div className="container mx-auto flex h-20 items-center justify-between">
            <div className="flex items-center gap-4">
             <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 text-primary"
            >
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
             <h1 className="text-4xl sm:text-5xl font-bold font-headline text-foreground">
              Grantel
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <SettingsDialog initialWideMode={isWideMode} onSettingsChange={handleSettingsChange} />
            <ThemeToggle />
          </div>
        </div>
      </header>

       <main className="flex-grow container mx-auto p-4 md:p-8">
        <div className="w-full max-w-5xl mx-auto space-y-12">
            <section className="text-center">
                <h2 className="text-3xl font-bold tracking-tight">Automação Inteligente de Processos</h2>
                <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
                    Plataforma integrada para validação de processos fiscais e contábeis. Otimize seu tempo e garanta a conformidade.
                </p>
            </section>
            
            <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
                <Card className="hover:border-primary/50 transition-colors flex flex-col md:col-span-1">
                    <CardHeader className="flex-row items-start gap-4 space-y-0 pb-4">
                        <div className="p-3 rounded-lg bg-primary/10 border"><FileInput className="h-6 w-6 text-primary" /></div>
                        <CardTitle className="font-headline text-xl pt-1">Fluxo de Validação</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-grow flex flex-col">
                        <CardDescription className="flex-grow">Inicie o fluxo completo: Valide NF-Stock, compare com SPED, analise itens do Sienge e verifique imobilizados.</CardDescription>
                        <Button asChild className="w-full mt-auto">
                            <Link href="/automator">Iniciar Fluxo Completo <ArrowRight className="ml-2 h-4 w-4"/></Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
      </main>
    </div>
  );
}
