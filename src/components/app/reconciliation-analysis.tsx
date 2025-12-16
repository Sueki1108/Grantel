
"use client";

import React, { useMemo, useState, ChangeEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ProcessedData } from '@/lib/excel-processor';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GitCompareArrows, AlertTriangle, Download, FileSearch, Loader2, Cpu, FileCog } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns, getColumnsForDivergentTabs } from "@/lib/columns-helper";
import { SiengeTaxCheck } from './sienge-tax-check';
import { CfopValidator } from './cfop-validator';
import type { AllClassifications } from '@/lib/types';
import { FileUploadForm } from './file-upload-form';
import * as XLSX from 'xlsx';
import { CostCenterAnalysis } from './cost-center-analysis';


interface ReconciliationAnalysisProps {
    processedData: ProcessedData | null;
    siengeFile: File | null;
    onSiengeFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    onRunReconciliation: () => void;
    isReconciliationRunning: boolean;
    costCenterFile: File | null;
    onCostCenterFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearCostCenterFile: () => void;
    accountingFile: File | null;
    onAccountingFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearAccountingFile: () => void;
    allClassifications: AllClassifications;
    onPersistClassifications: (allData: AllClassifications) => void;
    competence: string | null;
}


export function ReconciliationAnalysis({ 
    processedData, 
    siengeFile, 
    onSiengeFileChange, 
    onClearSiengeFile,
    onRunReconciliation,
    isReconciliationRunning,
    costCenterFile,
    onCostCenterFileChange,
    onClearCostCenterFile,
    accountingFile,
    onAccountingFileChange,
    onClearAccountingFile,
    allClassifications,
    onPersistClassifications,
    competence,
}: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    
    const { reconciliationResults, siengeDataForTaxCheck, devolucoesEP, itensValidosSaidas } = useMemo(() => {
        return {
            reconciliationResults: processedData?.reconciliationResults,
            siengeDataForTaxCheck: processedData?.siengeSheetData,
            devolucoesEP: processedData?.reconciliationResults?.devolucoesEP,
            itensValidosSaidas: processedData?.sheets?.['Itens Válidos Saídas'] || [],
        };
    }, [processedData]);
    
    const handleDownload = async (data: any[], title: string) => {
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
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <GitCompareArrows className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">XML VS Sienge</CardTitle>
                            <CardDescription>Carregue as planilhas Sienge, Contabilização e de Centro de Custo para cruzar informações com os XMLs processados.</CardDescription>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className='grid grid-cols-1 md:grid-cols-3 gap-6 items-start'>
                    <div className='space-y-2'>
                        <h3 className='font-medium'>Planilha do Sienge</h3>
                        <FileUploadForm
                            displayName="Itens do Sienge"
                            formId="sienge-for-reconciliation"
                            files={{ 'sienge-for-reconciliation': !!siengeFile }}
                            onFileChange={onSiengeFileChange}
                            onClearFile={onClearSiengeFile}
                        />
                         <Button onClick={() => handleDownload(processedData?.siengeDebugKeys || [], 'Depuracao_Sienge')} size="sm" variant="outline" disabled={!processedData?.siengeDebugKeys || processedData.siengeDebugKeys.length === 0}><Download className='h-4 w-4 mr-2' />Baixar Chaves de Depuração</Button>
                    </div>
                    <CostCenterAnalysis
                        costCenterFile={costCenterFile}
                        onCostCenterFileChange={onCostCenterFileChange}
                        onClearCostCenterFile={onClearCostCenterFile}
                        processedData={processedData}
                        onDownloadDebug={() => handleDownload(processedData?.costCenterDebugKeys || [], 'Depuracao_CentroCusto')}
                    />
                    <div className='space-y-2'>
                         <h3 className='font-medium'>Planilha de Contabilização</h3>
                         <FileUploadForm
                            displayName="Contabilização"
                            formId="accounting"
                            files={{ 'accounting': !!accountingFile }}
                            onFileChange={onAccountingFileChange}
                            onClearFile={onClearAccountingFile}
                        />
                         <Button onClick={() => handleDownload(processedData?.accountingDebugKeys || [], 'Depuracao_Contabilizacao')} size="sm" variant="outline" disabled={!processedData?.accountingDebugKeys || processedData.accountingDebugKeys.length === 0}><Download className='h-4 w-4 mr-2' />Baixar Chaves de Depuração</Button>
                    </div>
                </div>
                
                 <div className="flex flex-col sm:flex-row gap-2 pt-4">
                     <Button onClick={onRunReconciliation} disabled={isReconciliationRunning || !siengeFile || !processedData?.sheets['Itens Válidos']}>
                        {isReconciliationRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Conciliando...</> : <><Cpu className="mr-2 h-4 w-4"/>Conciliar XML vs Sienge</>}
                    </Button>
                </div>
                
                <Tabs defaultValue="reconciliation">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="reconciliation" disabled={!reconciliationResults}>Conciliação de Itens</TabsTrigger>
                        <TabsTrigger value="devolucoes-ep" disabled={!devolucoesEP || devolucoesEP.length === 0}>
                            Devoluções - EP
                        </TabsTrigger>
                        <TabsTrigger value="tax_check" disabled={!siengeDataForTaxCheck}>Conferência de Impostos</TabsTrigger>
                        <TabsTrigger value="cfop_validation" disabled={!reconciliationResults}>Validação CFOP</TabsTrigger>
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
                                            <DataTable columns={getColumns(reconciliationResults.reconciled, ['Fornecedor', 'Número da Nota', 'Descrição', 'Valor Total', 'CFOP', 'CFOP (Sienge)', 'Centro de Custo', 'Contabilização', 'Observações'])} data={reconciliationResults.reconciled} />
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
                            nfeValidasData={processedData?.sheets?.['Notas Válidas'] || []}
                            originalXmlItems={processedData?.sheets?.['Original - Itens'] || []}
                            itensSaidas={itensValidosSaidas}
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
