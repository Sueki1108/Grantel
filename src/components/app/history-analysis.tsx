"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, Upload, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Tipos
export interface SessionMetadata {
    competence: string;
    processedAt: string;
    fileNames: {
        nfeEntrada: string[];
        cte: string[];
        nfeSaida: string[];
        nfse: string[];
        manifesto: string[];
        sienge: string | null;
        sped: string[];
    };
    // Armazenar os estados leves
    lastSaidaNumber: number;
    disregardedNfseNotes: string[]; // Convert Set to Array for JSON
    saidasStatus: Record<number, 'emitida' | 'cancelada' | 'inutilizada'>;
}

interface HistoryAnalysisProps {
    sessionsKey: string;
    onRestoreSession: (session: SessionMetadata) => void;
}

export function HistoryAnalysis({ sessionsKey, onRestoreSession }: HistoryAnalysisProps) {
    const [sessions, setSessions] = useState<SessionMetadata[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        try {
            const savedSessions = localStorage.getItem(sessionsKey);
            if (savedSessions) {
                const parsedSessions: SessionMetadata[] = JSON.parse(savedSessions);
                // Ordenar por data de processamento, mais recente primeiro
                parsedSessions.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime());
                setSessions(parsedSessions);
            }
        } catch (e) {
            console.error("Failed to load sessions from localStorage", e);
            toast({ variant: 'destructive', title: "Erro ao carregar histórico" });
        }
    }, [sessionsKey, toast]);
    
    const handleDeleteSession = (competence: string) => {
        const updatedSessions = sessions.filter(s => s.competence !== competence);
        try {
            localStorage.setItem(sessionsKey, JSON.stringify(updatedSessions));
            setSessions(updatedSessions);
            toast({ title: "Sessão Removida", description: `A análise para ${competence} foi removida do histórico.` });
        } catch (e) {
            toast({ variant: 'destructive', title: "Erro ao remover sessão" });
        }
    };

    const handleDeleteAll = () => {
        try {
            localStorage.removeItem(sessionsKey);
            setSessions([]);
            toast({ title: "Histórico Limpo", description: "Todas as sessões de análise foram removidas." });
        } catch (e) {
            toast({ variant: 'destructive', title: "Erro ao limpar histórico" });
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <History className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Histórico de Análises</CardTitle>
                            <CardDescription>
                                Visualize e recarregue sessões de trabalho anteriores. O sistema guarda as suas classificações, mas precisará que carregue os ficheiros originais novamente.
                            </CardDescription>
                        </div>
                    </div>
                    {sessions.length > 0 && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                    <Trash2 className="mr-2 h-4 w-4" /> Limpar Histórico
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Tem a certeza?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta ação irá remover permanentemente todo o seu histórico de análises guardado. Não poderá reverter esta ação.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteAll}>Sim, Limpar Tudo</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {sessions.length > 0 ? (
                    <div className="space-y-4">
                        {sessions.map((session) => (
                            <Card key={session.competence} className="bg-muted/50">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg">
                                                Competência: {session.competence.split('_').map(c => {
                                                    try {
                                                        return format(parseISO(`${c}-01`), "MMMM 'de' yyyy", { locale: ptBR });
                                                    } catch {
                                                        return c;
                                                    }
                                                }).join(' & ')}
                                            </CardTitle>
                                            <CardDescription>
                                                Processado em: {format(new Date(session.processedAt), "dd/MM/yyyy 'às' HH:mm")}
                                            </CardDescription>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button onClick={() => onRestoreSession(session)} size="sm">
                                                <Upload className="mr-2 h-4 w-4" /> Restaurar
                                            </Button>
                                             <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Remover esta sessão?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            A análise para a competência {session.competence} será removida do seu histórico.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteSession(session.competence)}>Remover</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm font-medium mb-2">Ficheiros utilizados nesta análise:</p>
                                    <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                                        {session.fileNames.nfeEntrada.length > 0 && <li>{session.fileNames.nfeEntrada.length} XMLs de NF-e Entrada</li>}
                                        {session.fileNames.cte.length > 0 && <li>{session.fileNames.cte.length} XMLs de CT-e</li>}
                                        {session.fileNames.nfeSaida.length > 0 && <li>{session.fileNames.nfeSaida.length} XMLs de NF-e Saída</li>}
                                        {session.fileNames.nfse.length > 0 && <li>{session.fileNames.nfse.length} XMLs de NFS-e</li>}
                                        {session.fileNames.manifesto.map(f => <li key={f}>{f}</li>)}
                                        {session.fileNames.sienge && <li>{session.fileNames.sienge}</li>}
                                        {session.fileNames.sped.map(f => <li key={f}>{f}</li>)}
                                    </ul>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-12">
                        <History className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-xl font-semibold">Nenhuma sessão guardada</h3>
                        <p>Quando processar uma nova análise, os metadados serão guardados aqui.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
