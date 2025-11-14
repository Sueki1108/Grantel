
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import type { ProcessedData } from '@/lib/excel-processor';
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
import { SiengeTaxCheck } from './sienge-tax-check';


interface ReconciliationAnalysisProps {
    processedData: ProcessedData | null;
    siengeFile: File | null;
    onSiengeFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    allPersistedData: AllClassifications;
    onPersistData: (allDataToSave: AllClassifications) => void;
    onProcessedDataChange: (data: ProcessedData | ((prevData: ProcessedData) => ProcessedData)) => void;
}


export function ReconciliationAnalysis({ 
    processedData, 
    siengeFile, 
    onSiengeFileChange, 
    onClearSiengeFile,
    allPersistedData,
    onPersistData,
    onProcessedDataChange,
}: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    
    useEffect(() => {
        if (processedData && (processedData.sheets['Itens Válidos'] || processedData.sheets['Itens Válidos Saídas']) && processedData.siengeSheetData) {
            const reconciliationResults = runReconciliation(
                processedData.siengeSheetData,
                processedData.sheets['Itens Válidos'] || [],
                processedData.sheets['Itens Válidos Saídas'] || [],
                processedData.sheets['CTEs Válidos'] || []
            );

             onProcessedDataChange(prev => ({
                ...prev!,
                reconciliationResults,
            }));
        }
    }, [processedData?.sheets, processedData?.siengeSheetData, onProcessedDataChange]);


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
                        <CardTitle className="font-headline text-2xl">XML VS Sienge</CardTitle>
                        <CardDescription>Carregue a planilha do Sienge para cruzar informações com os XMLs processados.</CardDescription>
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
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="reconciliation">Conciliação de Itens</TabsTrigger>
                        <TabsTrigger value="cfop_validation">Validação de CFOP</TabsTrigger>
                        <TabsTrigger value="tax_check">Conferência de Impostos</TabsTrigger>
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
                        {processedData?.reconciliationResults ? (
                            <div className="mt-6">
                                <Tabs defaultValue="reconciled">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="reconciled">Conciliados ({processedData.reconciliationResults.reconciled.length})</TabsTrigger>
                                        <TabsTrigger value="onlyInSienge">Apenas no Sienge ({processedData.reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                        <TabsTrigger value="onlyInXml">Apenas no XML ({processedData.reconciliationResults.onlyInXml.length})</TabsTrigger>
                                    </TabsList>
                                    <div className="mt-4">
                                        <TabsContent value="reconciled">
                                            <Button onClick={() => handleDownload(processedData!.reconciliationResults!.reconciled, 'Itens_Conciliados')} size="sm" className="mb-4" disabled={processedData!.reconciliationResults!.reconciled.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumns(processedData.reconciliationResults.reconciled)} data={processedData.reconciliationResults.reconciled} />
                                        </TabsContent>
                                        <TabsContent value="onlyInSienge">
                                            <Button onClick={() => handleDownload(processedData!.reconciliationResults!.onlyInSienge, 'Itens_Apenas_Sienge')} size="sm" className="mb-4" disabled={processedData!.reconciliationResults!.onlyInSienge.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumns(processedData.reconciliationResults.onlyInSienge)} data={processedData.reconciliationResults.onlyInSienge} />
                                        </TabsContent>
                                        <TabsContent value="onlyInXml">
                                            <Button onClick={() => handleDownload(processedData!.reconciliationResults!.onlyInXml, 'Itens_Apenas_XML')} size="sm" className="mb-4" disabled={processedData!.reconciliationResults!.onlyInXml.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumns(processedData.reconciliationResults.onlyInXml)} data={processedData.reconciliationResults.onlyInXml} />
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
                        <p className='text-sm text-muted-foreground mb-4'>A tabela abaixo mostra **apenas** os itens que foram conciliados com sucesso. Utilize-a para validar se o CFOP do XML corresponde ao CFOP utilizado no Sienge.</p>
                        <CfopValidator 
                            items={processedData?.reconciliationResults?.reconciled || []} 
                            allPersistedData={allPersistedData}
                            onPersistData={onPersistData}
                            competence={processedData?.competence || null}
                        />
                    </TabsContent>
                    <TabsContent value="tax_check" className="mt-4">
                        <SiengeTaxCheck siengeData={processedData?.siengeSheetData || null} />
                    </TabsContent>
                </Tabs>
            </CardContent>
         </Card>
    );
}
