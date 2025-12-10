"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { type ProcessedData } from '@/lib/excel-processor';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GitCompareArrows, AlertTriangle, Download, FileSearch, Loader2, Cpu, BarChart, Ticket, X, RotateCw, HelpCircle, FileDown, Database, Undo2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/components/app/data-table-columns";
import { SiengeTaxCheck } from './sienge-tax-check';
import { ColumnDef } from '@tanstack/react-table';
import { CfopValidator } from './cfop-validator';
import type { AllClassifications, DifalStatus } from '@/lib/types';


interface ReconciliationAnalysisProps {
    processedData: ProcessedData | null;
    siengeFile: File | null;
    onSiengeFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    onRunReconciliation: () => void;
    isReconciliationRunning: boolean;
    allClassifications: AllClassifications;
    onPersistClassifications: (allData: AllClassifications) => void;
    onDownloadSiengeDebugKeys: () => void;
    competence: string | null;
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
    isReconciliationRunning,
    allClassifications,
    onPersistClassifications,
    onDownloadSiengeDebugKeys,
    competence
}: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    
    const { reconciliationResults, siengeDataForTaxCheck, devolucoesEP } = useMemo(() => {
        return {
            reconciliationResults: processedData?.reconciliationResults,
            siengeDataForTaxCheck: processedData?.siengeSheetData,
            devolucoesEP: processedData?.reconciliationResults?.devolucoesEP,
        };
    }, [processedData]);

    const difalItems = useMemo(() => {
        const cfopValidations = (competence && allClassifications[competence]?.cfopValidations?.classifications) || {};
        return (processedData?.reconciliationResults?.reconciled || []).filter(item => {
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            return cfopValidations[uniqueKey]?.isDifal === true;
        });
    }, [processedData?.reconciliationResults?.reconciled, competence, allClassifications]);
    
    const handleDifalStatusChange = (itemsToUpdate: any[], newStatus: DifalStatus) => {
        if (!competence) return;

        const newClassifications = { ...allClassifications };
        if (!newClassifications[competence]) newClassifications[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {}}, supplierClassifications: {} };
        if (!newClassifications[competence].difalValidations) newClassifications[competence].difalValidations = { classifications: {} };
        
        itemsToUpdate.forEach(item => {
            const itemKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            newClassifications[competence].difalValidations!.classifications[itemKey] = { status: newStatus };
        });

        onPersistClassifications(newClassifications);
        toast({ title: 'Classificação DIFAL atualizada!'});
    };
    
    const handleDownload = async (data: any[], title: string) => {
        if (!data || data.length === 0) {
            toast({ title: "Nenhum dado para exportar", description: `Não há itens na aba "${title}".` });
            return;
        }
        const XLSX = await import('xlsx');
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
                        <CardDescription>Carregue a planilha Sienge para cruzar informações com os XMLs processados.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className='grid grid-cols-1 gap-6 items-end'>
                    <FileUploadForm
                        displayName="Itens do Sienge"
                        formId="sienge-for-reconciliation"
                        files={{ 'sienge-for-reconciliation': !!siengeFile }}
                        onFileChange={onSiengeFileChange}
                        onClearFile={onClearSiengeFile}
                    />
                </div>
                <div className='flex flex-col sm:flex-row gap-2 pt-4'>
                    <Button onClick={onRunReconciliation} disabled={!siengeFile || !processedData || isReconciliationRunning} className="w-full">
                        {isReconciliationRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> A Conciliar...</> : <><Cpu className="mr-2 h-4 w-4"/>Conciliar XML vs Sienge</>}
                    </Button>
                    <Button onClick={onDownloadSiengeDebugKeys} disabled={!siengeFile} variant="outline" className="w-full sm:w-auto">
                        <Database className="mr-2 h-4 w-4"/>Gerar Chaves de Depuração (Sienge)
                    </Button>
                </div>
                
                <Tabs defaultValue="reconciliation">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="reconciliation" disabled={!reconciliationResults}>Conciliação de Itens</TabsTrigger>
                        <TabsTrigger value="devolucoes-ep" disabled={!devolucoesEP || devolucoesEP.length === 0}>
                            <Undo2 className="h-4 w-4 mr-2"/>Devoluções - EP
                        </TabsTrigger>
                        <TabsTrigger value="tax_check" disabled={!siengeDataForTaxCheck}>Conferência de Impostos</TabsTrigger>
                        <TabsTrigger value="cfop_validation" disabled={!reconciliationResults}><BarChart className='h-4 w-4 mr-2'/>Validação CFOP</TabsTrigger>
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
                                    <TabsList className="grid w-full grid-cols-4">
                                        <TabsTrigger value="reconciled">Conciliados ({reconciliationResults.reconciled.length})</TabsTrigger>
                                        <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                        <TabsTrigger value="onlyInXml">Apenas no XML ({reconciliationResults.onlyInXml.length})</TabsTrigger>
                                        <TabsTrigger value="otherSiengeItems">Outros Lançamentos Sienge</TabsTrigger>
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
                                        <TabsContent value="otherSiengeItems">
                                             <Tabs defaultValue={Object.keys(reconciliationResults.otherSiengeItems)[0]} className="w-full">
                                                <TabsList>
                                                    {Object.entries(reconciliationResults.otherSiengeItems).map(([esp, items]) => (
                                                        <TabsTrigger key={esp} value={esp}>{esp} ({items.length})</TabsTrigger>
                                                    ))}
                                                </TabsList>
                                                {Object.entries(reconciliationResults.otherSiengeItems).map(([esp, items]) => (
                                                    <TabsContent key={esp} value={esp} className='mt-4'>
                                                         <Button onClick={() => handleDownload(items, `Outros_Sienge_${esp}`)} size="sm" className="mb-4" disabled={items.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                                         <DataTable columns={getColumns(items)} data={items} />
                                                    </TabsContent>
                                                ))}
                                            </Tabs>
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                                <FileSearch className="h-12 w-12 text-primary" />
                                <p className="mt-4 text-center">Carregue as planilhas e clique no botão "Conciliar XML vs Sienge" para ver os resultados.</p>
                            </div>
                        )}
                    </TabsContent>
                     <TabsContent value="devolucoes-ep" className="mt-4">
                        {devolucoesEP && devolucoesEP.length > 0 ? (
                           <div>
                                <Button onClick={() => handleDownload(devolucoesEP, 'Devolucoes_EP')} size="sm" className="mb-4"><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                <DataTable columns={getColumns(devolucoesEP)} data={devolucoesEP} />
                           </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                                <FileSearch className="h-12 w-12 text-primary" />
                                <p className="mt-4 text-center">Nenhuma devolução de emissão própria foi encontrada ou a conciliação ainda não foi executada.</p>
                            </div>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="tax_check" className="mt-4">
                        <SiengeTaxCheck siengeData={siengeDataForTaxCheck} />
                    </TabsContent>
                    
                    <TabsContent value="cfop_validation" className="mt-4">
                        <CfopValidator 
                            items={reconciliationResults?.reconciled || []}
                            originalXmlItems={processedData?.sheets['Itens Válidos'] || []}
                            allPersistedData={allClassifications}
                            onPersistData={onPersistClassifications}
                            competence={competence}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
         </Card>
    );
}

// Sub-component for DIFAL Analysis
interface DifalItemsAnalysisProps {
    items: any[];
    allClassifications: AllClassifications;
    competence: string | null;
    onClassificationChange: (items: any[], newStatus: DifalStatus) => void;
}
