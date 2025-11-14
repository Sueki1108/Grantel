"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import type { ProcessedData, ReconciliationResults } from '@/lib/excel-processor';
import { runReconciliation } from '@/lib/excel-processor';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GitCompareArrows, AlertTriangle, Download, FileSearch, Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/components/app/columns-helper";
import { CfopValidator } from './cfop-validator';
import type { AllClassifications } from './imobilizado-analysis';


interface ReconciliationAnalysisProps {
    processedData: ProcessedData | null;
    onProcessedDataChange: (data: ProcessedData) => void;
    siengeFile: File | null;
    onSiengeFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    allPersistedData: AllClassifications;
    onPersistData: (allDataToSave: AllClassifications) => void;
}


export function ReconciliationAnalysis({ 
    processedData, 
    onProcessedDataChange,
    siengeFile, 
    onSiengeFileChange, 
    onClearSiengeFile,
    allPersistedData,
    onPersistData
}: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        if (processedData && (processedData.sheets['Itens Válidos'] || processedData.sheets['Itens Válidos Saídas'])) {
            setIsLoading(true);
            // Give the UI a moment to update before running heavy computation
            setTimeout(() => {
                const reconciliationResults = runReconciliation(
                    processedData.siengeSheetData, 
                    processedData.sheets['Itens Válidos'] || [], 
                    processedData.sheets['Itens Válidos Saídas'] || [],
                    processedData.sheets['CTEs Válidos'] || []
                );

                onProcessedDataChange({
                    ...processedData,
                    reconciliationResults,
                });
                setIsLoading(false);
            }, 50);
        }
    }, [processedData?.sheets['Itens Válidos'], processedData?.sheets['Itens Válidos Saídas'], processedData?.siengeSheetData]);


    const reconciliationResults = processedData?.reconciliationResults;

    const handleDownload = (data: any[], title: string) => {
        if (!data || data.length === 0) {
            toast({ title: "Nenhum dado para exportar", description: `Não há itens na aba "${title}".` });
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, title);
        const fileName = `Grantel - Conciliação ${title}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    return (
         <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <GitCompareArrows className="h-8 w-8 text-primary" />
                    <div>
                        <CardTitle className="font-headline text-2xl">Conciliação de Itens (XML vs Sienge) & Classificação de CFOP</CardTitle>
                        <CardDescription>Carregue a planilha do Sienge para iniciar a comparação. Valide os CFOPs dos itens conciliados.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <FileUploadForm
                    displayName="Itens do Sienge"
                    formId="sienge-for-reconciliation"
                    files={{ 'sienge-for-reconciliation': !!siengeFile }}
                    onFileChange={onSiengeFileChange}
                    onClearFile={onClearSiengeFile}
                />
                
                <Tabs defaultValue="reconciliation">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="reconciliation">Conciliação de Itens</TabsTrigger>
                        <TabsTrigger value="cfop_validation">Validação de CFOP</TabsTrigger>
                    </TabsList>
                    <TabsContent value="reconciliation" className="mt-4">
                         {!processedData?.sheets['Itens Válidos'] && !processedData?.sheets['Itens Válidos Saídas'] && (
                             <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Dados XML em falta</AlertTitle>
                                <AlertDescription>
                                    Processe os XMLs na primeira aba para habilitar a conciliação.
                                </AlertDescription>
                            </Alert>
                        )}
                        {isLoading ? (
                                <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                                    <p className="mt-4 text-center">A processar dados para conciliação...</p>
                                </div>
                        ) : reconciliationResults ? (
                            <div className="mt-6">
                                <Tabs defaultValue="reconciled">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="reconciled">Conciliados ({reconciliationResults.reconciled.length})</TabsTrigger>
                                        <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                        <TabsTrigger value="onlyInXml">Apenas no XML ({reconciliationResults.onlyInXml.length})</TabsTrigger>
                                    </TabsList>
                                    <div className="mt-4">
                                        <TabsContent value="reconciled">
                                            <Button onClick={() => handleDownload(reconciliationResults.reconciled, 'Itens_Conciliados')} size="sm" className="mb-4" disabled={reconciliationResults.reconciled.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumns(reconciliationResults.reconciled)} data={reconciliationResults.reconciled} />
                                        </TabsContent>
                                        <TabsContent value="onlyInSienge">
                                            <Button onClick={() => handleDownload(reconciliationResults.onlyInSienge, 'Itens_Apenas_Sienge')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInSienge.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumns(reconciliationResults.onlyInSienge)} data={reconciliationResults.onlyInSienge} />
                                        </TabsContent>
                                        <TabsContent value="onlyInXml">
                                            <Button onClick={() => handleDownload(reconciliationResults.onlyInXml, 'Itens_Apenas_XML')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInXml.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumns(reconciliationResults.onlyInXml)} data={reconciliationResults.onlyInXml} />
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                                <FileSearch className="h-12 w-12 text-primary" />
                                <p className="mt-4 text-center">Aguardando dados para executar a conciliação...</p>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="cfop_validation" className="mt-4">
                        <CfopValidator 
                            items={reconciliationResults?.allReconciledItems || []} 
                            allPersistedData={allPersistedData}
                            onPersistData={onPersistData}
                            competence={processedData?.competence || null}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
         </Card>
    );
}
