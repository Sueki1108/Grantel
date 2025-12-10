"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { Cpu, Loader2, Database, UploadCloud } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

interface CostCenterAnalysisProps {
    costCenterFile: File | null;
    onCostCenterFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearCostCenterFile: () => void;
    onDownloadCostCenterDebug: () => void;
    isProcessing: boolean;
}

export function CostCenterAnalysis({
    costCenterFile,
    onCostCenterFileChange,
    onClearCostCenterFile,
    onDownloadCostCenterDebug,
    isProcessing,
}: CostCenterAnalysisProps) {
    const { toast } = useToast();
    
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Database className="h-8 w-8 text-primary" />
                    <div>
                        <CardTitle className="font-headline text-2xl">Análise de Centro de Custo</CardTitle>
                        <CardDescription>
                            Carregue a planilha de Centro de Custo para associar os custos aos itens e gere um relatório de depuração.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <UploadCloud className="h-5 w-5" />
                        Carregar Planilha
                    </h3>
                    <FileUploadForm
                        displayName="Centro de Custo"
                        formId="cost-center"
                        files={{ 'cost-center': !!costCenterFile }}
                        onFileChange={onCostCenterFileChange}
                        onClearFile={onClearCostCenterFile}
                    />
                </div>

                <div>
                    <h3 className="text-lg font-bold mb-2">Ações de Depuração</h3>
                    <p className='text-sm text-muted-foreground mb-4'>
                        Após carregar a planilha, clique no botão abaixo para gerar um ficheiro Excel com as chaves de comparação e os centros de custo encontrados.
                    </p>
                    <Button 
                        onClick={onDownloadCostCenterDebug} 
                        disabled={!costCenterFile || isProcessing}
                    >
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Cpu className="mr-2 h-4 w-4" />}
                        Gerar Chaves de Depuração do Centro de Custo
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
