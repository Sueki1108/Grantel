"use client";

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';
import { PendingIssuesReport } from '@/components/app/pending-issues-report';
import { HistoryAnalysis } from '@/components/app/history-analysis';
import type { SessionData } from '@/components/app/history-analysis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileQuestion } from 'lucide-react';
import { ThemeToggle } from '@/components/app/theme-toggle';


export default function PendingIssuesPage() {
    const [sessionData, setSessionData] = React.useState<SessionData | null>(null);

    const handleRestoreSession = (session: SessionData) => {
        setSessionData(session);
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-20 w-full border-b bg-background/80 backdrop-blur-sm">
                 <div className="container mx-auto flex h-16 items-center justify-between px-4">
                     <div className="flex items-center gap-4">
                        <Button asChild variant="outline" size="icon" title="Voltar ao fluxo principal">
                            <Link href="/automator">
                                <Home className="h-5 w-5" />
                            </Link>
                        </Button>
                        <div className="flex items-center gap-2">
                           <FileQuestion className="h-6 w-6 text-primary" />
                           <h1 className="text-xl font-bold font-headline">Relatório de Pendências</h1>
                        </div>
                     </div>
                      <div className="flex items-center gap-2">
                        <ThemeToggle />
                     </div>
                </div>
            </header>
            <main className="container mx-auto p-4 md:p-8">
                <div className="mx-auto space-y-8 max-w-screen-2xl">
                    {!sessionData ? (
                        <HistoryAnalysis onRestoreSession={handleRestoreSession} />
                    ) : (
                        <div>
                             <Card className="mb-6">
                                <CardHeader>
                                    <CardTitle>Sessão Carregada: {sessionData.competence}</CardTitle>
                                    <CardDescription>
                                        A visualizar o relatório de pendências para a sessão processada em {new Date(sessionData.processedAt).toLocaleString('pt-BR')}. 
                                        Para analisar outra competência, volte ao fluxo principal.
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                            <PendingIssuesReport 
                                processedData={sessionData.processedData}
                                allPersistedClassifications={sessionData.processedData.imobilizadoClassifications || {}}
                                onForceUpdate={() => setSessionData(prev => prev ? {...prev} : null)}
                            />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
