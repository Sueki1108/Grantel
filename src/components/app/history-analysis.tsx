"use client";

import { useState, useEffect, type ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History, Upload, Trash2, Download, FileJson } from "lucide-react";
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';


// Tipos
export interface SessionData {
    competence: string;
    processedAt: string;
    processedData: any; 
    lastSaidaNumber: number;
    disregardedNfseNotes: string[]; 
    saidasStatus: Record<number, 'emitida' | 'cancelada' | 'inutilizada'>;
}

interface HistoryAnalysisProps {
    onRestoreSession: (session: SessionData) => void;
}

export function HistoryAnalysis({ onRestoreSession }: HistoryAnalysisProps) {
    const { toast } = useToast();
    const fileInputRef = useState<HTMLInputElement | null>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.json')) {
            toast({
                variant: 'destructive',
                title: 'Ficheiro Inválido',
                description: 'Por favor, selecione um ficheiro .json de sessão válido.',
            });
            return;
        }

        try {
            const content = await file.text();
            const sessionData: SessionData = JSON.parse(content);
            
            // Validação simples da estrutura do ficheiro
            if (!sessionData.competence || !sessionData.processedAt || !sessionData.processedData) {
                throw new Error("O ficheiro JSON não parece ser uma sessão válida.");
            }

            onRestoreSession(sessionData);
            toast({
                title: 'Sessão Importada com Sucesso',
                description: `Análise para a competência ${sessionData.competence} foi restaurada.`,
            });
        } catch (error: any) {
            console.error("Failed to import session:", error);
            toast({
                variant: 'destructive',
                title: 'Erro ao Importar Sessão',
                description: error.message || 'Ocorreu um erro ao ler o ficheiro da sessão.',
            });
        } finally {
            // Limpa o input para permitir carregar o mesmo ficheiro novamente
            if (event.target) {
                event.target.value = '';
            }
        }
    };


    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <History className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Importar Sessão</CardTitle>
                            <CardDescription>
                                Recupere uma análise completa a partir de um ficheiro de sessão (.json) guardado anteriormente.
                            </CardDescription>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                 <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-8 transition-all min-h-[200px]">
                    <FileJson className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Importar ficheiro de sessão</h3>
                    <p className="text-muted-foreground mb-6 text-center">Clique no botão abaixo para selecionar e carregar o seu ficheiro `sessao_automator_....json`.</p>
                    <Button onClick={handleImportClick}>
                        <Upload className="mr-2 h-4 w-4" /> Procurar Ficheiro de Sessão
                    </Button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".json"
                    />
                </div>
            </CardContent>
        </Card>
    );
}
