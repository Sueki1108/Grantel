
"use client";

import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import type { ProcessedData } from '@/lib/excel-processor';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GitCompareArrows, AlertTriangle, Download, FileSearch, Loader2, Cpu } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/components/app/columns-helper";
import { CfopValidator } from './cfop-validator';
import { SiengeTaxCheck } from './sienge-tax-check';
import { ColumnDef } from '@tanstack/react-table';


interface ReconciliationAnalysisProps {
    processedData: ProcessedData | null;
    siengeFile: File | null;
    onSiengeFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    onRunReconciliation: () => void;
    isReconciliationRunning: boolean;
}

const getColumnsForDivergentTabs = (data: any[]): ColumnDef<any>[] => {
    if (!data || data.length === 0) return [];

    const hasKeyColumn = data[0] && 'Chave de Comparação' in data[0];
    
    let allColumns = getColumns(data);

    if (hasKeyColumn) {
        const keyColumn = allColumns.find(col => col.id === 'Chave de Comparação');
        const otherColumns = allColumns.filter(col => col.id !== 'Chave de Comparação');
        if (keyColumn) {
            return [keyColumn, ...otherColumns];
        }
    }
    
    return allColumns;
};


export function ReconciliationAnalysis({ 
    processedData, 
    siengeFile, 
    onSiengeFileChange, 
    onClearSiengeFile,
    onRunReconciliation,
    isReconciliationRunning
}: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    
    const { reconciliationResults, reconciledWithInfo, siengeDataForTaxCheck } = useMemo(() => {
        const results = processedData?.reconciliationResults;
        if (!results) {
            return { reconciliationResults: null, reconciledWithInfo: [], siengeDataForTaxCheck: processedData?.siengeSheetData || null };
        }

        const nfeHeaderMap = new Map();
        [...(processedData?.sheets['Notas Válidas'] || []), ...(processedData?.sheets['CTEs Válidos'] || [])].forEach(n => nfeHeaderMap.set(n['Chave Unica'], n));
        
        const enrichedReconciled = results.reconciled.map(item => {
            const header = nfeHeaderMap.get(item['Chave Unica']);
            return {
                ...item,
                Fornecedor: header?.Fornecedor || 'N/A',
                pICMS: item.pICMS || 0, // Ensure pICMS is carried over
            };
        });

        return {
            reconciliationResults: results,
            reconciledWithInfo: enrichedReconciled,
            siengeDataForTaxCheck: processedData?.siengeSheetData || null,
        };
    }, [processedData]);

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
                        <CardDescription>Carregue a planilha do Sienge para cruzar informações com os XMLs processados na aba de validação.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className='grid grid-cols-1 md:grid-cols-2 gap-6 items-end'>
                    <FileUploadForm
                        displayName="Itens do Sienge"
                        formId="sienge-for-reconciliation"
                        files={{ 'sienge-for-reconciliation': !!siengeFile }}
                        onFileChange={onSiengeFileChange}
                        onClearFile={onClearSiengeFile}
                    />
                    <Button onClick={onRunReconciliation} disabled={!siengeFile || !processedData || isReconciliationRunning} className="w-full md:w-auto">
                        {isReconciliationRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> A Conciliar...</> : <><Cpu className="mr-2 h-4 w-4"/>Conciliar XML vs Sienge</>}
                    </Button>
                </div>
                
                <Tabs defaultValue="reconciliation">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="reconciliation" disabled={!reconciliationResults}>Conciliação de Itens</TabsTrigger>
                        <TabsTrigger value="cfop_validation" disabled={!reconciliationResults}>Validação de CFOP</TabsTrigger>
                        <TabsTrigger value="tax_check" disabled={!siengeDataForTaxCheck}>Conferência de Impostos</TabsTrigger>
                    </TabsList>
                    <TabsContent value="reconciliation" className="mt-4">
                         {!processedData?.sheets['Itens Válidos'] && (
                             <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Dados XML em falta</AlertTitle>
                                <AlertDescription>
                                    Processe os XMLs na primeira aba para habilitar a conciliação.
                                </AlertDescription>
                            </Alert>
                        )}
                        {reconciliationResults ? (
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
                                            <DataTable columns={getColumnsForDivergentTabs(reconciliationResults.onlyInSienge)} data={reconciliationResults.onlyInSienge} />
                                        </TabsContent>
                                        <TabsContent value="onlyInXml">
                                            <Button onClick={() => handleDownload(reconciliationResults.onlyInXml, 'Itens_Apenas_XML')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInXml.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumnsForDivergentTabs(reconciliationResults.onlyInXml)} data={reconciliationResults.onlyInXml} />
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                                <FileSearch className="h-12 w-12 text-primary" />
                                <p className="mt-4 text-center">Carregue a planilha "Itens do Sienge" e clique no botão "Conciliar XML vs Sienge" para ver os resultados.</p>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="cfop_validation" className="mt-4">
                        <p className='text-sm text-muted-foreground mb-4'>A tabela abaixo mostra **apenas** os itens que foram conciliados com sucesso. Utilize-a para validar se o CFOP do XML corresponde ao CFOP utilizado no Sienge.</p>
                         <CfopValidator 
                            items={reconciledWithInfo || []} 
                            allPersistedData={processedData?.imobilizadoClassifications || {}}
                            onPersistData={() => {}} // A persistência é gerida a nível superior
                            competence={processedData?.competence || null}
                        />
                    </TabsContent>
                    <TabsContent value="tax_check" className="mt-4">
                        <SiengeTaxCheck siengeData={siengeDataForTaxCheck} />
                    </TabsContent>
                </Tabs>
            </CardContent>
         </Card>
    );
}
